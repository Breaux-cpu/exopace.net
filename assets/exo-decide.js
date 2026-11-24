import { DECIDE_MS, DECIDE_URL, ROUTES } from "./exo-config.js";

const CHOICES = Object.keys(ROUTES);

export function fallbackDecision(kind, state) {
  if (kind === "choice") {
    const query = String((state && state.query) || "").toLowerCase();
    const choice = CHOICES.find((name) => query.includes(name)) || "";
    return {
      source: "fallback",
      answers: {
        route: { choice, probabilities: {}, answer_confidence: 0 },
      },
    };
  }
  if (kind === "noul") {
    const name = String((state && state.name) || "").trim();
    const spam = name.length < 2 || /^(test|asdf|spam|xxx+|qwerty)$/i.test(name);
    return {
      source: "fallback",
      answers: { spam: { noul: spam ? 0.95 : 0.05, answer_confidence: 1 } },
    };
  }
  if (kind === "score") {
    const text = String((state && state.text) || "");
    const score = text.includes("INSIDE") ? 2 : (/EL |AIR |SEA |NORAD|CAMERA/.test(text) ? 1 : 0);
    return {
      source: "fallback",
      answers: { rank: { score, probabilities: {}, answer_confidence: 1 } },
    };
  }
  return { source: "fallback", answers: {} };
}

export function acceptAnswer(kind, body) {
  if (!body || body.source === "fallback" || !body.answers) return null;
  const answers = body.answers;
  if (kind === "choice") {
    const row = answers.route;
    if (!row || !CHOICES.includes(row.choice) || typeof row.probabilities !== "object") return null;
    if (!(row.answer_confidence >= 0.55)) return null;
    return body;
  }
  if (kind === "noul") {
    const row = answers.spam;
    if (!row || typeof row.noul !== "number" || row.noul < 0 || row.noul > 1) return null;
    if (!(row.answer_confidence >= 0)) return null;
    return body;
  }
  if (kind === "score") {
    const row = answers.rank;
    if (!row || !Number.isFinite(row.score)) return null;
    if (!(row.answer_confidence >= 0.55)) return null;
    return body;
  }
  return null;
}

export async function decideWith(kind, state, options) {
  const url = options && Object.prototype.hasOwnProperty.call(options, "url") ? options.url : DECIDE_URL;
  const ms = options && options.ms ? options.ms : DECIDE_MS;
  const fetcher = options && options.fetch ? options.fetch : globalThis.fetch;
  if (!url || typeof fetcher !== "function") return fallbackDecision(kind, state);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetcher(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, state }),
    });
    if (!res || !res.ok) return fallbackDecision(kind, state);
    const body = await res.json();
    return acceptAnswer(kind, body) || fallbackDecision(kind, state);
  } catch (err) {
    return fallbackDecision(kind, state);
  } finally {
    clearTimeout(timer);
  }
}

export function decide(kind, state) {
  return decideWith(kind, state, { url: DECIDE_URL, ms: DECIDE_MS });
}

globalThis.EXO = globalThis.EXO || {};
globalThis.EXO.decide = decide;
globalThis.EXO.routes = ROUTES;
