/* Radio-group flows: /radio, /radio/unlock.html, /mesh, /sentinel.
   Hardware paths (Web Bluetooth, Web Serial, WebUSB) are checked up to the honest
   unsupported / picker state only. Nothing here creates detections or radio data. */
import { collectOverlap } from "../qa-overlap.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
/* Collisions are checked at rest (every scroller at the top): a sticky strip that content
   scrolls beneath is not a collision. */
async function overlapClean(page) {
  await page.evaluate(() => { document.querySelectorAll("*").forEach((el) => { if (el.scrollTop) el.scrollTop = 0; }); window.scrollTo(0, 0); });
  await wait(80);
  const r = await page.evaluate(collectOverlap);
  return { ok: r.failures.length === 0, detail: r.failures.slice(0, 3).map((f) => f.type + ":" + f.a + (f.b ? "×" + f.b : "")).join("; ") };
}
const isPhone = (page) => page.evaluate(() => matchMedia("(max-width: 719.98px)").matches);
async function tap(page, sel) {
  const ok = await page.evaluate((s) => { const el = document.querySelector(s); if (!el) return false; el.scrollIntoView({ block: "center" }); return true; }, sel);
  if (!ok) throw new Error("missing " + sel);
  await wait(60);
  await page.click(sel);
  await wait(180);
}
async function textOf(page, sel) { return page.$eval(sel, (el) => (el.textContent || "").trim()); }

const radio = [
  {
    name: "every workspace × tool tab opens its panel, layout stays clean",
    test: async (page) => {
      const wsHrefs = await page.$$eval(".rg-ws a[data-tab]", (as) => as.map((a) => a.dataset.tab));
      const bad = [];
      let n = 0;
      for (const ws of wsHrefs) {
        await tap(page, `.rg-ws a[data-tab="${ws}"]`);
        const tabs = await page.$$eval("nav.exo-tabs button[data-t]", (bs) => bs.filter((b) => !b.hidden).map((b) => b.dataset.t));
        for (const t of tabs) {
          await tap(page, `nav.exo-tabs button[data-t="${t}"]`);
          const on = await page.evaluate(() => (document.querySelector("main#exo-main > section.on") || {}).id);
          if (on !== t) bad.push(t + "→" + on);
          const o = await overlapClean(page);
          if (!o.ok) bad.push(t + " " + o.detail);
          n++;
        }
      }
      return { ok: bad.length === 0 && n >= 10, detail: n + " tabs; " + bad.slice(0, 3).join(" | ") };
    },
  },
  {
    name: "Listen (dock on phones) reports the retired receiver honestly",
    test: async (page) => {
      await tap(page, '.rg-ws a[data-tab="listen"]');
      const phone = await isPhone(page);
      const tall = await page.evaluate(() => innerHeight > 500);
      const sel = phone && tall ? "#rg-primary" : "#livebtn";
      if (phone && tall) {
        const mirrored = await textOf(page, "#rg-primary");
        if (mirrored !== "Listen") return { ok: false, detail: "dock label " + mirrored };
      }
      await tap(page, sel);
      await wait(200);
      const np = await textOf(page, "#np");
      return { ok: /No radio receiver/.test(np), detail: sel + " → " + np };
    },
  },
  {
    name: "Bookmark Save without a name asks for one",
    test: async (page) => {
      await page.$eval("#bmname", (el) => { el.value = ""; });
      await tap(page, "#listen button[onclick^='addBm']");
      const t = await textOf(page, "#toast");
      return { ok: /Name the frequency first/.test(t), detail: t };
    },
  },
  {
    name: "Band Sweep reports the retired receiver",
    test: async (page) => {
      await tap(page, '.rg-ws a[data-tab="listen"]');
      await tap(page, 'nav.exo-tabs button[data-t="band"]');
      const phone = (await isPhone(page)) && (await page.evaluate(() => innerHeight > 500));
      await tap(page, phone ? "#rg-primary" : "#band button[onclick^='quickScan']");
      await wait(150);
      const t = await textOf(page, "#qsout");
      return { ok: /No radio receiver/.test(t), detail: t.slice(0, 60) };
    },
  },
  {
    name: "Live: CONNECT USB SDR reaches the honest picker/unsupported state",
    test: async (page) => {
      await tap(page, 'nav.exo-tabs button[data-t="watch"]');
      const before = await textOf(page, "#watch .exo-usb-status");
      const phone = (await isPhone(page)) && (await page.evaluate(() => innerHeight > 500));
      await tap(page, phone ? "#rg-primary" : "#watch .exo-usb-connect");
      await wait(600);
      const after = await textOf(page, "#watch .exo-usb-status");
      return { ok: after.length > 0, untestable: "WebUSB device picker needs a real dongle", detail: before + " → " + after };
    },
  },
  {
    name: "Passes: Passes button computes or reports without inventing a fix",
    test: async (page) => {
      await tap(page, '.rg-ws a[data-tab="decode"]');
      const has = await page.$("[data-predict]");
      if (!has) return { ok: true, skip: "no predictor" };
      await tap(page, "[data-predict]");
      await wait(800);
      const o = await overlapClean(page);
      return { ok: o.ok, detail: "after predict " + (o.detail || "clean") };
    },
  },
];

