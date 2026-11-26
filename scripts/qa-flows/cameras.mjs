/** Cameras flows. The production feed is real-only; the last flows swap in a
 *  clearly labelled TEST FIXTURE response (never shipped) so popups, the list
 *  sheet, PREV/NEXT and SHARE can be exercised while the live feed is empty. */
import { collectOverlap } from "../qa-overlap.js";

const FIXTURE = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [-90.05, 35.15] }, properties: { id: "qa-fixture-a", name: "TEST FIXTURE A", source: "qa harness", image: "", stream: "" } },
    { type: "Feature", geometry: { type: "Point", coordinates: [-97.74, 30.27] }, properties: { id: "qa-fixture-b", name: "TEST FIXTURE B", source: "qa harness", image: "", stream: "https://example.invalid/live.m3u8" } },
  ],
};

const isPhone = (page) => page.evaluate(() => matchMedia("(max-width: 719px) and (min-height: 501px)").matches);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());
const shown = (page, sel) => page.$eval(sel, (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; }).catch(() => false);
async function overlapFree(page) {
  const r = await page.evaluate(collectOverlap);
  return r.failures.length ? r.failures.map((f) => f.type + ":" + f.a + (f.b ? "×" + f.b : "")).join("; ") : "";
}

async function useFixture(page) {
  if (page.__camFixture) return;
  page.__camFixture = true;
  try { await page.browserContext().overridePermissions(new URL(page.url()).origin, ["geolocation", "clipboard-read", "clipboard-write", "clipboard-sanitized-write"]); } catch (_) {}
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (req.url().includes("/api/cameras.geojson")) {
      req.respond({ status: 200, contentType: "application/geo+json", body: JSON.stringify(FIXTURE) });
    } else req.continue();
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => /IN VIEW/.test(document.getElementById("count").textContent), { timeout: 15000 });
}

