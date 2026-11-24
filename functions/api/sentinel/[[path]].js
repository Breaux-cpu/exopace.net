const ALLOW = new Set(["https://exopace.net", "https://www.exopace.net"]);

function cors(request) {
  const headers = new Headers();
  const origin = request.headers.get("origin");
  if (origin && ALLOW.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
    headers.set("access-control-allow-credentials", "true");
  }
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  return headers;
}

export async function onRequest(context) {
  const req = context.request;
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  const url = new URL(req.url);
  const dest = "https://cams.exopace.net" + url.pathname + url.search;
  const headers = new Headers();
  const type = req.headers.get("content-type");
  if (type) headers.set("content-type", type);
  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);
  let res;
  try {
    res = await fetch(dest, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req.body,
      redirect: "manual",
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: "OFFLINE" }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
  const out = new Headers();
  const responseType = res.headers.get("content-type");
  if (responseType) out.set("content-type", responseType);
  out.set("cache-control", "private, no-store");
  cors(req).forEach(function (value, key) { out.set(key, value); });
  return new Response(res.body, { status: res.status, headers: out });
}
