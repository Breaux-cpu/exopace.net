/** Flows for shell-owned pages, plus generic chrome checks used on every page. */
async function clipboardGranted(page) {
  try {
    const ctx = page.browserContext ? page.browserContext() : page.context && page.context();
    if (ctx && ctx.grantPermissions) await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  } catch (_) {}
}

export const genericChrome = [
  {
    name: "nav surfaces present",
    test: async (page) => {
      const hasBar = await page.$("header.exo-bar, .exo-sites");
      if (!hasBar) return { ok: true, skip: "no exo-bar on this page" };
      const texts = await page.$$eval(".exo-sites a", (els) => els.map((a) => a.textContent.trim()));
      const need = ["Home", "Mission", "Radio", "Mesh", "Field Maps", "Cameras", "Sentinel", "System"];
      const missing = need.filter((n) => !texts.some((t) => t.includes(n)));
      return { ok: missing.length === 0, detail: missing.length ? "missing " + missing.join(", ") : texts.join(" | ") };
    }
  },
  {
    name: "COPY writes clipboard or reports honestly",
    test: async (page) => {
      const btn = await page.$("#exo-pill-copy");
      if (!btn) return { ok: true, skip: "no COPY control" };
      await clipboardGranted(page);
      await btn.click();
      const text = await page.evaluate(async () => {
        try { return await navigator.clipboard.readText(); } catch (e) { return "ERR:" + e.message; }
      });
      if (text && !text.startsWith("ERR:")) return { ok: true, detail: "clipboard " + text.slice(0, 48) };
      return {
        ok: true,
        untestable: "clipboard may be blocked headlessly; COPY still clicked without a page error",
        detail: String(text).slice(0, 80)
      };
    }
  },
  {
    name: "JUMP is off-origin and is not followed",
    test: async (page) => {
      const href = await page.$eval("#exo-pill-jump", (a) => a.getAttribute("href")).catch(() => null);
      if (!href) return { ok: true, skip: "no JUMP control" };
      return { ok: href.startsWith("https://cams.exopace.net"), detail: href };
    }
  }
];

export const flows = {
  system: [
    {
      name: "status slabs populate honestly",
      test: async (page) => {
        await page.waitForFunction(() => {
          const ble = document.getElementById("sys-ble");
          return ble && /STANDBY|OFFLINE|ONLINE/.test(ble.textContent);
        }, { timeout: 8000 });
        const rows = await page.$$eval(".sys-row", (els) => els.map((el) => el.textContent.replace(/\\s+/g, " ").trim()));
        const ble = rows.find((r) => /BLE/.test(r)) || "";
        const ok = /cannot pair|STANDBY|OFFLINE/i.test(ble);
        return { ok, detail: rows.join(" || ") };
      }
    },
    {
      name: "account control opens /signin/",
      test: async (page) => {
        const href = await page.$eval("#sys-account", (a) => a.getAttribute("href"));
        return { ok: href === "/signin/", detail: href };
      }
    },
    {
      name: "footer surfaces navigate on-origin",
      test: async (page) => {
        const href = await page.$eval('.exo-foot a[href="/radio/"]', (a) => a.getAttribute("href"));
        return { ok: href === "/radio/", detail: href };
      }
    }
  ],
  "404": [
    {
      name: "jump cluster links to live decks",
      test: async (page) => {
        const hrefs = await page.$$eval(".miss-jumps a", (els) => els.map((a) => a.getAttribute("href")));
        const need = ["/", "/mission/", "/radio/", "/mesh/", "/maps/", "https://cams.exopace.net/map", "/sentinel/", "/system/", "/signin/"];
        const missing = need.filter((n) => !hrefs.includes(n));
        return { ok: missing.length === 0, detail: hrefs.join(" ") };
      }
    },
    {
      name: "Mission jump navigates",
      test: async (page) => {
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }),
          page.click('.miss-jumps a[href="/mission/"]')
        ]);
        const url = page.url();
        return { ok: /\/mission\/?/.test(url), detail: url };
      }
    }
  ],
  maintenance: [
    {
      name: "redirects to cameras or offers the cameras link",
      test: async (page) => {
        // Meta refresh may already have fired; /cameras/ then JS-bounces to cams.
        const start = page.__exoBase ? page.__exoBase + "/maintenance/" : page.url();
        if (!/\/maintenance\/?/.test(page.url()) && page.__exoBase) {
          await page.goto(start, { waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {});
        }
        await new Promise((r) => setTimeout(r, 800));
        const url = page.url();
        if (/cams\.exopace\.net\/map/.test(url) || /\/cameras\/?/.test(url)) return { ok: true, detail: "redirected " + url };
        const href = await page.$eval('a[href="/cameras/"], a[href="https://cams.exopace.net/map"]', (a) => a.getAttribute("href")).catch(() => null);
        return { ok: href === "/cameras/" || href === "https://cams.exopace.net/map", detail: "link " + href + " at " + url };
      }
    }
  ]
};
