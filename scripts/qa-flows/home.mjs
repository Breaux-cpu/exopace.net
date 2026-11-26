/** Flows for the EXOpace home (/) and sign-in (/signin/). */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const accountChip = {
  name: "top bar account indicator links to /signin/",
  test: async (page) => {
    await page.waitForSelector("header.exo-bar a.exo-acct", { timeout: 5000 });
    const row = await page.$eval("header.exo-bar a.exo-acct", (a) => ({ href: a.getAttribute("href"), state: a.getAttribute("data-state") }));
    return { ok: row.href === "/signin/", detail: row.href + " · " + row.state };
  }
};

export const flows = {
  home: [
    accountChip,
    {
      name: "seven surface cards with the right targets",
      test: async (page) => {
        const cards = await page.$$eval(".hm-card", (els) => els.map((a) => [a.querySelector(".t").textContent.trim(), a.getAttribute("href")]));
        const need = { Mission: "/mission/", Radio: "/radio/", Mesh: "/mesh/", "Field Maps": "/maps/", Cameras: "https://cams.exopace.net/map", Sentinel: "/sentinel/", System: "/system/" };
        const bad = Object.keys(need).filter((k) => !cards.some(([t, h]) => t === k && h === need[k]));
        return { ok: cards.length === 7 && bad.length === 0, detail: bad.length ? "missing " + bad.join(", ") : cards.map((c) => c[0]).join(" | ") };
      }
    },
    {
      name: "live status settles from real sources",
      test: async (page) => {
        await page.waitForFunction(() => {
          const c = document.getElementById("hm-lv-cams");
          const a = document.getElementById("hm-lv-acct");
          return c && a && !/CHECKING/.test(c.textContent) && !/CHECKING/.test(a.textContent);
        }, { timeout: 12000 });
        const vals = await page.$$eval(".hm-live .v", (els) => els.map((e) => e.textContent.trim()));
        const ok = /ONLINE|DEGRADED|UNREACHABLE/.test(vals[0]) && /SIGNED IN|SIGNED OUT|CAN'T REACH CAMS/.test(vals[1]);
        return { ok, detail: vals.join(" · ") };
      }
    },
    {
      name: "Install app prompts or explains",
      test: async (page) => {
        const btn = await page.$("#hm-install");
        if (!btn) return { ok: false, detail: "no install control" };
        const hidden = await page.$eval("#hm-install", (b) => b.hidden);
        if (hidden) return { ok: true, skip: "already installed" };
        await btn.click();
        await sleep(200);
        const path = await page.$eval("#hm-install", (b) => b.getAttribute("data-path"));
        if (path === "prompt") return { ok: true, detail: "browser offered beforeinstallprompt; prompt() called", untestable: "headless shows no install dialog" };
        const open = await page.$eval("#hm-install-sheet", (s) => !s.hidden);
        await page.keyboard.press("Escape");
        await sleep(100);
        const closed = await page.$eval("#hm-install-sheet", (s) => s.hidden);
        return { ok: path === "sheet" && open && closed, detail: "path=" + path + " sheet open=" + open + " closed after Esc=" + closed };
      }
    },
    {
      name: "3D stage paints or falls back",
      test: async (page) => {
        await page.waitForFunction(() => document.querySelector("#hm-scene.is-live, .hm-scene-fallback"), { timeout: 10000 }).catch(() => {});
        const kind = await page.evaluate(() => document.querySelector("#hm-scene.is-live") ? "webgl" : document.querySelector(".hm-scene-fallback") ? "fallback" : "none");
        return { ok: kind !== "none", detail: kind };
      }
    },
    {
      name: "old root deep link hands off to Mission",
      test: async (page) => {
        const base = new URL(page.url()).origin;
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
          page.goto(base + "/?lock=25544&cam=follow&t=live", { waitUntil: "domcontentloaded" })
        ]);
        await sleep(300);
        const url = page.url();
        return { ok: /\/mission\/\?lock=25544&cam=follow&t=live/.test(url), detail: url };
      }
    }
  ],
  signin: [
    {
      name: "probe settles into one honest state",
      test: async (page) => {
        await page.waitForFunction(() => {
          const s = document.querySelector("#si-state span");
          return s && !/Checking/.test(s.textContent);
        }, { timeout: 12000 });
        const row = await page.evaluate(() => ({
          label: document.querySelector("#si-state span").textContent.trim(),
          out: !document.getElementById("si-out").hidden,
          inn: !document.getElementById("si-in").hidden,
          err: !document.getElementById("si-err").hidden
        }));
        const shown = [row.out, row.inn, row.err].filter(Boolean).length;
        const match = (row.label === "Signed out" && row.out) || (row.label === "Signed in" && row.inn) || (row.label === "Can't reach cams" && row.err);
        return { ok: shown === 1 && match, detail: row.label };
      }
    },
    {
      name: "Google button goes to cams with next=/signin/",
      test: async (page) => {
        const href = await page.$eval("#si-google", (a) => a.getAttribute("href"));
        return { ok: href === "https://cams.exopace.net/account?next=https%3A%2F%2Fexopace.net%2Fsignin%2F", detail: href };
      }
    },
    {
      name: "Retry re-probes when cams is unreachable",
      test: async (page) => {
        const err = await page.$eval("#si-err", (e) => !e.hidden);
        if (!err) return { ok: true, skip: "cams answered; no error state to retry" };
        await page.click("#si-retry");
        await page.waitForFunction(() => !/Checking/.test(document.querySelector("#si-state span").textContent), { timeout: 12000 });
        const label = await page.$eval("#si-state span", (s) => s.textContent.trim());
        return { ok: /Signed in|Signed out|Can't reach cams/.test(label), detail: "after retry: " + label };
      }
    },
    accountChip
  ]
};
