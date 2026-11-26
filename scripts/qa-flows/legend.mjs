/** Field-map legend now lives as a sheet on /maps/. */
async function openLegend(page) {
  const opened = await page.$("#legend[data-open='true'], #legend.is-open");
  if (opened) return;
  const exportTab = await page.$("#fm-tab-export");
  if (exportTab) {
    await exportTab.evaluate((el) => el.click());
    await new Promise((r) => setTimeout(r, 200));
  }
  const btn = await page.$("#fm-legend-open");
  if (!btn) throw new Error("LEGEND control missing");
  await btn.evaluate((el) => el.scrollIntoView({ block: "center", inline: "nearest" }));
  await btn.evaluate((el) => el.click());
  await page.waitForFunction(() => {
    const s = document.getElementById("legend");
    return s && (s.getAttribute("data-open") === "true" || s.classList.contains("is-open"));
  }, { timeout: 4000 });
}

async function closeLegend(page) {
  await page.evaluate(() => {
    var s = document.getElementById("legend");
    if (!s) return;
    if (window.EXO_LAYOUT) EXO_LAYOUT.closeSheet(s);
    else {
      s.setAttribute("data-open", "false");
      s.classList.remove("is-open");
      document.body.classList.remove("exo-sheet-open");
    }
  });
}

export const flows = {
  maps: [
    {
      name: "LEGEND opens the in-page legend sheet",
      test: async (page) => {
        await openLegend(page);
        const n = await page.$$eval("#legend .lg-symbols li .sw", (els) => els.length);
        await closeLegend(page);
        return { ok: n === 13, detail: n + " symbols" };
      },
    },
    {
      name: "Back to the map closes the legend on /maps/",
      test: async (page) => {
        await openLegend(page);
        await page.click("#legend .lg-actions [data-exo-sheet-close]");
        await page.waitForFunction(() => {
          const s = document.getElementById("legend");
          return s && s.getAttribute("data-open") !== "true" && !s.classList.contains("is-open");
        }, { timeout: 4000 });
        const path = new URL(page.url()).pathname;
        return { ok: path === "/maps/" || path === "/maps/index.html", detail: page.url() };
      },
    },
    {
      name: "Print legend calls window.print",
      test: async (page) => {
        await openLegend(page);
        await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
        await page.click("#fm-legend-print");
        const n = await page.evaluate(() => window.__printed);
        await closeLegend(page);
        return { ok: n === 1, detail: "print() called " + n + "×" };
      },
    },
    {
      name: "print stylesheet hides chrome and goes light",
      test: async (page) => {
        await openLegend(page);
        await page.emulateMediaType("print");
        const r = await page.evaluate(() => ({
          bar: getComputedStyle(document.querySelector(".exo-bar")).display,
          bg: getComputedStyle(document.body).backgroundColor,
        }));
        await page.emulateMediaType("screen");
        await closeLegend(page);
        return { ok: r.bar === "none" && /255, 255, 255/.test(r.bg), detail: `bar ${r.bar} · bg ${r.bg}` };
      },
    },
  ],
};
