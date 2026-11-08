const CENTERS = [
  [40.7, -74.0],
  [33.7, -84.4],
  [41.9, -87.6],
  [32.8, -96.8],
  [39.7, -104.9],
  [34.0, -118.2],
  [47.6, -122.3],
  [25.8, -80.2],
  [51.5, -0.1],
  [50.1, 8.7],
  [48.9, 2.3],
  [41.0, 29.0],
  [25.2, 55.3],
  [1.3, 103.8],
  [35.7, 139.7],
  [22.3, 114.2],
  [28.6, 77.2],
  [-33.9, 151.2],
  [-23.5, -46.6],
  [19.4, -99.1],
  [6.5, 3.4],
  [-26.2, 28.0],
];

function meters(feet) {
  const value = Number(feet);
  return Number.isFinite(value) ? value * 0.3048 : 0;
}

function metersPerSecond(knots) {
  const value = Number(knots);
  return Number.isFinite(value) ? value * 0.514444 : 0;
}

function vertical(fpm) {
  const value = Number(fpm);
  return Number.isFinite(value) ? value * 0.00508 : null;
}

function fromAc(row) {
  if (!row) return null;
  const lat = Number(row.lat);
  const lon = Number(row.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const onGround = row.alt_baro === "ground";
  return {
    id: row.hex ? String(row.hex).trim() : "",
    call: row.flight ? String(row.flight).trim() : "",
    lon,
    lat,
    alt: onGround ? 0 : meters(row.alt_baro),
    geo: meters(row.alt_geom),
    heading: Number(row.track) || 0,
    speed: metersPerSecond(row.gs),
    vrate: vertical(row.baro_rate),
    ground: onGround,
    squawk: row.squawk ? String(row.squawk) : "",
    category: row.category ? String(row.category) : "",
  };
}

async function fromAdsb() {
  const found = new Map();
  await Promise.all(CENTERS.map(async (center) => {
    const url = "https://api.adsb.lol/v2/lat/" + center[0] + "/lon/" + center[1] + "/dist/250";
    try {
      const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "exopace.net" } });
      if (!res.ok) return;
      const data = await res.json();
      const list = Array.isArray(data.ac) ? data.ac : [];
      for (let i = 0; i < list.length; i++) {
        const craft = fromAc(list[i]);
        if (!craft || !craft.id || found.has(craft.id)) continue;
        found.set(craft.id, craft);
      }
    } catch (err) {
      /* one region failing leaves the others */
    }
  }));
  return Array.from(found.values());
}

export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=15",
    "access-control-allow-origin": "*",
  };
  const aircraft = await fromAdsb();
  return Response.json({ aircraft }, { headers });
}
