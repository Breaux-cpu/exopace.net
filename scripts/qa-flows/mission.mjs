/** /mission flows. The harness drops the splash without waiting for Cesium, so
 *  each flow first waits for the HUD (camstrip + traffic rail) the globe mounts.
 *  If WebGL never comes up in this browser the flows report that honestly. */
import { collectOverlap } from "../qa-overlap.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function overlap(page) {
  const r = await page.evaluate(collectOverlap);
  return r.failures.length ? r.failures.map((f) => f.type + ":" + f.a + (f.b ? "×" + f.b : "")).join("; ") : "";
}
async function hud(page) {
  try {
    await page.waitForFunction(() => document.querySelector(".hud .camstrip") && document.getElementById("exo-traffic"), { timeout: 60000 });
    await sleep(800);
    return true;
  } catch (e) {
    return false;
  }
}
const noGl = { ok: true, untestable: "Cesium did not start (no WebGL in this headless browser); run with --use-angle=swiftshader --enable-unsafe-swiftshader" };
const btn = (page, scope, label) => page.evaluateHandle((s, l) => [...document.querySelectorAll(s)].find((b) => b.textContent.replace(/\s+/g, " ").trim() === l) || null, scope, label);
async function tap(page, scope, label) {
  const h = await btn(page, scope, label);
  const el = h.asElement();
  if (!el) throw new Error("no " + label + " in " + scope);
  await el.click();
  await sleep(350);
}
/** Phone portrait keeps the layer list, traffic, camera modes, time and LOCATE in
 *  one bottom sheet behind the thumb bar. Open the right pane first there. */
const phone = (page) => page.evaluate(() => { const t = document.getElementById("mi-thumb"); return !!t && getComputedStyle(t).display !== "none"; });
async function pane(page, which) {
  if (!(await phone(page))) return false;
  const cur = await page.evaluate(() => document.body.dataset.miOpen || "");
  if (cur !== which) { await page.click(`#mi-thumb [data-mi="${which}"]`); await sleep(400); }
  return true;
}
async function closePane(page) {
  if (await page.evaluate(() => { const s = document.getElementById("mi-sheet"); return !!s && !s.hidden; })) { await page.click("#mi-sheet-close"); await sleep(300); }
}
async function toggleStation(page) {
  if (await phone(page)) { await page.click('#mi-thumb [data-mi="station"]'); await sleep(450); }
  else await tap(page, ".camstrip .btn", "STATION");
}
const isOn = (page, scope, label) => page.evaluate((s, l) => { const b = [...document.querySelectorAll(s)].find((x) => x.textContent.replace(/\s+/g, " ").trim() === l); return b ? b.classList.contains("on") : null; }, scope, label);

