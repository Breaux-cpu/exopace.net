/* MUF and storm state only from numbers the feed actually carried. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function mufMHz(fof2, elevationDeg) {
    if (!finite(fof2) || fof2 <= 0 || !finite(elevationDeg)) return null;
    var el = elevationDeg * Math.PI / 180;
    if (el <= 0 || el >= Math.PI / 2) return null;
    var factor = 1 / Math.sin(el);
    if (!finite(factor) || factor > 8) return null;
    return fof2 * factor;
  }

  function storm(kp) {
    if (!finite(kp)) return null;
    return kp >= 5 ? "GEOMAGNETIC STORM" : "QUIET";
  }

  function scintillation(s4) {
    if (!finite(s4) || s4 < 0) return null;
    if (s4 >= 0.6) return "STRONG";
    if (s4 >= 0.3) return "MODERATE";
    return "QUIET";
  }

  function summary(feed) {
    if (!feed || feed.ok === false) return "OFFLINE";
    var parts = [];
    if (finite(feed.kp)) parts.push("Kp " + feed.kp);
    var sky = storm(feed.kp);
    if (sky) parts.push(sky);
    var muf = mufMHz(feed.fof2, feed.elevationDeg);
    if (muf == null) parts.push("MUF NOT MEASURED");
    else parts.push("MUF " + muf.toFixed(1));
    var s4 = scintillation(feed.s4);
    parts.push(s4 ? "S4 " + s4 : "S4 NOT IN FEED");
    return parts.join(" · ");
  }

  function paint(text) {
    ["exo-prop", "exo-prop-sentinel"].forEach(function (id) {
      var node = document.getElementById(id);
      if (node) node.textContent = text;
    });
  }

  function mount() {
    if (typeof document === "undefined") return;
    paint("OFFLINE");
    if (typeof fetch !== "function") return;
    fetch("/api/spaceweather").then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (body) {
      paint(summary(body));
    }).catch(function () {
      paint("OFFLINE");
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.prop = { mufMHz: mufMHz, storm: storm, scintillation: scintillation, summary: summary, mount: mount };
  if (typeof document !== "undefined") mount();
})(typeof globalThis !== "undefined" ? globalThis : this);
