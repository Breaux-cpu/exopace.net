const CACHE = "exopace-maps-v25";
const SHARED = ["/assets/exo-modern.css", "/assets/exo-tabs.js", "/assets/exo-cmd.js"];
const SHELL = [
  "/maps/",
  "/maps/index.html",
  "/maps/maps.css?v=7",
  "/maps/legend.html",
  "/maps/host.json",
  "/maps/mgrs.js?v=1",
  "/maps/measure.js?v=4",
  "/maps/sheets.js?v=10",
  "/maps/terrain.js?v=2",
  "/maps/style.js?v=5",
  "/maps/print.js?v=6",
  "/maps/atak.js?v=3",
  "/maps/search.js?v=1",
  "/maps/garmin.js?v=2",
  "/maps/overlays.js?v=2",
  "/maps/mbtiles.js?v=1",
  "/maps/topo.js?v=5",
  "/maps/app.js?v=21",
  "/maps/vendor/maplibre-gl.js?v=1",
  "/maps/vendor/maplibre-gl.css?v=1",
  "/maps/manifest.webmanifest",
  "/icon.svg",
];

function shared(url) {
  return SHARED.indexOf(url.pathname) !== -1;
}

function precacheShared(cache) {
  return Promise.all(SHARED.map((path) =>
    fetch(path, { cache: "reload" }).then((r) => {
      if (!r.ok) throw new Error(path);
      return cache.put(path, r);
    }),
  ));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all([cache.addAll(SHELL), precacheShared(cache)])).then(() => self.skipWaiting()));
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
  if (!url.pathname.startsWith("/maps/") && url.pathname !== "/icon.svg" && !shared(url)) return;
  event.respondWith(
    fetch(shared(url) ? new Request(req, { cache: "reload" }) : req).then((res) => {
      if (res.ok && (url.pathname.startsWith("/maps/") || shared(url))) {
        const copy = res.clone();
        const bare = shared(url) ? res.clone() : null;
        caches.open(CACHE).then((cache) => {
          const jobs = [cache.put(req, copy)];
          if (bare) jobs.push(cache.put(url.pathname, bare));
          return Promise.all(jobs);
        });
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => {
      if (hit) return hit;
      if (shared(url)) return caches.match(url.pathname).then((s) => s || caches.match("/maps/index.html"));
      return caches.match("/maps/index.html");
    })),
  );
});
