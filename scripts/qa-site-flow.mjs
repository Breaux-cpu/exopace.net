/**
 * Site-flow crawl: every primary surface is in the main nav, every internal
 * link resolves, and no stray HTML page is left as an orphan subpage.
 */
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const PRIMARY = [
  { path: "/mission/", name: "Mission", title: "EXOpace — Mission", file: "mission/index.html" },
  { path: "/radio/", name: "Radio", title: "EXOpace — Radio", file: "radio/index.html" },
  { path: "/mesh/", name: "Mesh", title: "EXOpace — Mesh", file: "mesh/index.html" },
  { path: "/maps/", name: "Field Maps", title: "EXOpace — Field Maps", file: "maps/index.html" },
  { path: "/sentinel/", name: "Sentinel", title: "EXOpace — Sentinel", file: "sentinel/index.html" },
  { path: "/system/", name: "System", title: "EXOpace — System", file: "system/index.html" },
];

export const OFF_ORIGIN = [
  { path: "https://cams.exopace.net/map", name: "Cameras" },
];

export const ALIASES = {
  "/": "/mission/",
  "/index.html": "/mission/",
  "/maintenance": "/cameras/",
  "/maintenance/": "/cameras/",
  "/maintenance/index.html": "/cameras/",
  "/maps/legend.html": "/maps/#legend",
  "/maps/legend": "/maps/#legend",
  "/radio/unlock.html": "/radio/#unlock",
  "/radio/unlock": "/radio/#unlock",
};

export const UTILITY = new Set(["/404.html"]);

const SKIP_DIRS = new Set([".git", "node_modules", "cesium", "dist", "build", "out", "coverage", "target"]);

function walkHtml(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith(".") && ent.name !== ".") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walkHtml(full, acc);
    } else if (ent.isFile() && ent.name.endsWith(".html")) {
      acc.push(path.relative(ROOT, full).split(path.sep).join("/"));
    }
  }
  return acc;
}

function fileToUrl(file) {
  if (file === "index.html") return "/";
  if (file === "404.html") return "/404.html";
  if (file.endsWith("/index.html")) return "/" + file.slice(0, -"index.html".length);
  return "/" + file;
}

function extractAttrs(html, attr) {
  const out = [];
  const re = new RegExp("\\s" + attr + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')", "gi");
  let m;
  while ((m = re.exec(html))) out.push(m[1] || m[2] || "");
  return out;
}

function classifyHref(raw, baseUrl) {
  const href = String(raw || "").trim();
  if (!href || href.startsWith("javascript:") || href.startsWith("data:") || href.startsWith("blob:") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return { kind: "skip", href };
  }
  let url;
  try { url = new URL(href, baseUrl); } catch (_) { return { kind: "bad", href, detail: "unparsable" }; }
  if (url.origin !== new URL(baseUrl).origin) return { kind: "external", href: url.href };
  return { kind: "internal", href: url.href, path: url.pathname, hash: url.hash, url };
}

function get(url, hops = 0) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (err) { reject(err); return; }
    const lib = parsed.protocol === "https:" ? https : http;
    const req = lib.get(url, { timeout: 15000 }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location && hops < 5) {
        res.resume();
        get(new URL(res.headers.location, url).href, hops + 1).then(resolve, reject);
        return;
      }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({
        status,
        headers: res.headers,
        body: Buffer.concat(chunks).toString("utf8"),
        finalUrl: url,
      }));
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("timeout " + url)); });
  });
}

async function checkExists(base, pathName, cache) {
  const url = new URL(pathName, base).href;
  if (cache.has(url)) return cache.get(url);
  const hit = await get(url);
  const ok = hit.status > 0 && hit.status < 400;
  const row = { ok, status: hit.status, url };
  cache.set(url, row);
  return row;
}

