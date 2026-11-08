function signed(text, positive, negative) {
  const raw = String(text || "").trim();
  const match = raw.match(/^(-?[0-9.]+)\s*([A-Za-z])?$/);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;
  const hemi = (match[2] || "").toUpperCase();
  if (hemi === negative) return -Math.abs(value);
  if (hemi === positive) return Math.abs(value);
  return value;
}

const LABELS = {
  TD: "Tropical depression",
  TS: "Tropical storm",
  HU: "Hurricane",
  TY: "Typhoon",
  ST: "Tropical storm",
  TC: "Tropical cyclone",
  STD: "Subtropical depression",
  SS: "Subtropical storm",
  PTC: "Potential tropical cyclone",
  DB: "Disturbance",
};

export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  };
  try {
    const res = await fetch("https://www.nhc.noaa.gov/CurrentStorms.json", {
      headers: { accept: "application/json", "user-agent": "exopace.net" },
    });
    if (!res.ok) return Response.json({ type: "FeatureCollection", features: [] }, { headers });
    const data = await res.json();
    const storms = Array.isArray(data.activeStorms) ? data.activeStorms : [];
    const features = [];
    for (let i = 0; i < storms.length; i++) {
      const storm = storms[i];
      if (!storm) continue;
      const lat = Number.isFinite(Number(storm.latitudeNumeric))
        ? Number(storm.latitudeNumeric)
        : signed(storm.latitude, "N", "S");
      const lon = Number.isFinite(Number(storm.longitudeNumeric))
        ? Number(storm.longitudeNumeric)
        : signed(storm.longitude, "E", "W");
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      const code = String(storm.classification || "").toUpperCase();
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
        properties: {
          kind: "storm",
          id: storm.id ? String(storm.id) : "",
          name: storm.name ? String(storm.name) : "Storm",
          label: LABELS[code] || code || "Storm",
          wind: storm.intensity ? String(storm.intensity) + " kt" : "",
          pressure: storm.pressure ? String(storm.pressure) + " mb" : "",
          when: storm.lastUpdate ? String(storm.lastUpdate) : "",
        },
      });
    }
    return Response.json({ type: "FeatureCollection", features }, { headers });
  } catch (err) {
    return Response.json({ type: "FeatureCollection", features: [] }, { headers });
  }
}
