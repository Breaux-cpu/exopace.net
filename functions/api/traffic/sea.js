export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=60",
    "access-control-allow-origin": "*",
  };
  const empty = { region: "Baltic", ships: [] };
  try {
    const res = await fetch("https://meri.digitraffic.fi/api/ais/v1/locations", {
      headers: {
        accept: "application/json",
        "accept-encoding": "gzip",
        "digitraffic-user": "EXOpace/1.0",
        "user-agent": "EXOpace/1.0",
      },
    });
    if (!res.ok) return Response.json(empty, { headers });
    const data = await res.json();
    const features = data && Array.isArray(data.features) ? data.features : [];
    const ships = [];
    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      const coords = feature && feature.geometry && feature.geometry.coordinates;
      if (!coords) continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const props = feature.properties || {};
      const id = feature.mmsi || props.mmsi || i;
      ships.push({
        id: String(id),
        lon,
        lat,
        heading: Number(props.heading) || Number(props.cog) || 0,
        speed: Number(props.sog) || 0,
      });
    }
    return Response.json({ region: "Baltic", ships }, { headers });
  } catch (err) {
    return Response.json(empty, { headers });
  }
}
