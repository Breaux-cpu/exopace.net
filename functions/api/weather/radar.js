export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=120",
    "access-control-allow-origin": "*",
  };
  try {
    const res = await fetch("https://api.rainviewer.com/public/weather-maps.json", {
      headers: { accept: "application/json", "user-agent": "exopace.net" },
    });
    if (!res.ok) return Response.json({ host: "", frames: [] }, { headers });
    const data = await res.json();
    const past = data && data.radar && Array.isArray(data.radar.past) ? data.radar.past : [];
    const frames = [];
    for (let i = 0; i < past.length; i++) {
      const frame = past[i];
      if (!frame || !frame.path) continue;
      frames.push({ time: Number(frame.time) || 0, path: String(frame.path) });
    }
    return Response.json({ host: data.host || "", frames }, { headers });
  } catch (err) {
    return Response.json({ host: "", frames: [] }, { headers });
  }
}
