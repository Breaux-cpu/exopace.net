export const VERSION = "1.0.0";

export function stamp(date = new Date()) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function requestId() {
  return `req-${Math.random().toString(36).slice(2, 12)}`;
}

export function envelope({ success, data, errors, source, tenantId, started }) {
  const body = {
    schemaVersion: VERSION,
    success,
    requestId: requestId(),
    timestamp: stamp(),
    version: VERSION,
    metadata: {
      latencyMs: Math.max(0, Math.min(60000, Date.now() - started)),
      source,
      tenantId,
    },
  };
  if (data !== undefined) body.data = data;
  if (errors) body.errors = errors;
  return body;
}

export function apiError(code, message, category) {
  return { schemaVersion: VERSION, code, message, category };
}

export function json(body, status, cors) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  };
  if (cors) headers["access-control-allow-origin"] = "*";
  return Response.json(body, { status, headers });
}
