export const TOPICS = [
  "exopace.mission.console.query.created.v1",
  "exopace.recommendation.generated.v1",
  "exopace.recommendation.accepted.v1",
];

const TYPES = {
  "exopace.mission.console.query.created.v1": "MissionConsoleQueryCreated",
  "exopace.recommendation.generated.v1": "RecommendationGenerated",
  "exopace.recommendation.accepted.v1": "RecommendationAccepted",
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const ZULU = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const EVENT_KEYS = new Set([
  "schemaVersion",
  "eventId",
  "eventType",
  "tenantId",
  "actorId",
  "correlationId",
  "timestamp",
  "version",
  "payload",
]);

function idOk(value) {
  return typeof value === "string" && ID.test(value);
}

function payloadOk(topic, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const keys = Object.keys(payload);
  if (topic === "exopace.mission.console.query.created.v1") {
    return keys.length === 2
      && typeof payload.query === "string"
      && payload.query.length >= 1
      && payload.query.length <= 500
      && idOk(payload.sessionId);
  }
  if (topic === "exopace.recommendation.generated.v1") {
    return keys.length === 2
      && idOk(payload.recommendationId)
      && typeof payload.score === "number"
      && Number.isFinite(payload.score)
      && payload.score >= 0
      && payload.score <= 1;
  }
  if (topic === "exopace.recommendation.accepted.v1") {
    return keys.length === 1 && idOk(payload.recommendationId);
  }
  return false;
}

function allowed(topic, event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  if (Object.keys(event).some((key) => !EVENT_KEYS.has(key))) return false;
  if (event.schemaVersion !== "1.0.0" || event.version !== "1.0.0") return false;
  if (event.eventType !== TYPES[topic]) return false;
  if (!idOk(event.eventId) || !idOk(event.tenantId)) return false;
  if (typeof event.timestamp !== "string" || !ZULU.test(event.timestamp)) return false;
  if ("actorId" in event && !idOk(event.actorId)) return false;
  if ("correlationId" in event && !idOk(event.correlationId)) return false;
  return payloadOk(topic, event.payload);
}

function forbid(topic) {
  if (TOPICS.includes(topic)) return;
  const error = new Error("TOPIC_FORBIDDEN");
  error.code = "TOPIC_FORBIDDEN";
  throw error;
}

export function createLog() {
  const live = new Map(TOPICS.map((topic) => [topic, []]));
  const dead = new Map(TOPICS.map((topic) => [`${topic}.dlq`, []]));
  const offsets = new Map(TOPICS.map((topic) => [topic, 0]));
  const published = new Map(TOPICS.map((topic) => [topic, 0]));
  const dlq = new Map(TOPICS.map((topic) => [topic, 0]));
  const consumed = new Map(TOPICS.map((topic) => [topic, 0]));

  function publish(topic, event) {
    forbid(topic);
    if (!allowed(topic, event)) {
      dead.get(`${topic}.dlq`).push(event);
      dlq.set(topic, dlq.get(topic) + 1);
      return { queued: "dlq", key: event && event.tenantId };
    }
    live.get(topic).push({ key: event.tenantId, value: event });
    published.set(topic, published.get(topic) + 1);
    return { queued: "live", key: event.tenantId };
  }

  function replay(topic) {
    return (live.get(topic) || []).map((row) => row.value);
  }

  function readDlq(topic) {
    return (dead.get(`${topic}.dlq`) || []).slice();
  }

  function consume(topic, limit = 1000) {
    forbid(topic);
    const rows = live.get(topic);
    const start = offsets.get(topic);
    const end = Math.min(rows.length, start + limit);
    const batch = rows.slice(start, end).map((row) => row.value);
    offsets.set(topic, end);
    consumed.set(topic, consumed.get(topic) + batch.length);
    return batch;
  }

  function stats() {
    const row = (counts) => Object.fromEntries(TOPICS.map((topic) => [topic, counts.get(topic)]));
    return { published: row(published), dlq: row(dlq), consumed: row(consumed) };
  }

  function metricsText() {
    const lines = [];
    for (const topic of TOPICS) {
      lines.push(`exopace_events_published_total{topic="${topic}"} ${published.get(topic)}`);
      lines.push(`exopace_events_dlq_total{topic="${topic}"} ${dlq.get(topic)}`);
      lines.push(`exopace_events_consumed_total{topic="${topic}"} ${consumed.get(topic)}`);
    }
    return `${lines.join("\n")}\n`;
  }

  return { publish, replay, readDlq, consume, stats, metricsText };
}

export const defaultLog = createLog();
