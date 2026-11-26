const CACHE = "exopace-moc-v94";
// Icons + manifest only. Never pin in-place HUD (index.html / env / overlay) —
// a stale SW precache is how guests first-painted ?v=11 after ?v=13 published.
const ASSETS = [
  "/manifest.json",
  "/icon.svg",
  "/icon-maskable.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];
// Shared chrome. Online always revalidates; the pathname copy is the offline fallback
// for every ?v= the pages request.
const SHELL = ["/assets/exo-modern.css", "/assets/exo-tokens.css", "/assets/exo-scene.js", "/assets/exo-tabs.js", "/assets/exo-cmd.js", "/assets/exo-sentinel.js", "/assets/exo-audio.js", "/assets/exo-link.js", "/assets/exo-orbit.js", "/assets/exo-bus.js", "/sentinel/rf/rf.css", "/sentinel/rf/matcher.js", "/sentinel/rf/scan.js", "/sentinel/rf/store.js", "/sentinel/rf/ui.js", "/sentinel/rf/presets/global.json"];

function shellAsset(url) {
  return SHELL.indexOf(url.pathname) !== -1;
}

function precacheShell(cache) {
  return Promise.all(SHELL.map((path) =>
    fetch(path, { cache: "reload" }).then((r) => {
      if (!r.ok) throw new Error(path);
      return cache.put(path, r);
    }),
  ));
}

function noStore(url) {
  const p = url.pathname;
  return (
    shellAsset(url) ||
    p === "/" ||
    p === "/index.html" ||
    p === "/env.js" ||
    p === "/pwa-install.js" ||
    p === "/moc-phone.css" ||
    p === "/assets/index-B5yAHF7-.js" ||
    p === "/exo-traffic.js" ||
    p === "/mission" ||
    p === "/mission/" ||
    p === "/mission/index.html"
  );
}

function skip(url) {
  if (url.origin !== location.origin) return true;
  const p = url.pathname;
  // Mesh radio and SDR app have their own scopes. Never steal them.
  if (p === "/mesh" || p.startsWith("/mesh/")) return true;
  if (p === "/radio" || p.startsWith("/radio/")) return true;
  if (p === "/maps" || p.startsWith("/maps/")) return true;
  if (p.startsWith("/api/terrain/") || p.startsWith("/api/geocode") || p.startsWith("/api/overlay")) return true;
  if (p.startsWith("/cesium/")) return true;
  if (p.startsWith("/protocol/")) return true;
  if (p.startsWith("/scripts/")) return true;
  if (p.startsWith("/tle/")) return true;
  if (p.startsWith("/firmware/")) return true;
  if (/\.(md|csv|geojson)$/i.test(p)) return true;
  return false;
}

function isNav(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

// Never hand respondWith an undefined promise value: that surfaces as a hard
// network error instead of a miss.
function offline() {
  return new Response("", { status: 504, statusText: "EXOpace offline: not cached" });
}

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => Promise.all([c.addAll(ASSETS), precacheShell(c)])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith("exopace-maps")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (skip(url)) return;
  e.respondWith(
    fetch(e.request, noStore(url) ? { cache: "no-store" } : undefined)
      .then((r) => {
        // Last-known-good copy of the in-place HUD too. Not precaching and it
        // never pins: online always takes the no-store network answer above, so
        // a deploy lands on the next load. Read only from the .catch below --
        // without it an offline MOC missed /index.html and hard-failed.
        if (r.ok && r.type === "basic") {
          const copy = r.clone();
          const bare = shellAsset(url) ? r.clone() : null;
          caches.open(CACHE).then((c) => {
            const jobs = [c.put(e.request, copy)];
            if (bare) jobs.push(c.put(url.pathname, bare));
            return Promise.all(jobs);
          });
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request).then((m) => {
          if (m) return m;
          if (shellAsset(url)) return caches.match(url.pathname).then((s) => s || offline());
          if (isNav(e.request) || url.pathname.startsWith("/lock/")) {
            return caches.match("/index.html").then((i) => i || caches.match("/").then((j) => j || offline()));
          }
          return offline();
        }),
      ),
  );
});
