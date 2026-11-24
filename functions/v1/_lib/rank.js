export const DECIDE_URL = "";
export const DECIDE_MS = 800;
export const CONFIDENCE_FLOOR = 0.55;

export function matchCatalog(rows, query) {
  const text = String(query || "").trim().toLowerCase();
  if (!text) return [];
  if (/^\d+$/.test(text)) {
    const noradId = Number(text);
    return rows.filter((row) => row.noradId === noradId);
  }
  return rows.filter((row) => row.name.toLowerCase().includes(text));
}

export function acceptScore(body) {
  if (!body || body.source === "fallback" || !body.answers || !body.answers.rank) return null;
  const rank = body.answers.rank;
  if (!Number.isFinite(rank.score) || !(rank.answer_confidence >= CONFIDENCE_FLOOR)) return null;
  return rank;
}

export function applyRank(rows, body) {
  const copy = rows.slice();
  const rank = body && body.answers ? body.answers.rank : null;
  if (rank && rank.noradId != null && !copy.some((row) => row.noradId === rank.noradId)) return copy;
  const accepted = acceptScore(body);
  if (!accepted) return copy;
  return copy;
}

export async function decideWith(kind, state, options = {}) {
  const url = Object.prototype.hasOwnProperty.call(options, "url") ? options.url : DECIDE_URL;
  const ms = options.ms || DECIDE_MS;
  const fetcher = options.fetch || globalThis.fetch;
  if (!url || typeof fetcher !== "function") return { source: "fallback", answers: {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetcher(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, state }),
    });
    if (!res || !res.ok) return { source: "fallback", answers: {} };
    const body = await res.json();
    if (!acceptScore(body)) return { source: "fallback", answers: {} };
    return body;
  } catch {
    return { source: "fallback", answers: {} };
  } finally {
    clearTimeout(timer);
  }
}
