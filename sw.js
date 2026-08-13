const CACHE = "exopace-moc-v4";
const ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/engine.js",
  "/app.js",
  "/env.js",
  "/feeds.js",
  "/imagery.js",
  "/sgp4.worker.js",
  "/protocol.js",
  "/FEEDS.md",
  "/three.min.js",
  "/satellite.min.js",
  "/manifest.json",
  "/icon.svg",
  "/textures/earth-blue-marble.jpg",
  "/textures/earth-night.jpg",
  "/textures/earth-water.png",
  "/textures/earth-clouds.jpg",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("/"))),
  );
});
