/* Hop frames the radio actually heard. No invented neighbors. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function forward(frame, seen, nowMs) {
    if (!frame || !frame.id || !frame.from) return null;
    if (!finite(frame.ttl) || frame.ttl <= 0) return null;
    if (seen && seen.has(frame.id)) return null;
    if (seen) seen.set(frame.id, nowMs || 0);
    return {
      id: frame.id,
      from: frame.from,
      to: frame.to || "",
      ttl: frame.ttl - 1,
      rssi: finite(frame.rssi) ? frame.rssi : null,
      snr: finite(frame.snr) ? frame.snr : null,
      body: frame.body || "",
    };
  }

  function matrix(frames) {
    var links = [];
    (frames || []).forEach(function (frame) {
      if (!frame || !frame.from || !frame.to) return;
      if (!finite(frame.rssi) && !finite(frame.snr)) return;
      links.push({
        from: frame.from,
        to: frame.to,
        rssi: finite(frame.rssi) ? frame.rssi : null,
        snr: finite(frame.snr) ? frame.snr : null,
      });
    });
    return links;
  }

  function layout(links) {
    var ids = [];
    links.forEach(function (link) {
      if (ids.indexOf(link.from) < 0) ids.push(link.from);
      if (ids.indexOf(link.to) < 0) ids.push(link.to);
    });
    return ids.map(function (id, index) {
      var turn = ids.length ? (Math.PI * 2 * index) / ids.length : 0;
      return { id: id, x: Math.cos(turn), y: Math.sin(turn) };
    });
  }

  function status(frames) {
    var links = matrix(frames);
    if (!links.length) return "STANDBY";
    return "LINKS " + links.length;
  }

  function paint(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-mesh-topo");
    var canvas = documentRef.getElementById("exo-mesh-graph");
    if (host) host.textContent = "STANDBY";
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#04070d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  root.EXO = root.EXO || {};
  root.EXO.meshRouter = { forward: forward, matrix: matrix, layout: layout, status: status, paint: paint };
  if (typeof document !== "undefined") paint(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
