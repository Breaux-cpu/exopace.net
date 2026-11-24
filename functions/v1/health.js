import { envelope, json } from "./_lib/envelope.js";

export async function onRequest() {
  const started = Date.now();
  const body = envelope({
    success: true,
    data: { status: "operational" },
    source: "health",
    tenantId: "exopace-public",
    started,
  });
  return json(body, 200, true);
}
