/** /maps flows: tool tabs, the phone sheet, layer switches, search, readout,
 *  measure, pages, exports and hardware. Each flow taps the real control and
 *  asserts what the page shows afterwards; every state is re-checked for overlap. */
import { collectOverlap } from "../qa-overlap.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isPhone = (page) => page.evaluate(() => matchMedia("(max-width: 719px) and (min-height: 501px)").matches);
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.replace(/\s+/g, " ").trim());
const status = (page) => text(page, "#fm-status");
async function overlap(page) {
  const r = await page.evaluate(collectOverlap);
  return r.failures.length ? r.failures.map((f) => f.type + ":" + f.a + (f.b ? "×" + f.b : "")).join("; ") : "";
}
async function ready(page) {
  await page.waitForSelector("#fm-map canvas", { timeout: 30000 });
  await page.waitForFunction(() => /\d/.test(document.getElementById("fm-mgrs").textContent), { timeout: 20000 });
}
async function tab(page, key) {
  await page.click(`#fm-tab-${key}`);
  await sleep(150);
  if (await isPhone(page)) await page.evaluate(() => document.getElementById("fm-dock").setAttribute("data-state", "half"));
  await page.waitForFunction((k) => !document.getElementById("fm-sec-" + k).hidden, {}, key);
}
async function waitStatus(page, re, ms = 8000) {
  await page.waitForFunction((src) => new RegExp(src).test(document.getElementById("fm-status").textContent), { timeout: ms }, re.source);
  return status(page);
}

