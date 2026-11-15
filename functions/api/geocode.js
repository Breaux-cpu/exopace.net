export async function onRequest(context) {
  const headers = { "content-type": "application/json; charset=utf-8" };
  if (context.request.method !== "GET") {
    return new Response("[]", { status: 405, headers: { allow: "GET", "content-type": headers["content-type"] } });
  }
  const origin = context.request.headers.get("origin");
  if (origin && origin !== "https://exopace.net" && origin !== "https://www.exopace.net") {
    return new Response("[]", { status: 403, headers: headers });
  }
  const q = new URL(context.request.url).searchParams.get("q");
  const text = String(q || "").trim();
  if (text.length < 2 || text.length > 80) {
    return new Response("[]", { headers: headers });
  }
  const upstream = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" + encodeURIComponent(text);
  const res = await fetch(upstream, {
    headers: {
      "user-agent": "exopace.net/maps (https://exopace.net/maps/)",
      accept: "application/json",
    },
  });
  if (!res.ok) {
    return new Response("[]", { status: 200, headers: headers });
  }
  const rows = await res.json();
  const out = (Array.isArray(rows) ? rows : []).slice(0, 5).map(function (row) {
    return {
      lat: Number(row.lat),
      lon: Number(row.lon),
      label: String(row.display_name || "").slice(0, 140),
    };
  }).filter(function (row) {
    return Number.isFinite(row.lat) && Number.isFinite(row.lon) && Math.abs(row.lat) <= 90 && Math.abs(row.lon) <= 180;
  });
  return new Response(JSON.stringify(out), {
    headers: {
      "content-type": headers["content-type"],
      "cache-control": "public, max-age=300",
    },
  });
}