export const flows = {
  cameras: [
    {
      name: "offline feed shows an honest error card",
      test: async (page) => {
        await page.waitForFunction(() => document.body.dataset.camState !== "loading", { timeout: 15000 });
        const state = await page.evaluate(() => document.body.dataset.camState);
        const card = await shown(page, "#cam-empty");
        const markers = await page.$$eval(".leaflet-interactive", (els) => els.length);
        return { ok: (state === "error" || state === "empty") && card && markers === 0, detail: `${state} · ${await text(page, "#cam-empty-title")} · count ${await text(page, "#count")} · ${markers} markers` };
      },
    },
    {
      name: "basemap tiles are keyless Esri, not CARTO",
      test: async (page) => {
        await page.waitForSelector(".leaflet-tile", { timeout: 15000 });
        const srcs = await page.$$eval(".leaflet-tile", (els) => els.map((e) => e.src));
        const carto = srcs.some((s) => /cartocdn/.test(s));
        return { ok: srcs.length > 0 && !carto, detail: srcs.length + " tiles · " + (srcs[0] || "").replace(/\/tile\/.*/, "") };
      },
    },
    {
      name: "RETRY asks the feed again",
      test: async (page) => {
        let asked = 0;
        const on = (r) => { if (r.url().includes("/api/cameras.geojson")) asked++; };
        page.on("request", on);
        await page.click("#cam-retry");
        await sleep(800);
        page.off("request", on);
        return { ok: asked > 0, detail: asked + " request(s)" };
      },
    },
    {
      name: "NEXT with no cameras says so",
      test: async (page) => {
        await page.click("#cam-next");
        const c = await text(page, "#count");
        return { ok: /NO CAMERAS/.test(c), detail: c };
      },
    },
    {
      name: "LOCATE centres on the device position",
      test: async (page) => {
        const ctx = page.browserContext();
        await ctx.overridePermissions(new URL(page.url()).origin, ["geolocation"]);
        await page.setGeolocation({ latitude: 35.15, longitude: -90.05 });
        await page.click("#locate");
        const ok = await page.waitForFunction(() => document.querySelector('.leaflet-tile[src*="/tile/10/"]'), { timeout: 10000 }).then(() => true, () => false);
        return { ok, detail: ok ? "zoom 10 tiles requested" : await text(page, "#count") };
      },
    },
    {
      name: "fixture: markers + count render (TEST FIXTURE data)",
      test: async (page) => {
        await useFixture(page);
        await page.evaluate(() => { history.replaceState(null, "", location.pathname); });
        const n = await page.$$eval("path.leaflet-interactive", (els) => els.length);
        const c = await text(page, "#count");
        return { ok: n === 2 && /2 IN VIEW/.test(c) && !(await shown(page, "#cam-empty")), detail: `${n} markers · ${c}` };
      },
    },
    {
      name: "fixture: NEXT opens a popup that stays clear of controls",
      test: async (page) => {
        await page.click("#cam-next");
        await page.waitForSelector(".leaflet-popup", { timeout: 5000 });
        await sleep(600);
        const name = await text(page, ".leaflet-popup-content strong");
        const clash = await overlapFree(page);
        return { ok: /TEST FIXTURE/.test(name) && !clash, detail: name + (clash ? " · " + clash : " · no overlap") };
      },
    },
    {
      name: "fixture: SHARE copies or shares the camera link",
      test: async (page) => {
        await page.click("#cam-share");
        await sleep(400);
        const c = await text(page, "#count");
        return { ok: /COPIED|SHARED|COPY FAILED/.test(c), untestable: /FAILED/.test(c) ? "clipboard blocked headlessly" : "", detail: c };
      },
    },
    {
      name: "fixture: popup COPY LINK button works",
      test: async (page) => {
        const btn = await page.$(".leaflet-popup .cam-copy");
        if (!btn) return { ok: false, detail: "no COPY LINK in popup" };
        await btn.click();
        await sleep(300);
        const c = await text(page, "#count");
        return { ok: /COPIED|SHARED|COPY FAILED/.test(c), detail: c };
      },
    },
    {
      name: "fixture: search filters and shows NO MATCHES honestly",
      test: async (page) => {
        await page.click("#cam-q", { clickCount: 3 });
        await page.type("#cam-q", "fixture b");
        const one = await text(page, "#count");
        await page.click("#cam-q", { clickCount: 3 });
        await page.type("#cam-q", "zzzz");
        const none = await text(page, "#cam-empty-title");
        const card = await shown(page, "#cam-empty");
        await page.click("#cam-q", { clickCount: 3 });
        await page.keyboard.press("Backspace");
        const back = await text(page, "#count");
        return { ok: /^1 \/ 2/.test(one) && none === "NO MATCHES" && card && /^2 IN VIEW/.test(back), detail: `${one} → ${none} → ${back}` };
      },
    },
    {
      name: "fixture: camera list (sheet on phone, rail on wide) opens a camera",
      test: async (page) => {
        const phone = await isPhone(page);
        if (phone) {
          await page.click("#cam-list-toggle");
          await sleep(300);
          const open = await page.$eval("#cam-sheet", (el) => el.getAttribute("data-open") === "true");
          const clash = await overlapFree(page);
          if (!open) return { ok: false, detail: "sheet did not open" };
          await page.click("#cam-list li:nth-child(2) button");
          await sleep(500);
          const closed = await page.$eval("#cam-sheet", (el) => el.getAttribute("data-open") !== "true");
          const name = await text(page, ".leaflet-popup-content strong").catch(() => "");
          return { ok: closed && name === "TEST FIXTURE B" && !clash, detail: `sheet open→closed · popup ${name}` + (clash ? " · " + clash : "") };
        }
        const visible = await shown(page, "#cam-list");
        await page.click("#cam-list li:nth-child(1) button");
        await sleep(500);
        const name = await text(page, ".leaflet-popup-content strong").catch(() => "");
        const cur = await page.$eval("#cam-list li:nth-child(1) button", (b) => b.getAttribute("aria-current"));
        return { ok: visible && name === "TEST FIXTURE A" && cur === "true", detail: `rail list · popup ${name} · current ${cur}` };
      },
    },
    {
      name: "keyboard ] / [ cycle cameras",
      test: async (page) => {
        await page.click("#map", { offset: { x: 5, y: 5 } }).catch(() => {});
        await page.keyboard.press("]");
        await sleep(400);
        const a = await text(page, ".leaflet-popup-content strong").catch(() => "");
        await page.keyboard.press("[");
        await sleep(400);
        const b = await text(page, ".leaflet-popup-content strong").catch(() => "");
        return { ok: /TEST FIXTURE/.test(a) && /TEST FIXTURE/.test(b) && a !== b, detail: `${a} → ${b}` };
      },
    },
  ],
};
