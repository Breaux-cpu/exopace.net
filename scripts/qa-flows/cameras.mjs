/** Cameras flows, on real data only.
 *  Locally there are no Pages Functions, so /api/cameras.geojson is answered by
 *  the real function code (functions/api/cameras.geojson.js) running in this
 *  process against the live EXOpace Cams catalogue. Against a deployed preview
 *  (--base https://…pages.dev) the deployed function answers instead.
 *  One flow simulates the catalogue being down (HTTP 502) to check the error card. */
import { collectOverlap } from "../qa-overlap.js";
import { onRequest as camerasGeojson } from "../../functions/api/cameras.geojson.js";

const isPhone = (page) => page.evaluate(() => matchMedia("(max-width: 719px) and (min-height: 501px)").matches);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());
const shown = (page, sel) => page.$eval(sel, (el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0; }).catch(() => false);
async function overlapFree(page) {
  const r = await page.evaluate(collectOverlap);
  return r.failures.length ? r.failures.map((f) => f.type + ":" + f.a + (f.b ? "×" + f.b : "")).join("; ") : "";
}

/** Route the list through the real function when the page is served without Functions. */
async function wire(page) {
  if (page.__camWired) return;
  page.__camWired = true;
  page.__camMode = "live";
  try { await page.browserContext().overridePermissions(new URL(page.url()).origin, ["geolocation", "clipboard-read", "clipboard-write", "clipboard-sanitized-write"]); } catch (_) {}
  const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(page.url());
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    if (!req.url().includes("/api/cameras.geojson")) return req.continue();
    if (page.__camMode === "down") return req.respond({ status: 502, contentType: "application/geo+json", body: JSON.stringify({ type: "FeatureCollection", features: [], error: "CAMERA CATALOGUE UNREACHABLE" }) });
    if (!local) return req.continue();
    try {
      const res = await camerasGeojson({ request: new Request(req.url()) });
      req.respond({ status: res.status, contentType: "application/geo+json", body: await res.text() });
    } catch (e) { req.respond({ status: 500, body: String(e) }); }
  });
}

