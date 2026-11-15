const CACHE = "exopace-maps-v5";
const SHELL = [
  "/maps/",
  "/maps/index.html",
  "/maps/maps.css?v=2",
  "/maps/legend.html",
  "/maps/host.json",
  "/maps/mgrs.js?v=1",
  "/maps/sheets.js?v=2",
  "/maps/terrain.js?v=1",
  "/maps/style.js?v=2",
  "/maps/print.js?v=2",
  "/maps/atak.js?v=2",
  "/maps/search.js?v=1",
  "/maps/garmin.js?v=2",
  "/maps/app.js?v=6",
  "/maps/vendor/maplibre-gl.js?v=1",
  "/maps/vendor/maplibre-gl.css?v=1",
  "/maps/manifest.webmanifest",
  "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("exopace-maps") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/maps/") && url.pathname !== "/icon.svg") return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res.ok && url.pathname.startsWith("/maps/")) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match("/maps/index.html"))),
  );
});
