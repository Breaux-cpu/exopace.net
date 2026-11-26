#!/usr/bin/env node
/**
 * Overlap + flow harness for EXOpace pages.
 *
 *   node scripts/qa-layout.mjs
 *   node scripts/qa-layout.mjs --pages system,404,maintenance
 *   node scripts/qa-layout.mjs --overlap-only
 *   node scripts/qa-layout.mjs --flows-only
 *   node scripts/qa-layout.mjs --shots --shot-dir /workspace/exopace-fold-shots
 *   node scripts/qa-layout.mjs --port 8765 --base http://127.0.0.1:8765
 *
 * Helpers add page flows in scripts/qa-flows/<name>.mjs as:
 *   export const flows = { maps: [ { name, test: async (page) => ({ ok, detail, untestable, skip }) } ] }
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { VIEWPORTS, PAGES, SHOT_VIEWPORTS } from "./qa-viewports.mjs";
import { crawlSite } from "./qa-site-flow.mjs";
import { collectOverlap } from "./qa-overlap.js";
import { genericChrome, flows as shellFlows } from "./qa-flows/shell.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function loadPuppeteer() {
  const candidates = [
    "/tmp/exo-shots-tools/node_modules/puppeteer-core",
    path.join(ROOT, "node_modules/puppeteer-core"),
    "puppeteer-core",
    "puppeteer",
  ];
  for (const c of candidates) {
    try { return require(c); } catch (_) {}
  }
  throw new Error("Install puppeteer-core (see HANDOFF.md). Looked in " + candidates.join(", "));
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

function startServer(root, port) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    let file = decodeURIComponent(url.pathname);
    if (file.endsWith("/")) file += "index.html";
    const full = path.normalize(path.join(root, file));
    if (!full.startsWith(root)) { res.writeHead(403); res.end(); return; }
    fs.readFile(full, (err, data) => {
      if (err) {
        if (file !== "/404.html") {
          fs.readFile(path.join(root, "404.html"), (err2, data2) => {
            if (err2) { res.writeHead(404); res.end("not found"); return; }
            res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
            res.end(data2);
          });
          return;
        }
        res.writeHead(404); res.end("not found"); return;
      }
      const ext = path.extname(full);
      res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}

function parseArgs(argv) {
  const out = { pages: null, overlapOnly: false, flowsOnly: false, shots: false, shotDir: "/workspace/exopace-fold-shots", port: 8765, base: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--overlap-only") out.overlapOnly = true;
    else if (a === "--flows-only") out.flowsOnly = true;
    else if (a === "--shots") out.shots = true;
    else if (a === "--pages") out.pages = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--shot-dir") out.shotDir = argv[++i];
    else if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--base") out.base = argv[++i];
  }
  return out;
}

async function loadExtraFlows() {
  const dir = path.join(__dirname, "qa-flows");
  const merged = { ...shellFlows };
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".mjs") || name === "shell.mjs") continue;
    try {
      const mod = await import(pathToFileURL(path.join(dir, name)).href);
      const extra = mod.flows || {};
      for (const [k, list] of Object.entries(extra)) {
        merged[k] = (merged[k] || []).concat(list);
      }
    } catch (err) {
      console.warn("could not load flow module", name, err.message);
    }
  }
  return merged;
}

async function preparePage(page, meta, vp) {
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console " + msg.text());
  });
  await page.setViewport({
    width: vp.w,
    height: vp.h,
    deviceScaleFactor: vp.dpr,
    isMobile: !!vp.touch,
    hasTouch: !!vp.touch,
  });
  await page.evaluateOnNewDocument((safe) => {
    const style = document.createElement("style");
    style.dataset.exoSafe = "1";
    style.textContent = `:root{--exo-safe-top:${safe.top}px;--exo-safe-bottom:${safe.bottom}px;--exo-safe-left:${safe.left || 0}px;--exo-safe-right:${safe.right || 0}px;}`;
    document.addEventListener("DOMContentLoaded", () => document.head.appendChild(style));
    if (document.head) document.head.appendChild(style);
  }, vp.safe || { top: 0, bottom: 0 });
  return errors;
}

async function openPath(page, base, meta) {
  const url = base + meta.path;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (meta.boot) {
    await page.evaluate(() => {
      const boot = document.getElementById("boot-void");
      if (boot) { boot.classList.add("out"); boot.setAttribute("hidden", ""); boot.style.display = "none"; }
      document.documentElement.classList.remove("exo-booting");
    });
  }
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await page.evaluate(() => {
    if (window.EXO_LAYOUT && window.EXO_LAYOUT.publishDockHeight) window.EXO_LAYOUT.publishDockHeight();
  }).catch(() => {});
  await new Promise((r) => setTimeout(r, 250));
  if (meta.boot) {
    // Wait until compact Mission chrome is parked in the sheet so overlap
    // is measured at rest, not while FLY/CINE still sit on the globe.
    await page.waitForFunction(() => {
      const compact = window.matchMedia("(max-width: 1099px), (max-height: 500px)").matches;
      const strip = document.querySelector(".hud .camstrip, #mi-sheet .camstrip");
      if (!compact) return !!strip || !!document.querySelector(".hud");
      return !!(strip && strip.closest("#mi-sheet"));
    }, { timeout: 8000 }).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function checkOverlap(page) {
  return page.evaluate(collectOverlap);
}

function expectedConsole(text) {
  return /404|Failed to load resource|net::ERR|health|spaceweather|api\/traffic|api\//i.test(text);
}

async function main() {
  const args = parseArgs(process.argv);
  const puppeteer = loadPuppeteer();
  const chrome = process.env.CHROME || process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable";
  let server = null;
  let base = args.base;
  if (!base) {
    server = await startServer(ROOT, args.port);
    base = "http://127.0.0.1:" + args.port;
  }
  const pages = args.pages ? PAGES.filter((p) => args.pages.includes(p.name)) : PAGES;
  const allFlows = await loadExtraFlows();
  if (args.shots) fs.mkdirSync(args.shotDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"]
  });

  const overlapRows = [];
  const flowRows = [];
  let overlapFail = 0;
  let flowFail = 0;

  try {
    if (!args.overlapOnly) {
      const crawl = await crawlSite(base);
      flowRows.push({ page: "site", vp: "all", ok: crawl.ok, flow: "internal links and orphans", skip: "", untestable: "", detail: crawl.detail });
      if (!crawl.ok) flowFail++;
    }
    for (const meta of pages) {
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage();
        const errors = await preparePage(page, meta, vp);
        try {
          await openPath(page, base, meta);
        } catch (err) {
          overlapRows.push({ page: meta.name, vp: vp.id, ok: false, failures: [{ type: "nav", a: String(err) }], count: 0 });
          overlapFail++;
          await page.close();
          continue;
        }
        if (!args.flowsOnly) {
          const result = await checkOverlap(page);
          const dock = await page.evaluate(() => {
            const actions = document.querySelector(".exo-pill-actions");
            if (!actions) return { skip: true };
            const st = getComputedStyle(actions);
            if (st.position !== "fixed" || st.display === "none") return { skip: true };
            const measured = Math.round(actions.getBoundingClientRect().height);
            const reserved = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
            const published = getComputedStyle(document.documentElement).getPropertyValue("--exo-dock-real").trim();
            return { measured, reserved, published };
          });
          if (!dock.skip && dock.reserved < dock.measured - 1) {
            result.failures.push({
              type: "dock-reserve",
              a: "padding-bottom " + dock.reserved + "px < dock " + dock.measured + "px ( --exo-dock-real: " + dock.published + ")"
            });
          }
          if (vp.w <= 360) {
            const nav = await page.evaluate(() => {
              const sys = [...document.querySelectorAll(".exo-sites a")].find((a) => /SYSTEM/i.test(a.textContent || ""));
              const strip = document.querySelector(".exo-sites");
              if (!sys || !strip) return { skip: true };
              sys.scrollIntoView({ inline: "end", block: "nearest" });
              const r = sys.getBoundingClientRect();
              return {
                fullyInView: r.left >= -1 && r.right <= window.innerWidth + 1,
                right: Math.round(r.right),
                vw: window.innerWidth,
                canScroll: strip.scrollWidth > strip.clientWidth + 1
              };
            });
            if (!nav.skip && !nav.fullyInView) {
              result.failures.push({
                type: "nav-clip",
                a: "SYSTEM right=" + nav.right + " vw=" + nav.vw + (nav.canScroll ? " (scroll did not reveal)" : "")
              });
            }
          }
          const ok = result.failures.length === 0;
          if (!ok) overlapFail++;
          overlapRows.push({ page: meta.name, vp: vp.id, ok, failures: result.failures, count: result.count });
        }
        if (args.shots && SHOT_VIEWPORTS.includes(vp.id)) {
          const file = path.join(args.shotDir, `${meta.name}-${vp.id}.png`);
          await page.screenshot({ path: file, type: "png" });
        }
        await page.close();
      }

      if (!args.overlapOnly) {
        const vp = VIEWPORTS.find((v) => v.id === "pixel") || VIEWPORTS[0];
        const desk = VIEWPORTS.find((v) => v.id === "desktop");
        for (const slot of [vp, desk]) {
          const list = (allFlows[meta.name] || []).concat(genericChrome);
          if (!list.length) continue;
          const page = await browser.newPage();
          const errors = await preparePage(page, meta, slot);
          try {
            await openPath(page, base, meta);
          } catch (err) {
            flowRows.push({ page: meta.name, vp: slot.id, flow: "(load)", ok: false, detail: String(err) });
            flowFail++;
            await page.close();
            continue;
          }
          for (const flow of list) {
            try {
              const out = await flow.test(page) || {};
              const unexpected = errors.filter((e) => !expectedConsole(e));
              const ok = out.ok !== false && unexpected.length === 0;
              if (!ok) flowFail++;
              flowRows.push({
                page: meta.name,
                vp: slot.id,
                flow: flow.name,
                ok,
                skip: out.skip || "",
                untestable: out.untestable || "",
                detail: (out.detail || "") + (unexpected.length ? " console:" + unexpected.slice(0, 2).join(" | ") : "")
              });
            } catch (err) {
              flowFail++;
              flowRows.push({ page: meta.name, vp: slot.id, flow: flow.name, ok: false, detail: String(err) });
            }
          }
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
    if (server) server.close();
  }

  const pad = (s, n) => String(s).padEnd(n);
  console.log("\n== Overlap (page x viewport) ==");
  console.log(pad("page", 14), pad("viewport", 18), pad("ok", 6), "failures");
  for (const row of overlapRows) {
    const fail = row.failures.map((f) => f.type + ":" + (f.a || "") + (f.b ? "×" + f.b : "")).join("; ");
    console.log(pad(row.page, 14), pad(row.vp, 18), pad(row.ok ? "PASS" : "FAIL", 6), fail || row.count + " controls");
  }
  if (!args.overlapOnly) {
    console.log("\n== Flows ==");
    console.log(pad("page", 14), pad("vp", 10), pad("ok", 6), pad("flow", 42), "notes");
    for (const row of flowRows) {
      const notes = [row.skip && "skip: " + row.skip, row.untestable && "untestable: " + row.untestable, row.detail].filter(Boolean).join(" | ");
      console.log(pad(row.page, 14), pad(row.vp, 10), pad(row.ok ? "PASS" : "FAIL", 6), pad(row.flow, 42), notes);
    }
  }
  const outFile = process.env.QA_OUT || "/workspace/exopace-shared/qa-layout-last.json";
  fs.writeFileSync(outFile, JSON.stringify({ overlapRows, flowRows, overlapFail, flowFail }, null, 2));
  console.log("\nWrote", outFile);
  console.log("overlap failures:", overlapFail, "flow failures:", flowFail);
  if (overlapFail || flowFail) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