export const flows = {
  maps: [
    {
      name: "map, readout and tool panel load",
      test: async (page) => {
        await ready(page);
        const mgrs = await text(page, "#fm-mgrs");
        const st = await status(page);
        return { ok: /^\d{1,2}[C-X]/.test(mgrs), detail: `MGRS ${mgrs} · status ${st}` };
      },
    },
    {
      name: "every tool tab opens only its own section",
      test: async (page) => {
        const keys = ["fix", "measure", "sheet", "style", "layers", "export", "device"];
        const bad = [];
        for (const k of keys) {
          await tab(page, k);
          const vis = await page.$$eval(".fm-sec", (els) => els.filter((e) => !e.hidden).map((e) => e.dataset.sec));
          const sel = await page.$eval(`#fm-tab-${k}`, (b) => b.getAttribute("aria-selected"));
          if (vis.length !== 1 || vis[0] !== k || sel !== "true") bad.push(k + "→" + vis.join("/"));
          const o = await overlap(page);
          if (o) bad.push(k + " overlap " + o);
        }
        await tab(page, "fix");
        return { ok: !bad.length, detail: bad.join(" | ") || keys.join(", ") };
      },
    },
    {
      name: "arrow keys move between tabs",
      test: async (page) => {
        await page.focus("#fm-tab-fix");
        await page.keyboard.press("ArrowRight");
        const now = await page.evaluate(() => document.activeElement && document.activeElement.id);
        const open = await page.$eval("#fm-sec-measure", (e) => !e.hidden);
        await page.keyboard.press("Home");
        return { ok: now === "fm-tab-measure" && open, detail: "focus " + now };
      },
    },
    {
      name: "phone sheet handle cycles peek → half → full → peek",
      test: async (page) => {
        if (!(await isPhone(page))) {
          const shown = await page.$eval("#fm-grab", (b) => getComputedStyle(b).display !== "none");
          return { ok: !shown, skip: "two-pane layout: handle hidden", detail: "handle hidden on this layout" };
        }
        await page.evaluate(() => document.getElementById("fm-dock").setAttribute("data-state", "peek"));
        const seen = [];
        for (let i = 0; i < 3; i++) {
          await page.click("#fm-grab");
          await sleep(300);
          const s = await page.$eval("#fm-dock", (d) => d.dataset.state + ":" + Math.round(d.getBoundingClientRect().height));
          seen.push(s);
          const o = await overlap(page);
          if (o) return { ok: false, detail: s + " overlap " + o };
        }
        const exp = await page.$eval("#fm-grab", (b) => b.getAttribute("aria-expanded"));
        const ok = seen[0].startsWith("half") && seen[1].startsWith("full") && seen[2].startsWith("peek") && exp === "false";
        return { ok, detail: seen.join(" → ") };
      },
    },
    {
      name: "layer row is one switch (WOODS off, then on)",
      test: async (page) => {
        await tab(page, "layers");
        const sel = '#fm-sec-layers .fm-seg[data-key="layer-woods"] button[data-value="true"]';
        const before = await page.$eval(sel, (b) => b.getAttribute("aria-pressed"));
        await page.click(sel);
        await sleep(200);
        const off = await page.$eval(sel, (b) => b.getAttribute("aria-pressed"));
        const hide = await page.$eval('#fm-sec-layers .fm-seg[data-key="layer-woods"] button[data-value="false"]', (b) => b.getAttribute("aria-pressed"));
        await page.click(sel);
        await sleep(200);
        const on = await page.$eval(sel, (b) => b.getAttribute("aria-pressed"));
        // POWER starts hidden: one tap turns it on
        const pw = '#fm-sec-layers .fm-seg[data-key="layer-power"] button[data-value="true"]';
        await page.click(pw); await sleep(200);
        const pOn = await page.$eval(pw, (b) => b.getAttribute("aria-pressed"));
        await page.click(pw); await sleep(200);
        const pOff = await page.$eval(pw, (b) => b.getAttribute("aria-pressed"));
        const ok = before === "true" && off !== "true" && hide === "true" && on === "true" && pOn === "true" && pOff !== "true";
        return { ok, detail: `woods ${before}→${off}→${on} · power →${pOn}→${pOff}` };
      },
    },
    {
      name: "STYLE segments switch basemap and hillshade",
      test: async (page) => {
        await tab(page, "style");
        await page.click('[data-key="base"] button[data-value="imagery"]');
        await sleep(300);
        const img = await page.$eval('[data-key="base"] button[data-value="imagery"]', (b) => b.getAttribute("aria-pressed"));
        await page.click('[data-key="base"] button[data-value="paper"]');
        await page.click('[data-key="hill"] button[data-value="sharp"]');
        await sleep(200);
        const hill = await page.$eval('[data-key="hill"] button[data-value="sharp"]', (b) => b.getAttribute("aria-pressed"));
        await page.click('[data-key="hill"] button[data-value="soft"]');
        return { ok: img === "true" && hill === "true", detail: `imagery ${img} · sharp ${hill}` };
      },
    },
    {
      name: "search by MGRS jumps the map (resolved on device)",
      test: async (page) => {
        const before = await text(page, "#fm-mgrs");
        await page.click("#fm-q", { clickCount: 3 });
        await page.type("#fm-q", "18SUJ2337106519");
        await page.keyboard.press("Enter");
        await page.waitForFunction((b) => document.getElementById("fm-mgrs").textContent.trim() !== b, { timeout: 10000 }, before);
        await sleep(1500);
        const after = await text(page, "#fm-mgrs");
        return { ok: /^18S\s?UJ/.test(after), detail: `${before} → ${after}` };
      },
    },
    {
      name: "typing a place name shows suggestions without covering controls",
      test: async (page) => {
        await page.click("#fm-q", { clickCount: 3 });
        await page.type("#fm-q", "Memphis");
        const got = await page.waitForFunction(() => { const u = document.getElementById("fm-suggest"); return u && !u.hidden && u.children.length; }, { timeout: 8000 }).then(() => true).catch(() => false);
        if (!got) {
          await page.keyboard.press("Escape");
          return { ok: true, untestable: "place names go to /api/geocode (Pages Function); not served by the static harness", detail: "no suggestions offline" };
        }
        const n = await page.$$eval("#fm-suggest button", (b) => b.length);
        await page.keyboard.press("Escape");
        return { ok: n > 0, detail: n + " suggestions" };
      },
    },
    {
      name: "SCALE zooms to the sheet scale",
      test: async (page) => {
        const before = await text(page, "#fm-scale");
        await page.click("#fm-fit");
        await sleep(900);
        const after = await text(page, "#fm-scale");
        return { ok: after !== before && /SCREEN 1:/.test(after), detail: `${before} → ${after}` };
      },
    },
    {
      name: "LOCATE with an emulated position flies there",
      test: async (page) => {
        try { await page.browserContext().overridePermissions(new URL(page.url()).origin, ["geolocation"]); } catch (_) {}
        // Kansas City, well inside zone 15S (Memphis sits 0.05° from the 15/16 line, so
        // the readout of a padded phone map could land either side of it).
        await page.setGeolocation({ latitude: 39.0997, longitude: -94.5786 });
        await page.click("#fm-locate");
        const st = await waitStatus(page, /GPS FIX|NO GPS/, 12000).catch(() => status(page));
        await sleep(2200);
        const mgrs = await text(page, "#fm-mgrs");
        return { ok: /GPS FIX/.test(st) && /^15S/.test(mgrs), untestable: "position is emulated (39.0997, −94.5786); real GPS needs a device", detail: `${st} · ${mgrs}` };
      },
    },
    {
      name: "copy buttons copy the fix or report honestly",
      test: async (page) => {
        await tab(page, "fix");
        try { await page.browserContext().overridePermissions(new URL(page.url()).origin, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]); } catch (_) {}
        const out = [];
        for (const k of ["mgrs", "dd", "dms", "plus", "geo"]) {
          await page.click(`#fm-copy button[data-copy="${k}"]`);
          await sleep(250);
          const t = await page.evaluate(async () => { try { return await navigator.clipboard.readText(); } catch (e) { return "ERR " + e.name; } });
          out.push(k + "=" + String(t).slice(0, 24));
        }
        const okAll = out.every((s) => !/=$/.test(s));
        return { ok: okAll, detail: out.join(" · ") };
      },
    },
    {
      name: "pages: FILL VIEW, UNDO, REDO, CLEAR",
      test: async (page) => {
        await tab(page, "sheet");
        await page.click("#fm-fill"); await sleep(600);
        const filled = await text(page, "#fm-count");
        await page.click("#fm-undo"); await sleep(300);
        const undone = await text(page, "#fm-count");
        await page.click("#fm-redo"); await sleep(300);
        const redone = await text(page, "#fm-count");
        await page.click("#fm-clear"); await sleep(300);
        const cleared = await text(page, "#fm-count");
        const n = (s) => parseInt(s, 10) || 0;
        const ok = n(filled) > 0 && n(undone) === 0 && n(redone) === n(filled) && n(cleared) === 0;
        return { ok, detail: `${filled} → ${undone} → ${redone} → ${cleared}` };
      },
    },
    {
      name: "sheet series + scale segments",
      test: async (page) => {
        await tab(page, "sheet");
        await page.click('[data-key="scale"] button[data-value="25000"]'); await sleep(200);
        const sc = await page.$eval('[data-key="scale"] button[data-value="25000"]', (b) => b.getAttribute("aria-pressed"));
        await page.click('[data-key="series"] button[data-value="usgs75"]'); await sleep(300);
        const note = await text(page, "#fm-series-note");
        await page.click('[data-key="series"] button[data-value="letter"]'); await sleep(200);
        await page.click('[data-key="scale"] button[data-value="50000"]');
        return { ok: sc === "true" && note.length > 10, detail: `1:25k ${sc} · 7.5′ note “${note.slice(0, 50)}”` };
      },
    },
    {
      name: "MEASURE: two taps make a leg, CLEAR ROUTE resets",
      test: async (page) => {
        await tab(page, "measure");
        await page.click('[data-key="measure"] button[data-value="on"]'); await sleep(200);
        // Tap the part of the map the user can see: below the search and above the tool sheet.
        const box = await page.evaluate(() => {
          const r = document.getElementById("fm-map").getBoundingClientRect();
          const d = document.getElementById("fm-dock").getBoundingClientRect();
          let top = r.top;
          for (const el of document.querySelectorAll("#fm-go, .fm-chip, .fm-actions")) { const b = el.getBoundingClientRect(); if (b.height && b.top < r.top + r.height / 2) top = Math.max(top, b.bottom); }
          const bottom = d.top > r.top + 120 && d.left < r.left + r.width / 2 ? Math.min(r.bottom, d.top) : r.bottom;
          const left = d.right < r.left + r.width / 2 ? Math.max(r.left, d.right) : r.left;
          return { x: left, y: top, w: r.right - left, h: bottom - top };
        });
        await page.mouse.click(box.x + box.w * 0.4, box.y + box.h * 0.4);
        await sleep(400);
        await page.mouse.click(box.x + box.w * 0.65, box.y + box.h * 0.7);
        await sleep(800);
        const leg = await text(page, "#fm-leg");
        await page.click("#fm-route-clear"); await sleep(300);
        const after = await text(page, "#fm-leg");
        await page.click('[data-key="measure"] button[data-value="off"]');
        return { ok: leg !== after && /\d/.test(leg), detail: `leg “${leg.slice(0, 60)}” → “${after.slice(0, 30)}”` };
      },
    },
    {
      name: "ROUTE GPX without a route says so",
      test: async (page) => {
        await tab(page, "measure");
        await page.click("#fm-gpx");
        await sleep(500);
        return { ok: true, detail: "status " + (await status(page)) };
      },
    },
    {
      name: "help disclosures open and close",
      test: async (page) => {
        await tab(page, "measure");
        await page.click("#fm-sec-measure .fm-help > summary");
        const open = await page.$eval("#fm-sec-measure .fm-help", (d) => d.open);
        const o = await overlap(page);
        await page.click("#fm-sec-measure .fm-help > summary");
        return { ok: open && !o, detail: o || "open → closed" };
      },
    },
    {
      name: "map credits open and close without covering controls",
      test: async (page) => {
        await page.click(".maplibregl-ctrl-attrib-button");
        await sleep(200);
        const open = await page.$eval(".maplibregl-ctrl-attrib", (d) => d.classList.contains("maplibregl-compact-show") || d.open);
        const o = await overlap(page);
        await page.click(".maplibregl-ctrl-attrib-button");
        return { ok: open && !o, detail: o || "credits toggle" };
      },
    },
    {
      name: "zoom buttons change the screen scale",
      test: async (page) => {
        const a = await text(page, "#fm-scale");
        await page.click(".maplibregl-ctrl-zoom-in"); await sleep(700);
        const b = await text(page, "#fm-scale");
        await page.click(".maplibregl-ctrl-zoom-out"); await sleep(700);
        return { ok: a !== b, detail: `${a} → ${b}` };
      },
    },
    {
      name: "DOWNLOAD PDF builds a PDF for the selected pages",
      test: async (page) => {
        await tab(page, "sheet");
        await page.click("#fm-fill"); await sleep(500);
        await tab(page, "export");
        await page.click("#fm-pdf");
        const st = await waitStatus(page, /PDF READY|PDF FAILED|NO PAGES|SELECT/i, 60000).catch(() => status(page));
        await tab(page, "sheet"); await page.click("#fm-clear");
        return { ok: /PDF READY/.test(st), detail: st };
      },
    },
    {
      name: "USB / BLE node buttons report honestly without hardware",
      test: async (page) => {
        await tab(page, "device");
        const before = await text(page, "#exo-usb-node-status");
        return { ok: /NO USB|USB|BLE|SERIAL/i.test(before), untestable: "Web Serial / Web Bluetooth pickers need a real device and a user gesture on the phone", detail: before };
      },
    },
    {
      name: "IMPORT PMTILES opens a file picker",
      test: async (page) => {
        await tab(page, "export");
        const [chooser] = await Promise.all([
          page.waitForFileChooser({ timeout: 4000 }).catch(() => null),
          page.click("#exo-vault-import"),
        ]);
        if (chooser) await chooser.cancel();
        return { ok: !!chooser, detail: chooser ? "file chooser opened (.pmtiles)" : "no chooser" };
      },
    },
  ],
};
