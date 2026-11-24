function finiteNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value > -999990 ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= -999990) return null;
  return parsed;
}

function seriesSite(series) {
  const codes = series && series.sourceInfo && series.sourceInfo.siteCode;
  const id = Array.isArray(codes) && codes[0] ? codes[0].value : null;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function seriesPoint(series) {
  const geo = series && series.sourceInfo && series.sourceInfo.geoLocation && series.sourceInfo.geoLocation.geogLocation;
  if (!geo) return null;
  const lat = finiteNumber(geo.latitude);
  const lon = finiteNumber(geo.longitude);
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

function seriesCode(series) {
  const codes = series && series.variable && series.variable.variableCode;
  const id = Array.isArray(codes) && codes[0] ? String(codes[0].value || "") : "";
  if (id.indexOf("00065") === 0) return "stageFt";
  if (id.indexOf("00060") === 0) return "flowCfs";
  return null;
}

function seriesValue(series) {
  const rows = series && series.values && series.values[0] && series.values[0].value;
  if (!Array.isArray(rows) || !rows.length) return null;
  return finiteNumber(rows[0].value);
}

export function parseUsgs(payload) {
  const series = payload && payload.value && payload.value.timeSeries;
  if (!Array.isArray(series)) return [];
  const bySite = new Map();
  for (const row of series) {
    const site = seriesSite(row);
    const point = seriesPoint(row);
    const field = seriesCode(row);
    const value = seriesValue(row);
    if (!site || !point || !field || value == null) continue;
    const gauge = bySite.get(site) || { site, lat: point.lat, lon: point.lon, stageFt: null, flowCfs: null };
    gauge[field] = value;
    bySite.set(site, gauge);
  }
  return [...bySite.values()].filter((gauge) => gauge.stageFt != null || gauge.flowCfs != null);
}

export function parseTides(payload) {
  if (!payload || payload.error) return [];
  const rows = Array.isArray(payload.data) ? payload.data : [];
  const meta = payload.metadata || {};
  const lat = finiteNumber(meta.lat);
  const lon = finiteNumber(meta.lon);
  const tides = [];
  for (const row of rows) {
    const levelM = finiteNumber(row && row.v);
    if (levelM == null) continue;
    tides.push({
      station: meta.id != null ? String(meta.id) : null,
      lat,
      lon,
      levelM,
      time: row && row.t ? String(row.t) : null,
    });
  }
  return tides;
}

async function readJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "exopace.net" } });
  if (!res.ok) return null;
  return res.json();
}

export async function onRequest(context) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  };
  const empty = { ok: false, status: "NO SITE", gauges: [], tides: [] };
  let site = "";
  let station = "";
  try {
    const url = new URL(context.request.url);
    site = (url.searchParams.get("site") || "").trim();
    station = (url.searchParams.get("station") || "").trim();
  } catch {
    return Response.json(empty, { status: 200, headers });
  }
  if (!/^\d{6,15}$/.test(site)) site = "";
  if (!/^\d{6,10}$/.test(station)) station = "";
  if (!site && !station) return Response.json(empty, { status: 200, headers });
  try {
    const gauges = site
      ? parseUsgs(await readJson(`https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00060,00065`))
      : [];
    const tides = station
      ? parseTides(await readJson(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=${station}&product=water_level&datum=MLLW&time_zone=gmt&units=metric&format=json&date=latest`))
      : [];
    const live = gauges.length > 0 || tides.length > 0;
    return Response.json({ ok: live, status: live ? "LIVE" : "OFFLINE", gauges, tides }, { headers });
  } catch {
    return Response.json({ ok: false, status: "OFFLINE", gauges: [], tides: [] }, { status: 200, headers });
  }
}
