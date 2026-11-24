import { findSatellite, loadCatalog } from "../_lib/catalog.js";
import { apiError, envelope, json } from "../_lib/envelope.js";

export async function onRequest(context) {
  const started = Date.now();
  const noradId = Number(context.params && context.params.noradId);
  const rows = await loadCatalog(context);
  const row = Number.isInteger(noradId) ? findSatellite(rows, noradId) : null;
  if (!row) {
    return json(envelope({
      success: false,
      errors: [apiError("NOT_FOUND", "No catalog row for that object.", "validation")],
      source: "tle",
      tenantId: "exopace-public",
      started,
    }), 404, true);
  }
  return json(envelope({
    success: true,
    data: row,
    source: "tle",
    tenantId: "exopace-public",
    started,
  }), 200, true);
}
