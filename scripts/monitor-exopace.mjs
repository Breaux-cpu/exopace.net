import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const CHROME = process.env.CHROME_PATH || (process.platform === "win32"
  ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  : "google-chrome");
const PORT = Number(process.env.EXO_MONITOR_PORT || 9337);

const ROUTES = [
  ["https://exopace.net", "/", "/mission/"],
  ["https://exopace.net", "/mission/", "/mission/"],
  ["https://exopace.net", "/lock/25544", "/mission/?lock=25544"],
  ["https://exopace.net", "/radio/", "/radio/"],
  ["https://exopace.net", "/mesh/", "/mesh/"],
  ["https://exopace.net", "/maps/", "/maps/"],
  ["https://exopace.net", "/cameras/", "/cameras/"],
  ["https://exopace.net", "/sentinel/", "/sentinel/"],
  ["https://exopace.net", "/404", "/404"],
  ["https://cams.exopace.net", "/account", "/account"],
  ["https://cams.exopace.net", "/privacy", "/privacy"],
  ["https://cams.exopace.net", "/terms", "/terms"],
  ["https://cams.exopace.net", "/api/health", "health"],
];

const VIEWPORTS = [
  ["1440x900", 1440, 900, false],
  ["390x844", 390, 844, true],
];

function fail(row, reason) {
  row.ok = false;
  row.note = reason;
  process.exitCode = 1;
}

function attach(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const job = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) job.reject(new Error(JSON.stringify(msg.error)));
      else job.resolve(msg.result || {});
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  });
  const listeners = new Set();
  return {
    on(fn) { listeners.add(fn); },
    send(method, params = {}) {
      const msgId = ++id;
      return new Promise((resolve, reject) => {
        pending.set(msgId, { resolve, reject });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });
    },
  };
}

async function health(url) {
  const res = await fetch(url, { redirect: "manual" });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, ok: body.ok === true };
}

async function main() {
  const healthRow = { view: "fetch", route: "/api/health", href: "", cls: "", overflow: "", bar: "", console: "", ok: true, note: "" };
  try {
    const hit = await health("https://cams.exopace.net/api/health");
    healthRow.href = String(hit.status);
    if (!hit.ok) fail(healthRow, "not ok");
  } catch (err) {
    fail(healthRow, String(err && err.message || err));
  }

  const dir = await mkdtemp(join(tmpdir(), "exo-monitor-"));
  const chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`,
    "--no-first-run",
    "--disable-gpu",
    "about:blank",
  ], { stdio: "ignore" });
  let page;
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) break;
    } catch {}
    await sleep(250);
  }
  if (!page) {
    chrome.kill();
    throw new Error("Chrome did not open a page target");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("cdp socket failed")), { once: true });
  });
  const cdp = attach(ws);
  const errors = [];
  cdp.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const text = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text || "exception";
      errors.push(String(text).split("\n")[0]);
    } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
      errors.push(msg.params.args.map((arg) => arg.value || arg.description || "").join(" ").split("\n")[0]);
    }
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__exoCls=0;try{new PerformanceObserver(function(l){for(const e of l.getEntries()){if(!e.hadRecentInput)window.__exoCls+=e.value}}).observe({type:'layout-shift',buffered:true})}catch(e){}",
  });

  async function evalJson(expression) {
    const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true });
    return result.result ? result.result.value : null;
  }

  const rows = [healthRow];
  for (const [name, width, height, mobile] of VIEWPORTS) {
    await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
    for (const [origin, path, expect] of ROUTES) {
      if (expect === "health") continue;
      errors.length = 0;
      const row = { view: name, route: origin.replace("https://", "") + path, href: "", cls: "", overflow: "", bar: "", console: "clean", ok: true, note: "" };
      rows.push(row);
      await cdp.send("Page.navigate", { url: origin + path });
      const deadline = Date.now() + 15000;
      let href = "";
      while (Date.now() < deadline) {
        await sleep(250);
        href = (await evalJson("location.pathname + location.search")) || "";
        if (href && href !== "blank") break;
      }
      await sleep(1800);
      href = (await evalJson("location.pathname + location.search")) || href;
      const cls = Number(await evalJson("window.__exoCls")) || 0;
      const metrics = await evalJson(`(() => {
        const doc = document.documentElement;
        const bar = document.querySelector(".exo-bar, .site-header");
        return { overflow: doc.scrollWidth - doc.clientWidth, bar: bar ? Math.round(bar.getBoundingClientRect().height) : 0 };
      })()`) || { overflow: -1, bar: 0 };
      row.href = href;
      row.cls = cls.toFixed(4);
      row.overflow = String(metrics.overflow);
      row.bar = metrics.bar ? String(metrics.bar) : "—";
      const noise = errors.filter((line) => !/favicon|Failed to load resource|net::ERR/i.test(line));
      if (noise.length) {
        row.console = noise[0].slice(0, 80);
        fail(row, "console");
      }
      const wantPath = expect.split("?")[0];
      if (!String(href).startsWith(wantPath)) fail(row, "href " + href);
      if (expect.includes("lock=25544") && !String(href).includes("lock=25544")) fail(row, "lock dropped");
      if (cls >= 0.05) fail(row, "cls");
      if (metrics.overflow > 1) fail(row, "overflow");
      if (metrics.bar > 60) fail(row, "bar");
    }
  }

  ws.close();
  const head = ["VIEW", "ROUTE", "HREF", "CLS", "OVERFLOW", "BAR", "CONSOLE", "OK"];
  console.log(head.join("\t"));
  for (const row of rows) {
    console.log([row.view, row.route, row.href, row.cls, row.overflow, row.bar, row.console, row.ok ? "pass" : "FAIL " + row.note].join("\t"));
  }
  chrome.kill();
  await sleep(400);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
}

main().catch((err) => {
  console.log("FAIL " + (err && err.stack || err));
  process.exitCode = 1;
});
