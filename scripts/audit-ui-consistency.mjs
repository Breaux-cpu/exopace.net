// Computed-style parity audit. Headless Chrome, two viewports, no network deps.
import { spawn } from "node:child_process";

const chrome = process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const port = Number(process.env.AUDIT_PORT || 9347);
const host = process.argv[2] || "http://127.0.0.1:4181";
const pages = (process.argv[3] || "/radio/,/mesh/,/maps/,/cameras/,/sentinel/,/404,/radio/unlock.html,/maps/legend.html").split(",");
const viewports = [
  { w: 1440, h: 900, name: "1440x900" },
  { w: 390, h: 844, name: "390x844" },
];

const expr = `(() => {
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width >= 2 && r.height >= 2;
  };
  const fails = [];
  const body = getComputedStyle(document.body);
  const bg = body.backgroundColor.replace(/\\s/g, "");
  if (bg !== "rgb(4,7,13)") fails.push("body.bg " + body.backgroundColor);
  if (!body.fontFamily.toLowerCase().includes("ibm plex sans")) fails.push("body.font " + body.fontFamily);
  const bar = document.querySelector("header.exo-bar, .exo-bar");
  if (!bar) fails.push("header.missing");
  else {
    const h = bar.getBoundingClientRect().height;
    if (Math.abs(h - 57) > 1) fails.push("header.h " + h.toFixed(2));
  }
  for (const el of document.querySelectorAll("button")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const radius = px(s.borderTopLeftRadius);
    const minH = px(s.minHeight);
    const h = el.getBoundingClientRect().height;
    if (radius !== 10) fails.push("button.radius " + (el.id || el.className || el.textContent || "").toString().trim().slice(0, 40) + " " + s.borderTopLeftRadius);
    if (!(minH >= 44) && !(h >= 44)) fails.push("button.min " + (el.id || el.className || "").toString().trim().slice(0, 40) + " min " + s.minHeight + " h " + h.toFixed(1));
  }
  for (const el of document.querySelectorAll(".card, .exo-card, .sn-card, .fm-dock, .sheet, .w, .exo-panel")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (px(s.borderTopLeftRadius) !== 16) fails.push("card.radius " + (el.id || el.className || "").toString().trim().slice(0, 40) + " " + s.borderTopLeftRadius);
  }
  const clips = [];
  for (const el of document.querySelectorAll("button, a, input, h1, h2, label, summary")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    const cutX = (s.overflowX === "hidden" || s.overflowX === "clip" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1;
    const cutY = (s.overflowY === "hidden" || s.overflowY === "clip") && el.scrollHeight > el.clientHeight + 2 && el.childElementCount === 0;
    if (cutX || cutY) clips.push((el.id || el.className || el.tagName) + ":" + (el.textContent || "").trim().slice(0, 24));
  }
  const overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;
  return {
    fails: fails.slice(0, 12),
    failCount: fails.length,
    clips: clips.slice(0, 8),
    clipCount: clips.length,
    overflow,
    cls: window.__cls || 0,
    buttons: [...document.querySelectorAll("button")].filter(visible).length,
    cards: [...document.querySelectorAll(".card, .exo-card, .sn-card, .fm-dock, .sheet, .w, .exo-panel")].filter(visible).length,
  };
})()`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

const proc = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--disable-extensions",
  `--remote-debugging-port=${port}`,
  "--window-size=1440,900",
  "about:blank",
], { stdio: "ignore" });

async function json(pathname, opts) {
  const res = await fetch(`http://127.0.0.1:${port}${pathname}`, opts);
  const text = await res.text();
  try { return JSON.parse(text); } catch { throw new Error(text.slice(0, 240)); }
}

const deadline = Date.now() + 15000;
let ready = false;
while (Date.now() < deadline) {
  try { await json("/json/version"); ready = true; break; } catch { await sleep(200); }
}
if (!ready) {
  console.error("chrome debug port never opened");
  proc.kill();
  process.exit(1);
}

const rows = [];
let bad = 0;

try {
  const tab = await json("/json/new?" + new URLSearchParams({ url: "about:blank" }), { method: "PUT" });
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener("open", res); ws.addEventListener("error", rej); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const msgId = ++id;
    const timer = setTimeout(() => { pending.delete(msgId); reject(new Error("cdp timeout " + method)); }, 20000);
    pending.set(msgId, (msg) => { clearTimeout(timer); resolve(msg); });
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
  await send("Page.enable");
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__cls=0;try{new PerformanceObserver((l)=>{for (const e of l.getEntries()) if(!e.hadRecentInput) window.__cls+=e.value}).observe({type:'layout-shift',buffered:true});}catch(e){}",
  });
  for (const vp of viewports) {
    await send("Emulation.setDeviceMetricsOverride", { width: vp.w, height: vp.h, deviceScaleFactor: 1, mobile: vp.w < 500 });
    for (const page of pages) {
      const url = host.replace(/\/$/, "") + page;
      await send("Page.navigate", { url });
      await sleep(page.includes("/maps/") ? 4000 : 2200);
      const evaled = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
      const value = evaled.result?.result?.value;
      const err = evaled.result?.exceptionDetails?.text || (value ? "" : JSON.stringify(evaled.result).slice(0, 240));
      const row = { vp: vp.name, page, url, ...(value || {}), error: err };
      const pass = value && value.failCount === 0 && value.clipCount === 0 && !value.overflow && value.cls < 0.05 && !err;
      row.pass = !!pass;
      if (!pass) bad += 1;
      rows.push(row);
      console.log((pass ? "PASS" : "FAIL") + " " + vp.name + " " + page + " " + JSON.stringify(value || err));
    }
  }
  ws.close();
} finally {
  proc.kill();
}

console.log("SUMMARY " + (rows.length - bad) + "/" + rows.length + " pass");
process.exit(bad === 0 ? 0 : 1);
