/* Clock-stepped AAR playback. Locked unless the caller opens the sandbox. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function copyEvent(row, index) {
    if (!row || typeof row !== "object") return null;
    var t = finite(row.t) ? row.t : index * 1000;
    var event = { t: t, kind: typeof row.kind === "string" ? row.kind : "MARK" };
    if (finite(row.lat)) event.lat = row.lat;
    if (finite(row.lon)) event.lon = row.lon;
    return event;
  }

  function fromObject(archive) {
    var rows = [];
    if (Array.isArray(archive.events)) rows = archive.events;
    else if (Array.isArray(archive.waypoints)) rows = archive.waypoints;
    var events = [];
    for (var i = 0; i < rows.length; i++) {
      var event = copyEvent(rows[i], i);
      if (event) events.push(event);
    }
    return events;
  }

  function kmlEvents(text) {
    if (!text || (text.indexOf("<kml") < 0 && text.indexOf("<coordinates") < 0)) return [];
    var found = text.match(/<coordinates>([^<]*)<\/coordinates>/);
    if (!found) return [];
    var parts = found[1].trim().split(/\s+/);
    var events = [];
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      var bits = parts[i].split(",");
      var lon = Number(bits[0]);
      var lat = Number(bits[1]);
      if (!finite(lat) || !finite(lon)) continue;
      events.push({ t: i * 1000, kind: "WAYPOINT", lat: lat, lon: lon });
    }
    return events;
  }

  function readKmz(bytes) {
    if (!bytes || !bytes.buffer || bytes.length < 30) return [];
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 3 || bytes[3] !== 4) return [];
    var view = new DataView(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    if (view.getUint16(8, true) !== 0) return [];
    var size = view.getUint32(18, true);
    var nameLen = view.getUint16(26, true);
    var extra = view.getUint16(28, true);
    var start = 30 + nameLen + extra;
    if (start + size > bytes.length) return [];
    var text = new TextDecoder().decode(bytes.subarray(start, start + size));
    return kmlEvents(text);
  }

  function eventsOf(archive) {
    if (!archive) return [];
    if (typeof archive === "string") {
      try {
        return fromObject(JSON.parse(archive));
      } catch (err) {
        return [];
      }
    }
    if (archive.buffer && typeof archive.byteLength === "number" && !Array.isArray(archive)) return readKmz(archive);
    if (typeof archive === "object") return fromObject(archive);
    return [];
  }

  function load(archive, opts) {
    if (!opts || opts.sandbox !== true) return { status: "LOCKED", events: [], sandbox: false };
    var events = eventsOf(archive);
    if (!events.length) return { status: "NO ARCHIVE", events: [], sandbox: true };
    return { status: "READY", events: events, sandbox: true };
  }

  function step(state, nowMs) {
    if (!state || state.sandbox !== true) return { status: "LOCKED", events: [], sandbox: false };
    if (!finite(nowMs)) return { status: "NO CLOCK", events: [], sandbox: true };
    if (!state.events || !state.events.length) return { status: "NO ARCHIVE", events: [], sandbox: true };
    var shown = [];
    for (var i = 0; i < state.events.length; i++) {
      if (state.events[i].t <= nowMs) shown.push(state.events[i]);
    }
    return { status: shown.length ? "PLAY" : "WAIT", events: shown, sandbox: true };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-replay");
      if (host) host.textContent = "SANDBOX IDLE";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.replay = { load: load, step: step, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
