/* Shared target context. Pages publish the operator's current satellite, link, or watch. */
(function (root) {
  var KEY = "exopace-target";

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var row = JSON.parse(raw);
      return row && typeof row === "object" ? row : null;
    } catch (err) {
      return null;
    }
  }

  function publish(next) {
    var row = {
      kind: String((next && next.kind) || "none"),
      id: String((next && next.id) || ""),
      label: String((next && next.label) || ""),
      lat: num(next && next.lat),
      lon: num(next && next.lon),
      norad: next && next.norad != null && next.norad !== "" ? String(next.norad) : "",
      freqMHz: num(next && next.freqMHz),
    };
    try { localStorage.setItem(KEY, JSON.stringify(row)); } catch (err) { /* private mode */ }
    try { root.dispatchEvent(new CustomEvent("exo-target", { detail: row })); } catch (err) { /* no document */ }
    return row;
  }

  root.EXO = root.EXO || {};
  root.EXO.bus = { get: read, set: publish };
})(typeof globalThis !== "undefined" ? globalThis : window);
