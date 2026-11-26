/* /api/cameras.geojson — the camera list for /cameras and the Mission CAMERAS layer.
 *
 * The old source (Supabase project ywnsnvjewoyhblaljnwf) no longer resolves, so
 * every request returned an empty list. The live catalogue now is EXOpace Cams
 * (cams.exopace.net, ~125k public cameras). Its list endpoint is a public read;
 * its picture endpoints need a Google sign-in on cams.exopace.net.
 *
 * Each feature says how it can play:
 *   play.type "image"  a public HTTPS still the browser can load directly
 *                      (Fintraffic Digitraffic, Hong Kong Transport Department).
 *                      Built from the camera id against an allowlist of two hosts;
 *                      no URL ever comes from the request, so this is not a proxy.
 *   play.type "cams"   plays through cams.exopace.net with the visitor's own
 *                      cams sign-in (same-site cookie, credentialed request).
 * Nothing is invented: a camera the catalogue does not return is not shown. */
const CAMS = "https://cams.exopace.net";

/** Readable network names for the catalogue's id prefixes. */
const NETWORKS = [
  [/^(?:digitraffic:|opencctv:digitraffic-)/, "Fintraffic Digitraffic"],
  [/^(?:hktd:|opencctv:hongkong-)/, "Hong Kong Transport Department"],
  [/^opencctv:caltrans-/, "Caltrans"],
  [/^opencctv:arcgis-TN-/, "TDOT SmartWay"],
  [/^opencctv:msdot-/, "MDOT Mississippi"],
  [/^opencctv:s511-LA-/, "511 Louisiana"],
  [/^opencctv:otcm-/, "Caltrans (OTCM)"],
  [/^opencctv:windy-/, "Windy webcams"],
  [/^faa:/, "FAA WeatherCams"],
  [/^511ga:/, "511 Georgia"],
  [/^ve_direct:/, "Vision Environnement"],
  [/^youtube_live:/, "YouTube live"],
  [/^earthcam:/, "EarthCam"],
  [/^foto_webcam_eu:/, "Foto-Webcam.eu"],
  [/^webcamera_pl:/, "webcamera.pl"],
];

function network(id) {
  for (const [re, name] of NETWORKS) if (re.test(id)) return name;
  const head = id.split(":")[0] || "";
  const sub = id.startsWith("opencctv:") ? (id.slice(9).split("-")[0] || "") : "";
  return (sub || head).replace(/_/g, " ");
}

/** Public HTTPS stills, derived from the id. Allowlisted hosts only. */
function directStill(id) {
  let m = id.match(/^digitraffic:(C\d{7})$/) || id.match(/^opencctv:digitraffic-C\d{5}-(C\d{7})$/);
  if (m) return { url: "https://weathercam.digitraffic.fi/" + m[1] + ".jpg", credit: "Fintraffic / digitraffic.fi, CC BY 4.0", credit_href: "https://creativecommons.org/licenses/by/4.0/" };
  m = id.match(/^hktd:([A-Z0-9]{2,12})$/) || id.match(/^opencctv:hongkong-([A-Z0-9]{2,12})$/);
  if (m) return { url: "https://tdcctv.data.one.gov.hk/" + m[1] + ".JPG", credit: "Transport Department, HKSAR Government, via DATA.GOV.HK", credit_href: "https://data.gov.hk/en/terms-and-conditions" };
  return null;
}

function boxOf(raw) {
  const parts = String(raw || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [w, s, e, n] = parts;
  if (s < -90 || n > 90 || s >= n) return null;
  return [Math.max(-180, w), s, Math.min(180, e), n].map((v) => Math.round(v * 1e5) / 1e5);
}

function toFeature(cam) {
  const lat = Number(cam && cam.lat);
  const lon = Number(cam && cam.lon);
  const id = cam && cam.id ? String(cam.id) : "";
  if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const still = directStill(id);
  const refresh = Number(cam.refresh_s);
  return {
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [lon, lat] },
    properties: {
      id,
      name: cam.name ? String(cam.name) : "",
      source: network(id),
      place: [cam.region, cam.country].filter(Boolean).join(", "),
      feed: cam.feed === "live" ? "live" : "image",
      health: cam.health ? String(cam.health) : "",
      refresh_s: Number.isFinite(refresh) && refresh > 0 ? refresh : 60,
      play: still
        ? { type: "image", url: still.url, credit: still.credit, credit_href: still.credit_href }
        : { type: "cams", api: CAMS + "/api/cameras/" + encodeURIComponent(id) },
      m: "r",
    },
  };
}

export async function onRequest(context) {
  const headers = {
    "content-type": "application/geo+json; charset=utf-8",
    "cache-control": "public, max-age=60",
    "access-control-allow-origin": "*",
  };
  const incoming = new URL(context.request.url);
  const box = boxOf(incoming.searchParams.get("bbox"));
  // Single-camera lookups need a cams sign-in; never answer one with an arbitrary camera.
  if (!box && incoming.searchParams.get("id")) return Response.json({ type: "FeatureCollection", features: [] }, { headers });
  const asked = Number(incoming.searchParams.get("max") || 800);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), 2000) : 800;
  const query = new URL(CAMS + "/api/cameras");
  query.searchParams.set("limit", String(limit));
  if (box) query.searchParams.set("bbox", box.join(","));
  const q = (incoming.searchParams.get("q") || "").trim().slice(0, 80);
  if (q) query.searchParams.set("q", q);
  if (incoming.searchParams.get("reachable") === "1") query.searchParams.set("reachable", "1");
  const feed = incoming.searchParams.get("feed");
  if (feed === "live" || feed === "other") query.searchParams.set("feed", feed);
  let rows;
  try {
    const res = await fetch(query, { headers: { accept: "application/json", "user-agent": "exopace.net cameras (+https://exopace.net/cameras/)" }, cf: { cacheTtl: 60, cacheEverything: true } });
    if (!res.ok) throw new Error("upstream " + res.status);
    const body = await res.json();
    rows = Array.isArray(body && body.cameras) ? body.cameras : null;
    if (!rows) throw new Error("bad body");
  } catch (err) {
    // Say the feed is down instead of pretending the area has no cameras.
    return Response.json({ type: "FeatureCollection", features: [], error: "CAMERA CATALOGUE UNREACHABLE" }, { status: 502, headers: { ...headers, "cache-control": "no-store" } });
  }
  const features = [];
  for (const cam of rows) {
    const f = toFeature(cam);
    if (f) features.push(f);
  }
  return Response.json({ type: "FeatureCollection", features, source: "cams.exopace.net" }, { headers });
}
