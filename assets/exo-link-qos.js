/* Bit-packed telemetry deltas. SOS drains before position and bulk. */
(function (root) {
  var KEYS = ["lat", "lon", "alt", "bat", "seq"];
  var RANK = { SOS: 0, ALERT: 1, POS: 2, BULK: 3 };

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function delta(prev, next) {
    if (!next || typeof next !== "object") return { status: "QUIET", fields: null };
    var names = Object.keys(next);
    if (!prev) {
      var full = {};
      for (var i = 0; i < names.length; i++) full[names[i]] = next[names[i]];
      return { status: "SNAPSHOT", fields: full };
    }
    var changed = {};
    var count = 0;
    for (var n = 0; n < names.length; n++) {
      if (next[names[n]] !== prev[names[n]]) {
        changed[names[n]] = next[names[n]];
        count += 1;
      }
    }
    if (!count) return { status: "QUIET", fields: null };
    return { status: "DELTA", fields: changed };
  }

  function pack(fields, priority) {
    var names = [];
    var source = fields || {};
    for (var i = 0; i < KEYS.length; i++) {
      if (finite(source[KEYS[i]])) names.push(KEYS[i]);
    }
    var bytes = new Uint8Array(2 + names.length * 5);
    bytes[0] = Object.prototype.hasOwnProperty.call(RANK, priority) ? RANK[priority] : RANK.BULK;
    bytes[1] = names.length;
    var view = new DataView(bytes.buffer);
    for (var n = 0; n < names.length; n++) {
      var at = 2 + n * 5;
      bytes[at] = KEYS.indexOf(names[n]);
      view.setFloat32(at + 1, source[names[n]], true);
    }
    return bytes;
  }

  function unpack(bytes) {
    if (!bytes || bytes.length < 2) return null;
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var count = bytes[1];
    var fields = {};
    for (var i = 0; i < count; i++) {
      var at = 2 + i * 5;
      if (at + 5 > bytes.length) return null;
      var key = KEYS[bytes[at]];
      if (!key) return null;
      fields[key] = view.getFloat32(at + 1, true);
    }
    var priority = "BULK";
    var ranks = Object.keys(RANK);
    for (var r = 0; r < ranks.length; r++) {
      if (RANK[ranks[r]] === bytes[0]) priority = ranks[r];
    }
    return { priority: priority, fields: fields };
  }

  function enqueue(queue, packet) {
    var next = (queue || []).concat([packet]);
    next.sort(function (a, b) {
      var ar = Object.prototype.hasOwnProperty.call(RANK, a && a.priority) ? RANK[a.priority] : 9;
      var br = Object.prototype.hasOwnProperty.call(RANK, b && b.priority) ? RANK[b.priority] : 9;
      return ar - br;
    });
    return next;
  }

  function drain(queue) {
    if (!queue || !queue.length) return null;
    return queue[0];
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-qos");
      if (host) host.textContent = "STANDBY";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.linkQos = { delta: delta, pack: pack, unpack: unpack, enqueue: enqueue, drain: drain, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
