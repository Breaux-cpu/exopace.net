import { defaultLog } from "./_lib/events.js";

export function onRequest() {
  return new Response(defaultLog.metricsText(), {
    status: 200,
    headers: {
      "content-type": "text/plain; version=0.0.4; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
