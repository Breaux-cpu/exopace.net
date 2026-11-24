const FILES = ["stations.txt", "weather.txt", "visual.txt"];

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function objectType(name) {
  const upper = name.toUpperCase();
  if (upper.includes("R/B") || upper.includes("ROCKET")) return "rocket-body";
  if (upper.includes("DEB")) return "debris";
  return "payload";
}

export function epochToIso(yearText, dayText) {
  const year = Number(yearText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isFinite(day)) return "";
  const full = year >= 57 ? 1900 + year : 2000 + year;
  const ms = Date.UTC(full, 0, 1) + (day - 1) * 86400000;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function altitudeFromMotion(meanMotion) {
  if (!Number.isFinite(meanMotion) || meanMotion <= 0) return Number.NaN;
  const mu = 398600.4418;
  const seconds = 86400 / meanMotion;
  const axis = Math.cbrt((mu * seconds * seconds) / (4 * Math.PI * Math.PI));
  return axis - 6378.137;
}

export function parseCatalog(text) {
  const lines = String(text).split(/\r?\n/);
  const rows = [];
  const seen = new Set();
  let i = 0;
  while (i < lines.length - 2) {
    const name = lines[i].trim();
    const line1 = lines[i + 1] || "";
    const line2 = lines[i + 2] || "";
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ") || name.length < 1) {
      i += 1;
      continue;
    }
    const noradId = Number(line1.slice(2, 7));
    const inclination = Number(line2.slice(8, 16));
    const eccentricity = Number(`0.${line2.slice(26, 33).trim()}`);
    const meanMotion = Number(line2.slice(52, 63));
    const altitudeKm = altitudeFromMotion(meanMotion);
    const tleUpdatedAt = epochToIso(line1.slice(18, 20), line1.slice(20, 32));
    i += 3;
    if (!Number.isInteger(noradId) || noradId < 1 || noradId > 999999) continue;
    if (seen.has(noradId)) continue;
    if (![inclination, eccentricity, altitudeKm].every(Number.isFinite) || !tleUpdatedAt) continue;
    seen.add(noradId);
    rows.push({
      schemaVersion: "1.0.0",
      id: `sat-${noradId}`,
      noradId,
      name: name.slice(0, 200),
      type: objectType(name),
      status: altitudeKm > 80 ? "operational" : "offline",
      tleUpdatedAt,
      orbitalParameters: {
        inclination: round(inclination),
        altitudeKm: round(Math.max(0, Math.min(200000, altitudeKm))),
        eccentricity: round(Math.max(0, Math.min(0.999, eccentricity)), 7),
      },
    });
  }
  return rows;
}

export function findSatellite(rows, noradId) {
  return rows.find((row) => row.noradId === noradId) || null;
}

export async function loadCatalog(context) {
  if (context && typeof context.catalogText === "string") return parseCatalog(context.catalogText);
  if (context && context.env && context.env.ASSETS && context.request) {
    const parts = [];
    for (const name of FILES) {
      const url = new URL(`/tle/${name}`, context.request.url);
      const res = await context.env.ASSETS.fetch(new Request(url));
      if (res.ok) parts.push(await res.text());
    }
    return parseCatalog(parts.join("\n"));
  }
  try {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tle");
    return parseCatalog(FILES.map((name) => readFileSync(join(dir, name), "utf8")).join("\n"));
  } catch {
    return [];
  }
}
