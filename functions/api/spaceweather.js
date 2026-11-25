function kpNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

export function parseKp(payload) {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const header = Array.isArray(payload[0]) ? payload[0].map((cell) => String(cell)) : null;
  if (header) {
    if (payload.length < 2) return null;
    const idx = header.indexOf("Kp");
    if (idx < 0) return null;
    const last = payload[payload.length - 1];
    if (!Array.isArray(last)) return null;
    return kpNumber(last[idx]);
  }
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const row = payload[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const value = kpNumber(row.Kp);
    if (value != null) return value;
  }
  return null;
}

export async function onRequest() {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=300",
    "access-control-allow-origin": "*",
  };
  try {
    const res = await fetch("https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json", {
      headers: { accept: "application/json", "user-agent": "exopace.net" },
    });
    if (!res.ok) {
      return Response.json({ ok: false, status: "OFFLINE", kp: null, fof2: null, s4: null }, { status: 200, headers });
    }
    const payload = await res.json();
    const kp = parseKp(payload);
    return Response.json({
      ok: kp != null,
      status: kp != null ? "LIVE" : "OFFLINE",
      kp,
      fof2: null,
      s4: null,
    }, { headers });
  } catch {
    return Response.json({ ok: false, status: "OFFLINE", kp: null, fof2: null, s4: null }, { status: 200, headers });
  }
}