const unlock = [
  {
    name: "empty Unlock shows an inline error",
    test: async (page) => {
      await tap(page, ".ul-form button[type=submit]");
      const err = await textOf(page, "#ul-err");
      const inv = await page.$eval("#t", (el) => el.getAttribute("aria-invalid"));
      return { ok: /Paste the access token/.test(err) && inv === "true", detail: err };
    },
  },
  {
    name: "a token redirects to ./?t=… on this origin",
    test: async (page) => {
      await page.type("#t", "qa-token");
      await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }).catch(() => null), page.click(".ul-form button[type=submit]")]);
      const u = new URL(page.url());
      return { ok: u.pathname === "/radio/" && u.searchParams.get("t") === "qa-token", detail: u.pathname + u.search };
    },
  },
];

const mesh = [
  {
    name: "every screen tab activates its screen, layout stays clean",
    test: async (page) => {
      const bad = [];
      for (const s of ["map", "nodes", "vitals", "setup", "chat"]) {
        await tap(page, `nav.exo-tabs button[data-s="${s}"]`);
        await wait(250);
        const on = await page.evaluate(() => (document.querySelector(".screen.active") || {}).id);
        if (on !== "scr-" + s) bad.push(s + "→" + on);
        const o = await overlapClean(page);
        if (!o.ok) bad.push(s + " " + o.detail);
      }
      return { ok: !bad.length, detail: bad.slice(0, 3).join(" | ") || "5 screens" };
    },
  },
  {
    name: "CONNECT opens the link sheet; Cancel closes it",
    test: async (page) => {
      await tap(page, "#btnConn");
      const shown = await page.$eval("#sheet", (el) => el.classList.contains("show"));
      const o = await overlapClean(page);
      const bt = await textOf(page, "#btHint");
      await tap(page, "#optCancel");
      const hidden = await page.$eval("#sheet", (el) => !el.classList.contains("show"));
      return { ok: shown && hidden, untestable: "BLE / USB pairing needs a node", detail: "BLE hint: " + bt + (o.ok ? "" : " overlap " + o.detail) };
    },
  },
  {
    name: "MAP layer chips toggle and TAP DROP arms",
    test: async (page) => {
      await tap(page, 'nav.exo-tabs button[data-s="map"]');
      await wait(300);
      const before = await page.$eval("#stTrail", (el) => el.checked);
      await page.click("label:has(#stTrail)");
      await wait(100);
      const after = await page.$eval("#stTrail", (el) => el.checked);
      await page.click("label:has(#stTrail)");
      await tap(page, "#btnTapDrop");
      const armed = await page.$eval("#btnTapDrop", (el) => el.classList.contains("primary"));
      await tap(page, "#btnTapDrop");
      return { ok: before !== after && armed, detail: `trail ${before}→${after}, tap drop armed=${armed}` };
    },
  },
  {
    name: "NIGHT MODE toggles and restores",
    test: async (page) => {
      await tap(page, 'nav.exo-tabs button[data-s="setup"]');
      await tap(page, "#btnNight");
      const on = await page.evaluate(() => document.body.classList.contains("night"));
      await tap(page, "#btnNight");
      const off = await page.evaluate(() => !document.body.classList.contains("night"));
      return { ok: on && off, detail: `on=${on} off=${off}` };
    },
  },
];

