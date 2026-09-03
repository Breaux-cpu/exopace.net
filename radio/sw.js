const CACHE = "exopace-radio-v34";
// Do not precache index.html — in-place CSS (composer / pathLbl) must not pin.
const ASSETS = [
  "three.min.js",
  "manifest.json",
  "icon.svg",
  "icon-maskable.svg",
  "icon-192.png",
  "icon-512.png",
  "apple-touch-icon.png",
  "textures/earth-day.jpg",
  "textures/earth-night.jpg",
  "textures/earth-water.png",
];

function noStore(url) {
  const p = url.pathname;
  return (
    /(?:^|\/)(app|env|protocol|store|globe)\.js$/.test(p) ||
    p === "/radio" ||
    p === "/radio/" ||
    p === "/radio/index.html"
  );
}

function skip(url) {
  if (url.origin !== location.origin) return true;
  // Node AP CSVs and anything outside this PWA scope.
  if (!url.pathname.startsWith("/radio")) return true;
  return false;
}

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
      .catch(() => caches.match(e.request).then((m) => m || caches.match("./"))),
  );
});