export async function crawlSite(base) {
  const problems = [];
  const cache = new Map();
  const htmlFiles = walkHtml(ROOT);
  const allowedFiles = new Set([
    ...PRIMARY.map((p) => p.file),
    "index.html",
    "404.html",
    "cameras/index.html",
    "maintenance/index.html",
    "maps/legend.html",
    "radio/unlock.html",
  ]);
  for (const file of htmlFiles) {
    if (!allowedFiles.has(file)) problems.push("orphan page " + fileToUrl(file) + " (" + file + ")");
  }

  const navNeed = PRIMARY.map((p) => ({ label: p.name, href: p.path })).concat(OFF_ORIGIN.map((p) => ({ label: p.name, href: p.path })));

  for (const page of PRIMARY) {
    const url = new URL(page.path, base).href;
    let res;
    try { res = await get(url); } catch (err) {
      problems.push(page.path + " failed to load: " + err.message);
      continue;
    }
    if (res.status >= 400) {
      problems.push(page.path + " status " + res.status);
      continue;
    }
    const title = (res.body.match(/<title>([^<]*)<\/title>/i) || [, ""])[1].trim();
    if (title && title !== page.title) {
      problems.push(page.path + " title “" + title + "” does not match nav label (“" + page.title + "”)");
    }

    const markup = res.body.replace(/<script\b[\s\S]*?<\/script>/gi, "").replace(/<style\b[\s\S]*?<\/style>/gi, "");
    const hrefs = [
      ...extractAttrs(markup, "href"),
      ...extractAttrs(markup, "action"),
    ];
    const srcs = extractAttrs(markup, "src").concat(
      (res.body.match(/url\((["']?)(\/[^"')]+)\1\)/g) || []).map((s) => s.replace(/^url\((["']?)/, "").replace(/["']?\)$/, ""))
    );

    // Main nav must list every primary surface with a matching label.
    const navChunk = (res.body.match(/<nav class="exo-sites"[^>]*>([\s\S]*?)<\/nav>/i) || [, ""])[1];
    if (!navChunk) {
      problems.push(page.path + " is missing nav.exo-sites");
    } else {
      for (const need of navNeed) {
        const has = new RegExp("href=\"" + need.href.replaceAll("/", "\\/") + "\"[^>]*>\\s*" + need.label.replace(/ /g, "\\s+") + "\\s*<", "i").test(navChunk)
          || (navChunk.includes(need.href) && navChunk.includes(need.label));
        if (!has) {
          problems.push(page.path + " nav is missing " + need.label + " (" + need.href + ")");
        }
      }
    }

    const seen = new Set();
    for (const raw of hrefs) {
      const info = classifyHref(raw, url);
      if (info.kind === "skip" || info.kind === "external") continue;
      if (info.kind === "bad") { problems.push(page.path + " bad href " + raw); continue; }
      const pathname = info.path;
      if (pathname === "/#" || pathname === "") continue;
      if (seen.has(pathname + info.hash)) continue;
      seen.add(pathname + info.hash);
      if (ALIASES[pathname] || ALIASES[pathname.replace(/\/$/, "")] || UTILITY.has(pathname) || PRIMARY.some((p) => p.path === pathname || p.path === pathname + "/")) {
        continue;
      }
      const exists = await checkExists(base, pathname, cache);
      if (!exists.ok) problems.push(page.path + " broken link " + pathname + " (" + exists.status + ")");
    }
    for (const raw of srcs) {
      const info = classifyHref(raw, url);
      if (info.kind !== "internal") continue;
      const exists = await checkExists(base, info.path, cache);
      if (!exists.ok) problems.push(page.path + " broken asset " + info.path + " (" + exists.status + ")");
    }
  }

  // 404 must offer a way back to every primary surface.
  try {
    const miss = await get(new URL("/404.html", base).href);
    for (const p of PRIMARY.concat(OFF_ORIGIN)) {
      if (!miss.body.includes('href="' + p.path + '"')) {
        problems.push("/404.html is missing a back link to " + p.name + " (" + p.path + ")");
      }
    }
  } catch (err) {
    problems.push("/404.html failed to load: " + err.message);
  }

  // Alias files must mention their parent target.
  const aliasFiles = {
    "index.html": "/mission/",
    "maintenance/index.html": "/cameras/",
    "maps/legend.html": "/maps/#legend",
    "radio/unlock.html": "/radio/#unlock",
  };
  for (const [file, target] of Object.entries(aliasFiles)) {
    const body = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (!body.includes(target)) problems.push(file + " does not bounce to " + target);
  }

  const ok = problems.length === 0;
  return {
    ok,
    problems,
    pages: PRIMARY.map((p) => p.path),
    detail: ok
      ? "6 on-origin surfaces + Cameras on cams · " + htmlFiles.length + " html files · aliases fold into parents"
      : problems.slice(0, 8).join(" | ") + (problems.length > 8 ? " · +" + (problems.length - 8) + " more" : ""),
  };
}

export const flows = {};
