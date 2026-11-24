import { loadCatalog } from "../_lib/catalog.js";
import { defaultLog } from "../_lib/events.js";
import { apiError, envelope, json, stamp } from "../_lib/envelope.js";
import { applyRank, decideWith, matchCatalog } from "../_lib/rank.js";

const FIELDS = new Set(["schemaVersion", "query", "pageContext", "entityId", "entityType", "sessionId", "tenantId"]);
let eventCount = 0;

function nextEventId() {
  eventCount += 1;
  return `evt-${eventCount}-${Math.random().toString(36).slice(2, 8)}`;
}

function event(type, tenantId, payload) {
  return {
    schemaVersion: "1.0.0",
    eventId: nextEventId(),
    eventType: type,
    tenantId,
    timestamp: stamp(),
    version: "1.0.0",
    payload,
  };
}

export async function onRequest(context) {
  const started = Date.now();
  const log = (context && context.events) || defaultLog;
  let body;
  try {
    body = await context.request.json();
  } catch {
    body = null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return json(envelope({
      success: false,
      errors: [apiError("VALIDATION_FAILED", "Query body is not an object.", "validation")],
      source: "catalog",
      tenantId: "exopace-public",
      started,
    }), 400);
  }
  if (Object.keys(body).some((key) => !FIELDS.has(key)) || body.schemaVersion !== "1.0.0") {
    return json(envelope({
      success: false,
      errors: [apiError("VALIDATION_FAILED", "Query body does not match the contract.", "validation")],
      source: "catalog",
      tenantId: "exopace-public",
      started,
    }), 400);
  }
  const query = String(body.query || "");
  const sessionId = String(body.sessionId || "");
  const tenantId = String(body.tenantId || "");
  if (!query || query.length > 500 || !sessionId || !tenantId) {
    return json(envelope({
      success: false,
      errors: [apiError("VALIDATION_FAILED", "Query, session, and tenant are required.", "validation")],
      source: "catalog",
      tenantId: "exopace-public",
      started,
    }), 400);
  }
  if (tenantId !== "exopace-public") {
    return json(envelope({
      success: false,
      errors: [apiError("NOT_FOUND", "No catalog row for that tenant.", "validation")],
      source: "catalog",
      tenantId,
      started,
    }), 404);
  }
  const rows = await loadCatalog(context);
  const decision = await decideWith("score", { text: query }, context.decide || {});
  const matched = applyRank(matchCatalog(rows, query), decision);
  const hit = matched[0] || null;
  const data = hit ? {
    schemaVersion: "1.0.0",
    answer: `${hit.name} is the catalog object.`,
    context: `Catalog row ${hit.noradId}.`,
    explanation: `The catalog lists ${hit.name}.`,
    recommendation: `Lock ${hit.name}.`.slice(0, 500),
    confidence: 1,
    sources: [{ schemaVersion: "1.0.0", id: `tle-${hit.noradId}`, type: "tle", title: hit.name.slice(0, 200) }],
    actions: [{ schemaVersion: "1.0.0", id: `act-${hit.noradId}`, label: `Lock ${hit.name}`.slice(0, 80), kind: "lock" }],
  } : {
    schemaVersion: "1.0.0",
    answer: "No catalog row matches.",
    context: "The catalog was read.",
    explanation: "Nothing in the TLE files matched the query.",
    confidence: 0,
    sources: [],
    actions: [],
  };
  log.publish("exopace.mission.console.query.created.v1", event("MissionConsoleQueryCreated", tenantId, { query, sessionId }));
  if (hit) {
    log.publish("exopace.recommendation.generated.v1", event("RecommendationGenerated", tenantId, {
      recommendationId: `rec-${hit.noradId}`,
      score: 1,
    }));
  }
  if (body.pageContext === "accept" && body.entityId) {
    log.publish("exopace.recommendation.accepted.v1", event("RecommendationAccepted", tenantId, {
      recommendationId: String(body.entityId),
    }));
  }
  return json(envelope({
    success: true,
    data,
    source: "tle",
    tenantId,
    started,
  }), 200);
}
