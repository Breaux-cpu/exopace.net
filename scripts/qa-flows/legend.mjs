/** Field-map legend flows. */
export const flows = {
  legend: [
    {
      name: "legend lists every map symbol with a swatch",
      test: async (page) => {
        const n = await page.$$eval(".lg-symbols li .sw", (els) => els.length);
        return { ok: n === 13, detail: n + " symbols" };
      },
    },
    {
      name: "Back to the map links to /maps/",
      test: async (page) => {
        const hrefs = await page.$$eval('a.exo-btn[href="./"]', (els) => els.map((a) => new URL(a.href).pathname));
        return { ok: hrefs.length === 2 && hrefs.every((h) => h === "/maps/"), detail: hrefs.join(", ") };
      },
    },
    {
      name: "Print legend calls window.print",
      test: async (page) => {
        await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
        await page.click(".lg-actions button");
        const n = await page.evaluate(() => window.__printed);
        return { ok: n === 1, detail: "print() called " + n + "×" };
      },
    },
    {
      name: "print stylesheet hides chrome and goes light",
      test: async (page) => {
        await page.emulateMediaType("print");
        const r = await page.evaluate(() => ({ bar: getComputedStyle(document.querySelector(".exo-bar")).display, bg: getComputedStyle(document.body).backgroundColor }));
        await page.emulateMediaType("screen");
        return { ok: r.bar === "none" && /255, 255, 255/.test(r.bg), detail: `bar ${r.bar} · bg ${r.bg}` };
      },
    },
  ],
};
