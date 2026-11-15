/* View-sized overlays. Fixed queries only. No open proxy. */
export async function onRequest(context) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (context.request.method !== "GET") {
    return json({ error: "method" }, 405, { allow: "GET" });
  }
  const origin = context.request.headers.get("origin");
  if (origin && origin !== "https://exopace.net" && origin !== "https://www.exopace.net") {
    return json({ error: "origin" }, 403);
  }
  const url = new URL(context.request.url);
  const kind = url.searchParams.get("kind");
  const box = readBox(url);
  if (!box) return json({ error: "bbox" }, 400);
  const span = kind === "flood" ? 0.75 : 0.45;
  if (box.n - box.s > span || box.e - box.w > span) return json({ error: "zoom", features: [] }, 200);
  if (kind === "flood") return flood(box);
  if (kind === "ham" || kind === "leaf") return osm(kind, box);
  return json({ error: "kind" }, 400);
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({
      "content-type": "application/json; charset=utf-8",
      "cache-control": body && body.error ? "public, max-age=60" : "public, max-age=300",
    }, extra || {}),
  });
}

function readBox(url) {
  const s = Number(url.searchParams.get("s"));
  const w = Number(url.searchParams.get("w"));
  const n = Number(url.searchParams.get("n"));
  const e = Number(url.searchParams.get("e"));
  if (![s, w, n, e].every(Number.isFinite)) return null;
  if (s < -90 || n > 90 || w < -180 || e > 180) return null;
  if (!(s < n) || !(w < e)) return null;
  return { s: s, w: w, n: n, e: e };
}

function slim(geom) {
  if (!geom || typeof geom.type !== "string") return null;
  let tooBig = false;
  function pair(c) {
    if (!Array.isArray(c) || c.length < 2) return null;
    const lon = Number(c[0]);
    const lat = Number(c[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    return [Math.round(lon * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5];
  }
  function line(list, min) {
    if (!Array.isArray(list)) return null;
    if (list.length > 800) {
      tooBig = true;
      return null;
    }
    const out = [];
    for (const item of list) {
      const p = pair(item);
      if (p) out.push(p);
    }
    return out.length >= min ? out : null;
  }
  if (geom.type === "Point") {
    const p = pair(geom.coordinates);
    return p ? { type: "Point", coordinates: p } : null;
  }
  if (geom.type === "LineString") {
    const coords = line(geom.coordinates, 2);
    return coords ? { type: "LineString", coordinates: coords } : null;
  }
  if (geom.type === "Polygon") {
    const rings = [];
    for (const ring of (geom.coordinates || []).slice(0, 3)) {
      const coords = line(ring, 4);
      if (coords) rings.push(coords);
    }
    return rings.length && !tooBig ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geom.type === "MultiPolygon") {
    const polys = [];
    for (const poly of (geom.coordinates || []).slice(0, 6)) {
      const rings = [];
      for (const ring of (poly || []).slice(0, 2)) {
        const coords = line(ring, 4);
        if (coords) rings.push(coords);
      }
      if (rings.length) polys.push(rings);
    }
    return polys.length && !tooBig ? { type: "MultiPolygon", coordinates: polys } : null;
  }
  return null;
}

async function flood(box) {
  const geometry = box.w + "," + box.s + "," + box.e + "," + box.n;
  const upstream = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
    + "?where=1%3D1&geometry=" + encodeURIComponent(geometry)
    + "&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects"
    + "&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=true&outSR=4326&f=geojson"
    + "&resultRecordCount=300&geometryPrecision=5";
  try {
    const res = await fetch(upstream, { headers: { accept: "application/json" } });
    if (!res.ok) return json({ error: "unavailable", features: [] });
    const data = await res.json();
    if (data.exceededTransferLimit) return json({ error: "zoom", features: [] });
    const features = [];
    let truncated = false;
    for (const row of Array.isArray(data.features) ? data.features : []) {
      if (features.length >= 300) {
        truncated = true;
        break;
      }
      const geom = slim(row.geometry);
      const zone = String((row.properties && row.properties.FLD_ZONE) || "");
      if (!geom || !zone) {
        if (!geom && row.geometry) truncated = true;
        continue;
      }
      features.push({
        type: "Feature",
        properties: {
          zone: zone.slice(0, 12),
          subtype: String((row.properties && row.properties.ZONE_SUBTY) || "").slice(0, 40),
          source: "FEMA NFHL",
        },
        geometry: geom,
      });
    }
    return json({ features: features, truncated: truncated, source: "FEMA NFHL" });
  } catch (err) {
    return json({ error: "unavailable", features: [] });
  }
}

function osmQuery(kind, box) {
  const b = "(" + box.s + "," + box.w + "," + box.n + "," + box.e + ")";
  if (kind === "ham") {
    return "[out:json][timeout:14];node[\"communication:amateur_radio\"]" + b + ";out body 200;";
  }
  return "[out:json][timeout:14];("
    + "way[\"natural\"=\"wood\"][\"leaf_type\"]" + b + ";"
    + "way[\"landuse\"=\"forest\"][\"leaf_type\"]" + b + ";"
    + "way[\"natural\"=\"wood\"][\"leaf_cycle\"]" + b + ";"
    + "way[\"landuse\"=\"forest\"][\"leaf_cycle\"]" + b + ";"
    + ");out geom 200;";
}

function osmFeatures(kind, elements) {
  const features = [];
  let truncated = elements.length >= 200;
  for (const el of elements.slice(0, 200)) {
    const tags = el.tags || {};
    if (kind === "ham") {
      if (el.type !== "node" || !Number.isFinite(el.lat) || !Number.isFinite(el.lon)) continue;
      const raw = String(tags["communication:amateur_radio"] || "");
      const call = raw && raw !== "yes" && raw !== "no" ? raw : String(tags.callsign || "");
      features.push({
        type: "Feature",
        properties: {
          label: (call || "OSM amateur radio").slice(0, 32),
          source: "OpenStreetMap",
        },
        geometry: { type: "Point", coordinates: [Math.round(el.lon * 1e5) / 1e5, Math.round(el.lat * 1e5) / 1e5] },
      });
      continue;
    }
    const leaf = String(tags.leaf_type || "");
    const cycle = String(tags.leaf_cycle || "");
    const ring = (el.geometry || []).map(function (p) { return [p.lon, p.lat]; });
    if (ring.length < 4 || (!leaf && !cycle)) continue;
    const a = ring[0];
    const b = ring[ring.length - 1];
    if (Math.abs(a[0] - b[0]) > 1e-5 || Math.abs(a[1] - b[1]) > 1e-5) continue;
    const geom = slim({ type: "Polygon", coordinates: [ring] });
    if (!geom) {
      truncated = true;
      continue;
    }
    features.push({
      type: "Feature",
      properties: { leaf: leaf.slice(0, 24), cycle: cycle.slice(0, 24), source: "OpenStreetMap" },
      geometry: geom,
    });
  }
  return { features: features, truncated: truncated };
}

async function osm(kind, box) {
  const body = osmQuery(kind, box);
  const hosts = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];
  for (const host of hosts) {
    try {
      const res = await fetch(host, {
        method: "POST",
        headers: {
          "user-agent": "exopace.net/maps (https://exopace.net/maps/)",
          "content-type": "application/x-www-form-urlencoded",
          accept: "application/json",
        },
        body: "data=" + encodeURIComponent(body),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      const out = osmFeatures(kind, elements);
      out.source = "OpenStreetMap";
      return json(out);
    } catch (err) {
      /* try the next interpreter */
    }
  }
  return json({ error: "unavailable", features: [], source: "OpenStreetMap" });
}