async function goTo(page, at) {
  await wire(page);
  const url = new URL(page.url());
  url.hash = at ? "cam=pick&at=" + at : "";
  await page.goto(url.href, { waitUntil: "domcontentloaded" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.body.dataset.camState && document.body.dataset.camState !== "loading", { timeout: 30000 });
  await sleep(600);
}

/** Open the first camera with NEXT and wait for its player to settle. */
async function playFirst(page) {
  await page.click("#cam-next");
  await page.waitForSelector(".leaflet-popup .cam-player", { timeout: 10000 });
  const state = await page.waitForFunction(() => { const x = document.querySelector(".leaflet-popup .cam-player"); return x && x.dataset.state !== "loading" ? x.dataset.state : false; }, { timeout: 30000 }).then((h) => h.jsonValue()).catch(() => "loading");
  return page.evaluate((state) => {
    const x = document.querySelector(".leaflet-popup .cam-player");
    const img = x && x.querySelector("img");
    const v = x && x.querySelector("video");
    return { state, name: document.querySelector(".leaflet-popup strong").textContent, msg: x.querySelector(".cam-msg").innerText.replace(/\s+/g, " "), px: img ? img.naturalWidth + "×" + img.naturalHeight : v ? v.videoWidth + "×" + v.videoHeight : "", host: img ? new URL(img.currentSrc || img.src).host : "" };
  }, state);
}

const FINLAND = "61.90088,26.11229";   // Digitraffic weathercam station C09535, public stills
const HONGKONG = "22.2790,114.1800";   // HK Transport Department cameras, public stills
const MEMPHIS = "35.1495,-90.0490";    // TDOT / Vision Environnement cameras that play through cams.exopace.net

export const flows = {
  cameras: [
    {
      name: "catalogue down: honest error card, no markers",
      test: async (page) => {
        await wire(page);
        page.__camMode = "down";
        await goTo(page, "");
        const state = await page.evaluate(() => document.body.dataset.camState);
        const card = await shown(page, "#cam-empty");
        const markers = await page.$$eval("path.leaflet-interactive", (els) => els.length);
        await page.click("#cam-next");
        const next = await text(page, "#count");
        page.__camMode = "live";
        return { ok: state === "error" && card && markers === 0 && /NO CAMERAS/.test(next), detail: `${state} · ${await text(page, "#cam-empty-title")} · NEXT says ${next}` };
      },
    },
    {
      name: "RETRY asks the catalogue again and real cameras load",
      test: async (page) => {
        let asked = 0;
        const on = (r) => { if (r.url().includes("/api/cameras.geojson")) asked++; };
        page.on("request", on);
        await page.click("#cam-retry");
        await page.waitForFunction(() => /IN VIEW/.test(document.getElementById("count").textContent), { timeout: 30000 }).catch(() => {});
        page.off("request", on);
        const n = await page.$$eval("path.leaflet-interactive", (els) => els.length);
        return { ok: asked > 0 && n > 0, detail: `${asked} request(s) · ${n} markers · ${await text(page, "#count")}` };
      },
    },
    {
      name: "basemap tiles are keyless Esri, not CARTO",
      test: async (page) => {
        await page.waitForSelector(".leaflet-tile", { timeout: 15000 });
        const srcs = await page.$$eval(".leaflet-tile", (els) => els.map((e) => e.src));
        return { ok: srcs.length > 0 && !srcs.some((s) => /cartocdn/.test(s)), detail: srcs.length + " tiles · " + (srcs[0] || "").replace(/\/tile\/.*/, "") };
      },
    },
    {
      name: "PLAY: Finland Digitraffic camera shows a live still (no sign-in)",
      test: async (page) => {
        await goTo(page, FINLAND);
        const r = await playFirst(page);
        const clash = await overlapFree(page);
        return { ok: r.state === "playing" && /digitraffic/.test(r.host) && !clash, detail: `${r.name} · ${r.state} ${r.px} from ${r.host}` + (clash ? " · " + clash : "") };
      },
    },
    {
      name: "PLAY: Hong Kong Transport Dept camera shows a live still (no sign-in)",
      test: async (page) => {
        await goTo(page, HONGKONG);
        const r = await playFirst(page);
        return { ok: r.state === "playing" && /data\.one\.gov\.hk/.test(r.host), detail: `${r.name} · ${r.state} ${r.px} from ${r.host}` };
      },
    },
    {
      name: "cams-only camera explains sign-in instead of a raw HTTP error",
      test: async (page) => {
        await goTo(page, MEMPHIS);
        const r = await playFirst(page);
        const clash = await overlapFree(page);
        const honest = r.state === "signin" ? /SIGN IN TO PLAY/.test(r.msg) : r.state === "error" && /CAMS/.test(r.msg);
        return { ok: honest && !/^HTTP \d+$/.test(r.msg) && !clash, untestable: "playing these needs JB's Google sign-in on cams.exopace.net; signed out the page must say so", detail: `${r.name} · ${r.state}: ${r.msg}` + (clash ? " · " + clash : "") };
      },
    },
    {
      name: "SHARE copies or shares a camera link with its position",
      test: async (page) => {
        await page.click("#cam-share");
        await sleep(400);
        const c = await text(page, "#count");
        const hash = await page.evaluate(() => location.hash);
        return { ok: /COPIED|SHARED|COPY FAILED/.test(c) && /cam=.+&at=-?\d/.test(hash), untestable: /FAILED/.test(c) ? "clipboard blocked headlessly" : "", detail: c + " · " + hash.slice(0, 60) };
      },
    },
    {
      name: "popup COPY LINK button works",
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
      name: "search filters by name and shows NO MATCHES honestly",
      test: async (page) => {
        await goTo(page, HONGKONG);
        const total = (await text(page, "#count")).match(/^(\d+)/);
        await page.click("#cam-q", { clickCount: 3 });
        await page.type("#cam-q", "road");
        const some = await text(page, "#count");
        await page.click("#cam-q", { clickCount: 3 });
        await page.type("#cam-q", "zzzzqqq");
        const none = await text(page, "#cam-empty-title");
        const card = await shown(page, "#cam-empty");
        await page.click("#cam-q", { clickCount: 3 });
        await page.keyboard.press("Backspace");
        const back = await text(page, "#count");
        return { ok: !!total && /^\d+ \/ \d+/.test(some) && none === "NO MATCHES" && card && /IN VIEW/.test(back), detail: `${some} → ${none} → ${back}` };
      },
    },
    {
      name: "camera list (sheet on phone, rail on wide) opens and plays a camera",
      test: async (page) => {
        const phone = await isPhone(page);
        let clash = "";
        if (phone) {
          await page.click("#cam-list-toggle");
          await sleep(300);
          const open = await page.$eval("#cam-sheet", (el) => el.getAttribute("data-open") === "true");
          clash = await overlapFree(page);
          if (!open) return { ok: false, detail: "sheet did not open" };
        }
        const want = await text(page, "#cam-list li:nth-child(2) button");
        await page.click("#cam-list li:nth-child(2) button");
        await sleep(500);
        const name = await text(page, ".leaflet-popup-content strong").catch(() => "");
        const closed = phone ? await page.$eval("#cam-sheet", (el) => el.getAttribute("data-open") !== "true") : true;
        const st = await page.waitForFunction(() => { const x = document.querySelector(".leaflet-popup .cam-player"); return x && x.dataset.state !== "loading" ? x.dataset.state : false; }, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => "loading");
        return { ok: closed && want.startsWith(name) && st === "playing" && !clash, detail: `${phone ? "sheet" : "rail"} → ${name} · ${st}` + (clash ? " · " + clash : "") };
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
        return { ok: !!a && !!b && a !== b, detail: `${a} → ${b}` };
      },
    },
    {
      name: "LOCATE centres on the device position",
      test: async (page) => {
        await page.setGeolocation({ latitude: 35.15, longitude: -90.05 });
        await page.click("#locate");
        const ok = await page.waitForFunction(() => document.querySelector('.leaflet-tile[src*="/tile/10/"]'), { timeout: 10000 }).then(() => true, () => false);
        return { ok, untestable: "position is emulated", detail: ok ? "zoom 10 tiles requested" : await text(page, "#count") };
      },
    },
  ],
};
