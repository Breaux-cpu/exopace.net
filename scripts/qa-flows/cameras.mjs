/** /cameras/ is a bounce page: map #cam=&at= to cams.exopace.net, else /map. */
import http from "node:http";
import https from "node:https";

const CAMS_MAP = "https://cams.exopace.net/map";

function baseOf(page) {
  return page.__exoBase || new URL(page.url()).origin;
}

function getText(url) {
  return new Promise((resolve, reject) => {
    const lib = String(url).startsWith("https:") ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("timeout " + url)); });
  });
}

async function followRedirect(page, url) {
  const nav = page.waitForFunction(() => location.hostname === "cams.exopace.net", { timeout: 12000 }).catch(() => null);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
  await nav;
  return page.url();
}

function mapUrl(href) {
  try { return new URL(href); } catch { return null; }
}

export const flows = {
  cameras: [
    {
      name: "plain /cameras/ replaces to cams map",
      test: async (page) => {
        const dest = await followRedirect(page, baseOf(page) + "/cameras/");
        const u = mapUrl(dest);
        const ok = !!u && u.origin + u.pathname === CAMS_MAP && ![...u.searchParams.keys()].length;
        return { ok, detail: dest };
      }
    },
    {
      name: "hash cam+at maps to camera query",
      test: async (page) => {
        const dest = await followRedirect(page, baseOf(page) + "/cameras/#cam=opencctv:arcgis-TN-lamar&at=35.1495,-90.0490");
        const u = mapUrl(dest);
        const ok = !!u && u.origin + u.pathname === CAMS_MAP
          && u.searchParams.get("camera") === "opencctv:arcgis-TN-lamar"
          && u.searchParams.get("lat") === "35.1495"
          && u.searchParams.get("lon") === "-90.0490"
          && u.searchParams.get("z") === "13";
        return { ok, detail: dest };
      }
    },
    {
      name: "hash without coordinates still names the camera (cams looks it up by id)",
      test: async (page) => {
        const dest = await followRedirect(page, baseOf(page) + "/cameras/#cam=only-an-id");
        const u = mapUrl(dest);
        const ok = !!u && u.origin + u.pathname === CAMS_MAP && u.searchParams.get("camera") === "only-an-id" && !u.searchParams.has("lat");
        return { ok, detail: dest };
      }
    },
    {
      name: "page source has noscript cams link and location.replace",
      test: async (page) => {
        const body = await getText(baseOf(page) + "/cameras/");
        const hasReplace = body.includes("location.replace") && body.includes(CAMS_MAP);
        const hasNoscript = /<noscript/i.test(body) && body.includes('href="' + CAMS_MAP + '"');
        return { ok: hasReplace && hasNoscript, detail: "replace=" + hasReplace + " noscript=" + hasNoscript };
      }
    }
  ]
};
