export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=15",
    "access-control-allow-origin": "*",
  };
  try {
    const res = await fetch("https://opensky-network.org/api/states/all", {
      headers: { accept: "application/json", "user-agent": "exopace.net" },
    });
    if (!res.ok) return Response.json({ aircraft: [] }, { headers });
    const data = await res.json();
    const states = Array.isArray(data.states) ? data.states : [];
    const aircraft = [];
    for (let i = 0; i < states.length; i++) {
      const row = states[i];
      if (!row) continue;
      const lon = Number(row[5]);
      const lat = Number(row[6]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const alt = Number(row[7]);
      aircraft.push({
        id: row[0] ? String(row[0]).trim() : "",
        call: row[1] ? String(row[1]).trim() : "",
        country: row[2] ? String(row[2]) : "",
        lon,
        lat,
        alt: Number.isFinite(alt) ? alt : 0,
        ground: row[8] === true,
        speed: Number(row[9]) || 0,
        heading: Number(row[10]) || 0,
        vrate: row[11] == null ? null : Number(row[11]),
      });
    }
    return Response.json({ aircraft }, { headers });
  } catch (err) {
    return Response.json({ aircraft: [] }, { headers });
  }
}
