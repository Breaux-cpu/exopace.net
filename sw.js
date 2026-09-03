const CACHE = "exopace-moc-v26";
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

function noStore(url) {
  const p = url.pathname;
  return (
    p === "/" ||
    p === "/index.html" ||
    p === "/env.js" ||
    p === "/pwa-install.js" ||
    p === "/moc-phone.css" ||
    p === "/assets/index-B5yAHF7-.js"
  );
}

function skip(url) {
  if (url.origin !== location.origin) return true;
  const p = url.pathname;
  // Radio has its own SW + scope. Never steal /radio or treat it as the SPA.
  if (p === "/radio" || p.startsWith("/radio/")) return true;
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

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
        if (r.ok && !noStore(url)) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() =>
        caches.match(e.request).then((m) => {
          if (m) return m;
          if (isNav(e.request) || url.pathname.startsWith("/lock/")) return caches.match("/index.html");
          return caches.match("/");
        }),
      ),
  );
});