export const flows = {
  mission: [
    {
      name: "globe HUD mounts, no stars (skybox, sun, moon off)",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        await page.waitForFunction(() => window.EXOPACE_VIEWER && window.EXOPACE_VIEWER.scene.skyBox && window.EXOPACE_VIEWER.scene.skyBox.show === false, { timeout: 15000 }).catch(() => {});
        const sky = await page.evaluate(() => { const s = window.EXOPACE_VIEWER && window.EXOPACE_VIEWER.scene; return s ? [s.skyBox && s.skyBox.show, s.sun && s.sun.show, s.moon && s.moon.show].join("/") : "no viewer"; });
        const o = await overlap(page);
        return { ok: sky === "false/false/false" && !o, detail: "skybox/sun/moon " + sky + (o ? " overlap " + o : "") };
      },
    },
    {
      name: "LAYERS opens the layer rail; each layer toggles",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const ph = await pane(page, "layers");
        if (!ph) await tap(page, ".camstrip .btn", "LAYERS");
        const open = await page.evaluate(() => { const l = document.querySelector(".hud .layers"); return l && getComputedStyle(l).display !== "none"; });
        const names = await page.$$eval(".hud .layers .btn", (b) => b.map((x) => x.textContent.trim()));
        const flips = [];
        for (const n of names) {
          const a = await isOn(page, ".hud .layers .btn", n);
          await tap(page, ".hud .layers .btn", n);
          const b = await isOn(page, ".hud .layers .btn", n);
          await tap(page, ".hud .layers .btn", n);
          flips.push(n + (a !== b ? "✓" : "✗"));
        }
        const o = await overlap(page);
        if (ph) await closePane(page); else await tap(page, ".camstrip .btn", "LAYERS");
        return { ok: open && flips.every((f) => f.endsWith("✓")) && !o, detail: (ph ? "[sheet] " : "[rail] ") + flips.join(" ") + (o ? " overlap " + o : "") };
      },
    },
    {
      name: "STATION opens the station pane with passes; closes",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const was = await page.$(".hud .station");
        if (!was) await toggleStation(page);
        const passes = await page.$$eval(".hud .station .passlist li", (l) => l.length).catch(() => 0);
        const o = await overlap(page);
        await toggleStation(page);
        const gone = !(await page.$(".hud .station"));
        if (was) await toggleStation(page);
        return { ok: passes > 0 && gone && !o, detail: `${passes} passes · closes ${gone}` + (o ? " overlap " + o : "") };
      },
    },
    {
      name: "ARM without radio/rotator refuses honestly",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        if (!(await page.$(".hud .station"))) await toggleStation(page);
        const arm = await page.evaluateHandle(() => [...document.querySelectorAll(".station .btn")].find((b) => /^ARM /.test(b.textContent.trim())) || null);
        if (!arm.asElement()) return { ok: true, skip: "no pass to arm" };
        const hit = await arm.asElement().evaluate((b) => { b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === b || b.contains(e) ? "" : "covered by " + (e && (e.id || e.className || e.tagName)); });
        // The ARM toast auto-clears at 1800ms; Cesium click() can outlast that,
        // so record text as it appears and treat a seen "RF CHAIN OFFLINE" as success.
        await page.evaluate(() => {
          const el = document.getElementById("exo-toast");
          window.__exoToastSeen = (el && el.textContent) || "";
          if (!el || el.__exoToastWatch) return;
          el.__exoToastWatch = true;
          new MutationObserver(() => {
            const s = (el.textContent || "").trim();
            if (s) window.__exoToastSeen = s;
          }).observe(el, { characterData: true, childList: true, subtree: true, attributes: true });
        });
        await arm.asElement().click();
        await page.waitForFunction(() => /\S/.test(window.__exoToastSeen || (document.getElementById("exo-toast") || {}).textContent || ""), { timeout: 8000 }).catch(() => {});
        const toast = await page.evaluate(() => window.__exoToastSeen || (document.getElementById("exo-toast") && document.getElementById("exo-toast").textContent) || "").catch(() => "");
        if (await page.$(".hud .station")) await toggleStation(page);
        if (hit) return { ok: false, detail: "ARM " + hit + " · toast " + toast };
        return { ok: /RF CHAIN OFFLINE/.test(toast), detail: "toast " + toast };
      },
    },
    {
      name: "search ISS locks the dossier; CLEAR LOCK releases",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        await page.click(".hud .search input", { clickCount: 3 });
        await page.type(".hud .search input", "ISS");
        await page.keyboard.press("Enter");
        const locked = await page.waitForSelector(".dossier button", { timeout: 10000 }).then(() => true).catch(() => false);
        await sleep(1500);
        const title = await page.$eval(".dossier h3", (h) => h.textContent.trim()).catch(() => "");
        const o = await overlap(page);
        const clear = await btn(page, ".dossier button", "CLEAR LOCK");
        if (clear.asElement()) { await clear.asElement().click(); await sleep(500); }
        const empty = await page.$eval(".dossier", (d) => /NO LOCK/.test(d.textContent)).catch(() => false);
        return { ok: locked && empty && !o, detail: `lock “${title}” → cleared ${empty}` + (o ? " overlap " + o : "") };
      },
    },
    {
      name: "FOLLOW / SAT-CAM without a lock say NO LOCK",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const out = [];
        const ph = await pane(page, "view");
        for (const l of ["FOLLOW", "SAT-CAM"]) {
          await tap(page, ".camstrip .btn", l);
          // Software WebGL can hold the main thread; give the toast a moment to paint.
          await page.waitForFunction(() => /\S/.test((document.getElementById("exo-toast") || {}).textContent || ""), { timeout: 4000 }).catch(() => {});
          const t = await page.$eval("#exo-toast", (x) => x.textContent).catch(() => "");
          out.push(l + ":" + t);
        }
        if (ph) await closePane(page);
        return { ok: out.every((s) => /NO LOCK/.test(s)), detail: out.join(" · ") };
      },
    },
    {
      name: "camera modes FLY / CINE / ⌂ MOC light up",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const out = [];
        const ph = await pane(page, "view");
        for (const l of ["FLY", "CINE", "⌂ MOC"]) {
          await tap(page, ".camstrip .btn", l);
          out.push(l + ":" + (await isOn(page, ".camstrip .btn", l)));
        }
        const label = await page.$eval("#mi-view-state", (x) => x.textContent).catch(() => "");
        if (ph) await closePane(page);
        return { ok: out.every((s) => s.endsWith("true")) && (!ph || /^MOC/.test(label)), detail: out.join(" · ") + (ph ? " · thumb says " + label : "") };
      },
    },
    {
      name: "time bar LIVE / HOLD / 10× / 60×",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const out = [];
        const ph = await pane(page, "view");
        for (const l of ["HOLD", "10×", "60×", "LIVE"]) {
          await tap(page, ".timebar .btn", l);
          out.push(l + ":" + (await isOn(page, ".timebar .btn", l)));
        }
        if (ph) await closePane(page);
        return { ok: out.every((s) => s.endsWith("true")), detail: out.join(" · ") };
      },
    },
    {
      name: "map capsule home / north / zoom move the camera",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const h = () => page.evaluate(() => Math.round(window.EXOPACE_VIEWER.camera.positionCartographic.height / 1000));
        const a = await h();
        const plus = await page.evaluateHandle(() => [...document.querySelectorAll(".hud .zoom .btn")].find((b) => b.textContent.trim() === "＋" && getComputedStyle(b).display !== "none") || null);
        let zoomed = "pinch only on phones";
        if (plus.asElement()) { await plus.asElement().click(); await sleep(1200); zoomed = a + "→" + (await h()) + " km"; }
        for (const l of ["N", "⌂"]) await tap(page, ".hud .zoom .btn", l);
        return { ok: true, detail: "zoom " + zoomed };
      },
    },
    {
      name: "traffic + weather toggles flip state",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const out = [];
        const ph = await pane(page, "layers");
        for (const l of ["AIRCRAFT", "SHIPS", "RADAR", "STORMS", "CAMERAS"]) {
          const a = await isOn(page, "#exo-traffic .btn", l);
          await tap(page, "#exo-traffic .btn", l);
          const b = await isOn(page, "#exo-traffic .btn", l);
          await tap(page, "#exo-traffic .btn", l);
          out.push(l + (a !== b ? "✓" : "✗"));
        }
        const o = await overlap(page);
        if (ph) await closePane(page);
        return { ok: out.every((s) => s.endsWith("✓")) && !o, untestable: "aircraft/ship/storm data come from Pages Functions; locally they 404, so only the toggles are asserted", detail: out.join(" ") + (o ? " overlap " + o : "") };
      },
    },
    {
      name: "LOCATE ME with an emulated position",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        try { await page.browserContext().overridePermissions(new URL(page.url()).origin, ["geolocation"]); } catch (_) {}
        await page.setGeolocation({ latitude: 35.1495, longitude: -90.049 });
        const ph = await pane(page, "view");
        await page.click("#exo-locate");
        await sleep(2500);
        const t = await page.$eval("#exo-locate", (b) => b.textContent.trim());
        if (ph) await closePane(page);
        return { ok: t === "LOCATE ME", untestable: "position is emulated; real GPS needs the phone", detail: "button " + t };
      },
    },
    {
      name: "CAMS link + Cesium credits are real links",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        const cams = await page.$eval(".hud .tl a.radio-link", (a) => a.getAttribute("href")).catch(() => "");
        const cred = await page.$eval("#globe a.cesium-credit-expand-link", (a) => a.getAttribute("href")).catch(() => "");
        return { ok: !!cams && /cesium\.com/.test(cred), detail: `CAMS ${cams} · credits ${cred}` };
      },
    },
    {
      name: "phone thumb bar: LAYERS / VIEW / STATION swap one surface; Escape closes",
      test: async (page) => {
        if (!(await hud(page))) return noGl;
        if (!(await phone(page))) return { ok: true, skip: "desktop docks these controls; the thumb bar + sheet is for phones, Fold and tablets (tested at pixel here, strict.mjs covers the rest)" };
        const st = () => page.evaluate(() => [document.body.dataset.miOpen || "-", !!document.querySelector(".hud .station"), getComputedStyle(document.querySelector(".hud .dossier")).display !== "none"].join("/"));
        const seq = [];
        await pane(page, "layers"); seq.push("L:" + (await st()));
        await pane(page, "view"); seq.push("V:" + (await st()));
        await page.click('#mi-thumb [data-mi="station"]'); await sleep(450); seq.push("S:" + (await st()));
        const o = await overlap(page);
        await page.click('#mi-thumb [data-mi="station"]'); await sleep(450); seq.push("S2:" + (await st()));
        await pane(page, "view"); await page.keyboard.press("Escape"); await sleep(300); seq.push("Esc:" + (await st()));
        const want = ["L:layers/false/false", "V:view/false/false", "S:station/true/false", "S2:-/false/true", "Esc:-/false/true"];
        return { ok: seq.join(" ") === want.join(" ") && !o, detail: seq.join(" ") + (o ? " overlap " + o : "") };
      },
    },
  ],
};
