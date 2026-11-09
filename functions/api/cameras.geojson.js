const SUPABASE = "https://ywnsnvjewoyhblaljnwf.supabase.co/rest/v1/cameras";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl3bnNudmpld295aGJsYWxqbndmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQxODQyMDEsImV4cCI6MjEwOTc2MDIwMX0.DepOVQnB3dVIdvWwa55NTI5ALdQfPz3nvrCWSluj5X4";

function boxOf(raw) {
  const parts = String(raw || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { west: parts[0], south: parts[1], east: parts[2], north: parts[3] };
}

export async function onRequest(context) {
  const headers = {
    "content-type": "application/geo+json; charset=utf-8",
    "cache-control": "public, max-age=30",
    "access-control-allow-origin": "*",
  };
  const empty = { type: "FeatureCollection", features: [] };
  try {
    const incoming = new URL(context.request.url);
    const box = boxOf(incoming.searchParams.get("bbox"));
    const asked = Number(incoming.searchParams.get("max") || 800);
    const limit = Number.isFinite(asked) ? Math.min(Math.max(Math.floor(asked), 1), 2000) : 800;
    const query = new URL(SUPABASE);
    query.searchParams.set("select", "id,name,lat,lon,source,image_url,stream_url");
    query.searchParams.set("limit", String(limit));
    if (box) {
      query.searchParams.set("lat", "gte." + box.south);
      query.searchParams.append("lat", "lte." + box.north);
      query.searchParams.set("lon", "gte." + box.west);
      query.searchParams.append("lon", "lte." + box.east);
    }
    const res = await fetch(query, {
      headers: { apikey: ANON, authorization: "Bearer " + ANON, accept: "application/json" },
    });
    if (!res.ok) return Response.json(empty, { headers });
    const rows = await res.json();
    const features = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lat = Number(row.lat);
      const lon = Number(row.lon);
      if (!row || !row.id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      features.push({
        type: "Feature",
        id: String(row.id),
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          id: String(row.id),
          name: row.name ? String(row.name) : "",
          source: row.source ? String(row.source) : "",
          image: row.image_url ? String(row.image_url) : "",
          stream: row.stream_url ? String(row.stream_url) : "",
          m: "r",
        },
      });
    }
    return Response.json({ type: "FeatureCollection", features }, { headers });
  } catch (err) {
    return Response.json(empty, { headers });
  }
}