const sentinel = [
  {
    name: "Start control reports the browser's real Bluetooth state",
    test: async (page) => {
      const start = await page.$eval("#rf-start", (b) => ({ t: b.textContent.trim(), d: b.disabled }));
      const dock = await page.$eval("#sn-dock-scan", (b) => ({ t: b.textContent.trim(), d: b.disabled }));
      const same = start.t === dock.t && start.d === dock.d;
      return { ok: same && start.t.length > 0, untestable: "Web Bluetooth scan needs a real radio", detail: `${start.t} disabled=${start.d}; dock mirrors=${same}` };
    },
  },
  {
    name: "category filter chips select one at a time",
    test: async (page) => {
      const cats = await page.$$eval("#rf-filters button", (bs) => bs.map((b) => b.dataset.cat));
      if (cats.length < 2) return { ok: false, detail: "no chips" };
      await tap(page, `#rf-filters button[data-cat="${cats[1]}"]`);
      const pressed = await page.$$eval("#rf-filters button[aria-pressed=true]", (bs) => bs.map((b) => b.dataset.cat));
      await tap(page, '#rf-filters button[data-cat="all"]');
      return { ok: pressed.length === 1 && pressed[0] === cats[1], detail: "pressed " + pressed.join(",") };
    },
  },
  {
    name: "watch lanes switch",
    test: async (page) => {
      await tap(page, '.sn-tabs button[data-lane="air"]');
      const sel = await page.$eval('.sn-tabs button[data-lane="air"]', (b) => b.getAttribute("aria-selected"));
      await tap(page, '.sn-tabs button[data-lane="all"]');
      return { ok: sel === "true", detail: "air selected=" + sel };
    },
  },
  {
    name: "watchlist opens (sheet on phones, side pane wide) and validates input",
    test: async (page) => {
      const phone = await isPhone(page);
      if (phone) {
        await tap(page, "#sn-sheet-toggle");
        const open = await page.$eval("#sn-sheet", (el) => el.getAttribute("data-open"));
        if (open !== "true") return { ok: false, detail: "sheet did not open" };
      }
      const o = await overlapClean(page);
      await page.$eval("#sn-value", (el) => { el.value = ""; });
      await tap(page, "#sn-add");
      const s1 = await textOf(page, "#sn-status");
      await tap(page, "#sn-fence");
      const s2 = await textOf(page, "#sn-status");
      if (phone) {
        await page.keyboard.press("Escape");
        await wait(100);
        const closed = await page.$eval("#sn-sheet", (el) => el.getAttribute("data-open"));
        if (closed !== "false") return { ok: false, detail: "Escape did not close" };
      }
      return { ok: o.ok && /ENTER A VALID/.test(s1) && /ENTER LAT, LON AND RADIUS/.test(s2), detail: `${s1} | ${s2}` + (o.ok ? "" : " overlap " + o.detail) };
    },
  },
  {
    name: "ESP32 · USB reaches the honest serial state",
    test: async (page) => {
      const dis = await page.$eval("#rf-serial", (b) => b.disabled);
      if (dis) return { ok: true, untestable: "Web Serial unsupported here", detail: "button disabled honestly" };
      await tap(page, "#rf-serial");
      await wait(500);
      const s = await textOf(page, "#rf-status");
      return { ok: s.length > 0, untestable: "serial port picker needs hardware", detail: s };
    },
  },
  {
    name: "Clear local log confirms locally",
    test: async (page) => {
      await tap(page, "#rf-clear");
      await wait(200);
      const s = await textOf(page, "#rf-status");
      return { ok: /LOG CLEARED/.test(s), detail: s };
    },
  },
];

export const flows = { radio, unlock, mesh, sentinel };
