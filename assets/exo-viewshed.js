/* Optical, LoRa, and VHF masks from caller-supplied elevation samples. No tile fetch. */
(function (root) {
  var BANDS = ["optical", "lora", "vhf"];

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function cover(observer, rays, opts) {
    if (!observer || !finite(observer.lat) || !finite(observer.lon)) {
      return { status: "NO OBSERVER", polygons: [] };
    }
    if (!rays || !rays.length) return { status: "NO DEM", polygons: [] };
    var any = false;
    var valued = false;
    for (var r = 0; r < rays.length; r++) {
      var points = rays[r] && rays[r].points;
      if (!points || !points.length) continue;
      any = true;
      for (var p = 0; p < points.length; p++) {
        if (points[p] && finite(points[p].elevM)) valued = true;
      }
    }
    if (!any) return { status: "NO DEM", polygons: [] };
    if (!valued || !finite(observer.elevM)) return { status: "FLAT", polygons: [] };
    var eye = observer.elevM + (finite(observer.aglM) ? observer.aglM : 0);
    var ranges = opts && opts.ranges;
    var polygons = [];
    for (var i = 0; i < rays.length; i++) {
      var ray = rays[i];
      if (!ray || !finite(ray.bearingDeg) || !ray.points) continue;
      var ridge = -Infinity;
      var ordered = ray.points.slice().sort(function (a, b) { return a.distanceM - b.distanceM; });
      for (var n = 0; n < ordered.length; n++) {
        var point = ordered[n];
        if (!point || !finite(point.distanceM) || point.distanceM <= 0 || !finite(point.elevM)) continue;
        var angle = Math.atan2(point.elevM - eye, point.distanceM);
        var kind = angle + 1e-9 < ridge ? "shadow" : "visible";
        if (kind === "visible") ridge = angle;
        for (var b = 0; b < BANDS.length; b++) {
          var limit = ranges && finite(ranges[BANDS[b]]) ? ranges[BANDS[b]] : Infinity;
          if (point.distanceM > limit) continue;
          polygons.push({
            band: BANDS[b],
            kind: kind,
            bearingDeg: ray.bearingDeg,
            distanceM: point.distanceM,
            elevM: point.elevM,
          });
        }
      }
    }
    return { status: polygons.length ? "COVERAGE" : "FLAT", polygons: polygons };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-viewshed");
      if (host) host.textContent = "NO DEM";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.viewshed = { cover: cover, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
