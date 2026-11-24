export async function onRequest(context) {
  const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=86400" };
  if (context.request.method !== "GET") {
    return new Response(JSON.stringify({ ok: false, error: "GET" }), {
      status: 405,
      headers: { allow: "GET", "content-type": headers["content-type"] },
    });
  }
  const origin = context.request.headers.get("origin");
  if (origin && origin !== "https://exopace.net" && origin !== "https://www.exopace.net" && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return new Response(JSON.stringify({ ok: false, error: "origin" }), { status: 403, headers: headers });
  }
  const url = new URL(context.request.url);
  const points = pointsFrom(url);
  if (!points) {
    return new Response(JSON.stringify({ ok: false, error: "points" }), { status: 400, headers: headers });
  }
  const lats = points.map((p) => p.lat.toFixed(5)).join(",");
  const lons = points.map((p) => p.lon.toFixed(5)).join(",");
  const upstream = "https://api.open-meteo.com/v1/elevation?latitude=" + lats + "&longitude=" + lons;
  let rows = null;
  try {
    const res = await fetch(upstream, { headers: { "user-agent": "exopace.net/maps (https://exopace.net/maps/)", accept: "application/json" } });
    if (res.ok) {
      const body = await res.json();
      rows = Array.isArray(body.elevation) ? body.elevation : null;
    }
  } catch (err) {
    rows = null;
  }
  if (!rows || rows.length !== points.length) {
    return new Response(JSON.stringify({ ok: false, error: "elevation", samples: [] }), { status: 200, headers: headers });
  }
  let walked = 0;
  const samples = points.map((point, i) => {
    if (i > 0) walked += haversine(points[i - 1], point);
    const elev = Number(rows[i]);
    return {
      lat: point.lat,
      lon: point.lon,
      elev: Number.isFinite(elev) ? elev : null,
      dM: Math.round(walked),
    };
  });
  return new Response(JSON.stringify({ ok: true, source: "open-meteo", samples: samples }), { headers: headers });
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pair(text) {
  const bits = String(text || "").split(",");
  if (bits.length !== 2) return null;
  const lat = num(bits[0]);
  const lon = num(bits[1]);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: lat, lon: lon };
}

function pointsFrom(url) {
  const singleLat = num(url.searchParams.get("lat"));
  const singleLon = num(url.searchParams.get("lon"));
  if (singleLat != null && singleLon != null && Math.abs(singleLat) <= 90 && Math.abs(singleLon) <= 180 && !url.searchParams.get("a")) {
    return [{ lat: singleLat, lon: singleLon }];
  }
  const a = pair(url.searchParams.get("a"));
  const b = pair(url.searchParams.get("b"));
  if (!a || !b) return null;
  let n = Number(url.searchParams.get("n") || 48);
  if (!Number.isFinite(n)) n = 48;
  n = Math.max(2, Math.min(80, Math.round(n)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1);
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
  }
  return out;
}

function haversine(a, b) {
  const r = 6371000;
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dp = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}
