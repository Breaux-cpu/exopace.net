/* SGP4 off the main thread. Main sends {type:'init', tles}|{type:'tick', epoch}. */
importScripts("satellite.min.js");

let recs = [];

function parseTles(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length - 2; i++) {
    if (!lines[i + 1].startsWith("1 ") || !lines[i + 2].startsWith("2 ")) continue;
    try {
      const rec = satellite.twoline2satrec(lines[i + 1], lines[i + 2]);
      out.push({
        id: lines[i + 1].slice(2, 7).trim(),
        name: lines[i].replace(/^0 /, ""),
        rec,
      });
    } catch (e) {}
    i += 2;
  }
  return out;
}

onmessage = (e) => {
  const msg = e.data || {};
  if (msg.type === "init") {
    recs = parseTles(msg.tle);
    postMessage({ type: "ready", count: recs.length });
    return;
  }
  if (msg.type === "tick") {
    const date = new Date(msg.epoch);
    const n = Math.min(recs.length, msg.cap || 200);
    const pos = new Float32Array(n * 3);
    const meta = [];
    for (let i = 0; i < n; i++) {
      const b = recs[i];
      try {
        const pv = satellite.propagate(b.rec, date);
        if (!pv.position) continue;
        const gd = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
        const lat = satellite.degreesLat(gd.latitude);
        const lon = satellite.degreesLong(gd.longitude);
        const alt = gd.height;
        const r = 1 + Math.max(alt, 80) / 6371;
        const th = (90 - lat) * Math.PI / 180;
        const ph = (lon + 180) * Math.PI / 180;
        const st = Math.sin(th);
        pos[i * 3] = -r * Math.cos(ph) * st;
        pos[i * 3 + 1] = r * Math.cos(th);
        pos[i * 3 + 2] = r * Math.sin(ph) * st;
        meta.push({ id: b.id, name: b.name, lat, lon, alt, i });
      } catch (err) {}
    }
    postMessage({ type: "pos", pos, meta, epoch: msg.epoch }, [pos.buffer]);
  }
};
