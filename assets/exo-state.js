/* Target context across pages. URL params win, then localStorage, then other tabs. */
(function (root) {
  var KEY = "exopace-target";
  var lastSig = "";
  var channel = null;
  try { channel = new BroadcastChannel("exopace-target"); } catch (err) { channel = null; }

  function num(value) {
    var n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function mgrsOf(lat, lon) {
    try {
      if (lat == null || lon == null || !root.EXO || !root.EXO.mgrs) return "";
      return root.EXO.mgrs.format(lon, lat);
    } catch (err) {
      return "";
    }
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

  function rowFrom(next) {
    var lat = num(next && next.lat);
    var lon = num(next && next.lon);
    var norad = next && next.norad != null && next.norad !== "" ? String(next.norad) : "";
    var label = String((next && next.label) || "");
    if (!label && norad === "25544") label = "ISS";
    return {
      kind: String((next && next.kind) || (norad ? "satellite" : "none")),
      id: String((next && next.id) || norad || ""),
      label: label,
      lat: lat,
      lon: lon,
      mgrs: String((next && next.mgrs) || mgrsOf(lat, lon) || ""),
      norad: norad,
      freqMHz: norad === "25544" ? 145.8 : num(next && next.freqMHz),
    };
  }

  function writeUrl(row) {
    if (!root.location || !root.history) return;
    var params = new URLSearchParams(root.location.search);
    function put(key, value) {
      if (value == null || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    put("lock", row.norad);
    put("target", row.label);
    put("lat", row.lat == null ? "" : Number(row.lat).toFixed(5));
    put("lon", row.lon == null ? "" : Number(row.lon).toFixed(5));
    put("mgrs", row.mgrs);
    var next = params.toString();
    var cur = root.location.search.replace(/^\?/, "");
    if (next === cur) return;
    root.history.replaceState(null, "", root.location.pathname + (next ? "?" + next : "") + root.location.hash);
  }

  function paint(row) {
    var fix = document.getElementById("exo-pill-fix");
    var badge = document.getElementById("exo-pill-target");
    var sys = document.getElementById("sys-target");
    var place = row && row.mgrs ? row.mgrs : (row && row.lat != null ? Number(row.lat).toFixed(5) + " " + Number(row.lon).toFixed(5) : "NO FIX");
    var name = row && (row.label || row.norad) ? (row.label || "TARGET") + (row.norad ? " " + row.norad : "") : "NO TARGET";
    if (fix) fix.textContent = place;
    if (badge) badge.textContent = name;
    if (sys && row && row.label) sys.textContent = row.label + (row.norad ? " · " + row.norad : "");
  }

  function clock() {
    var node = document.getElementById("exo-pill-clock");
    if (!node) return;
    var now = new Date();
    var utc = now.toISOString().slice(11, 19);
    var jd = (now.getTime() / 86400000 + 2440587.5).toFixed(5);
    node.textContent = "UTC " + utc + " · JD " + jd;
  }

  function publish(next, opts) {
    opts = opts || {};
    var row = rowFrom(next);
    var sig = [row.kind, row.id, row.label, row.lat, row.lon, row.mgrs, row.norad, row.freqMHz].join("|");
    try { localStorage.setItem(KEY, JSON.stringify(row)); } catch (err) { /* private mode */ }
    if (sig !== lastSig) {
      lastSig = sig;
      if (!opts.fromUrl) writeUrl(row);
      if (channel && !opts.fromChannel) {
        try { channel.postMessage(row); } catch (err) { /* closed */ }
      }
      try { root.dispatchEvent(new CustomEvent("exo-target", { detail: row })); } catch (err) { /* no window */ }
    }
    paint(row);
    return row;
  }

  function fromUrl() {
    var params = new URLSearchParams(root.location.search);
    var lock = params.get("lock") || "";
    var label = params.get("target") || "";
    var lat = num(params.get("lat"));
    var lon = num(params.get("lon"));
    var grid = params.get("mgrs") || "";
    if (!lock && !label && lat == null && lon == null && !grid) return null;
    if ((lat == null || lon == null) && grid && root.EXO && root.EXO.mgrs) {
      try {
        var point = root.EXO.mgrs.toLatLon(grid);
        lat = point.lat;
        lon = point.lon;
      } catch (err) { /* keep the grid text */ }
    }
    return publish({
      kind: lock ? "satellite" : (label ? "target" : "fix"),
      id: lock || label || "fix",
      label: label,
      lat: lat,
      lon: lon,
      mgrs: grid,
      norad: lock,
      freqMHz: lock === "25544" ? 145.8 : null,
    }, { fromUrl: true });
  }

  root.EXO = root.EXO || {};
  root.EXO.bus = root.EXO.bus || {};
  root.EXO.bus.get = read;
  root.EXO.bus.set = function (next) { return publish(next); };
  root.EXO.state = { read: read, publish: publish };

  if (channel) {
    channel.onmessage = function (event) {
      if (!event.data) return;
      publish(event.data, { fromChannel: true });
    };
  }

  function boot() {
    clock();
    setInterval(clock, 1000);
    var copy = document.getElementById("exo-pill-copy");
    if (copy) copy.addEventListener("click", function () {
      var row = read();
      var line = [
        (document.getElementById("exo-pill-clock") || {}).textContent || "",
        (document.getElementById("exo-pill-fix") || {}).textContent || "",
        (document.getElementById("exo-pill-target") || {}).textContent || "",
      ].filter(Boolean).join(" · ");
      if (!row) line = line || "NO TARGET";
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(line).catch(function () {});
    });
    if (!fromUrl()) paint(read());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})(typeof globalThis !== "undefined" ? globalThis : window);
