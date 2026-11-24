const R = 6371000;

export function haversineMeters(a, b) {
  const p1 = a.lat * Math.PI / 180;
  const p2 = b.lat * Math.PI / 180;
  const dphi = (b.lat - a.lat) * Math.PI / 180;
  const dl = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dphi / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const LIVE_DAYS = 7;

export function epochAgeDays(line, now = Date.now()) {
  const yy = Number(String(line).slice(18, 20));
  const day = Number(String(line).slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(day)) return null;
  const year = yy >= 57 ? 1900 + yy : 2000 + yy;
  const epoch = Date.UTC(year, 0, 1) + (day - 1) * 86400000;
  return (now - epoch) / 86400000;
}

export function feedState(ageDays) {
  if (ageDays == null || !Number.isFinite(ageDays) || ageDays < 0) return "ERROR";
  if (ageDays <= LIVE_DAYS) return "LIVE";
  return "STALE";
}

export function validWatch(kind, value) {
  const text = String(value || "").trim();
  if (kind === "norad") return /^\d{1,6}$/.test(text);
  if (kind === "icao") return /^[0-9a-fA-F]{6}$/.test(text);
  if (kind === "mmsi") return /^\d{7,9}$/.test(text);
  if (kind === "camera") return /^[A-Za-z0-9_.:-]{1,80}$/.test(text);
  if (kind === "rf") return Number(text) > 0;
  return false;
}

export function findBird(birds, norad) {
  const id = String(parseInt(norad, 10));
  if (!id || id === "NaN") return null;
  return (birds || []).find((row) => row.norad === id) || null;
}

export function catalogNote(birds, norad, now = Date.now()) {
  const bird = findBird(birds, norad);
  if (!bird) return "ERROR";
  return feedState(epochAgeDays(bird.l1, now));
}

export function findAircraft(list, hex) {
  const want = String(hex || "").toLowerCase();
  return (list || []).find((row) => String(row.id || "").toLowerCase() === want) || null;
}

export function findShip(list, mmsi) {
  const want = String(mmsi || "");
  return (list || []).find((row) => String(row.id) === want) || null;
}

export function insideFence(fence, point) {
  if (!fence || !point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return false;
  return haversineMeters({ lat: fence.lat, lon: fence.lon }, point) <= fence.radiusM;
}

export function rankText(text) {
  const line = String(text || "");
  if (line.includes("INSIDE")) return 2;
  if (/EL |AIR |SEA |NORAD|CAMERA/.test(line)) return 1;
  return 0;
}
