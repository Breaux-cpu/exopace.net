/* Downwind cone from a supplied storm cell and boundary-layer wind. No forecast fetch. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function wrap(deg) {
    var turned = deg % 360;
    return turned < 0 ? turned + 360 : turned;
  }

  function offset(lat, lon, bearingDeg, distanceM) {
    var rad = bearingDeg * Math.PI / 180;
    var dLat = (distanceM * Math.cos(rad)) / 111320;
    var cos = Math.cos(lat * Math.PI / 180);
    var dLon = cos === 0 ? 0 : (distanceM * Math.sin(rad)) / (111320 * cos);
    return { lat: lat + dLat, lon: lon + dLon };
  }

  function windFrom(payload) {
    var current = payload && payload.current;
    if (!current || !finite(current.wind_speed_10m) || !finite(current.wind_direction_10m)) return null;
    if (current.wind_speed_10m <= 0) return null;
    return { speed: current.wind_speed_10m, fromDeg: current.wind_direction_10m };
  }

  function disperse(cell, wind, dem) {
    if (!cell || !finite(cell.lat) || !finite(cell.lon) || !finite(cell.speed) || !finite(cell.heading)) {
      return { status: "NO OBSERVATIONS", cone: [], etaSec: null, stormEtaSec: null, terrain: null, downwindDeg: null };
    }
    if (!wind || !finite(wind.speed) || wind.speed <= 0 || !finite(wind.fromDeg)) {
      return { status: "NO WIND", cone: [], etaSec: null, stormEtaSec: null, terrain: null, downwindDeg: null };
    }
    var terrain = dem && finite(dem.elevM) ? "DEM" : "FLAT";
    var down = wrap(wind.fromDeg + 180);
    var reach = wind.speed * 600;
    var apex = { lat: cell.lat, lon: cell.lon };
    var cone = [apex, offset(cell.lat, cell.lon, down - 15, reach), offset(cell.lat, cell.lon, down + 15, reach)];
    return {
      status: "CONE",
      cone: cone,
      etaSec: 600,
      stormEtaSec: cell.speed > 0 ? 1000 / cell.speed : null,
      terrain: terrain,
      downwindDeg: down,
      elevM: terrain === "DEM" ? dem.elevM : null,
    };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-plume");
      if (host) host.textContent = "NO OBSERVATIONS";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.plume = { disperse: disperse, windFrom: windFrom, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
