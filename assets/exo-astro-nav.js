/* Solar and lunar azimuth from the clock and a real observer. */
(function (root) {
  var RAD = Math.PI / 180;

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function wrap(deg) {
    return ((deg % 360) + 360) % 360;
  }

  function whenMs(when) {
    if (when instanceof Date) return when.getTime();
    if (typeof when === "string" || typeof when === "number") {
      var ms = new Date(when).getTime();
      return Number.isFinite(ms) ? ms : NaN;
    }
    return NaN;
  }

  function observer(when, lat, lon) {
    if (!finite(lat) || !finite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    var ms = whenMs(when);
    if (!finite(ms)) return null;
    var d = ms / 86400000 + 2440587.5 - 2451545.0;
    var gmst = wrap(280.46061837 + 360.98564736629 * d);
    return { d: d, gmst: gmst, lat: lat, lon: lon };
  }

  function look(lat, lon, gmst, raDeg, decDeg) {
    var ha = wrap(gmst + lon - raDeg);
    if (ha > 180) ha -= 360;
    var latR = lat * RAD;
    var decR = decDeg * RAD;
    var haR = ha * RAD;
    var el = Math.asin(Math.sin(latR) * Math.sin(decR) + Math.cos(latR) * Math.cos(decR) * Math.cos(haR)) / RAD;
    var az = Math.atan2(-Math.sin(haR), Math.cos(latR) * Math.tan(decR) - Math.sin(latR) * Math.cos(haR)) / RAD;
    return { az: wrap(az), el: el };
  }

  function sun(when, lat, lon) {
    var obs = observer(when, lat, lon);
    if (!obs) return null;
    var g = wrap(357.529 + 0.98560028 * obs.d);
    var q = wrap(280.459 + 0.98564736 * obs.d);
    var L = wrap(q + 1.915 * Math.sin(g * RAD) + 0.020 * Math.sin(2 * g * RAD));
    var e = 23.439 - 0.00000036 * obs.d;
    var ra = wrap(Math.atan2(Math.cos(e * RAD) * Math.sin(L * RAD), Math.cos(L * RAD)) / RAD);
    var dec = Math.asin(Math.sin(e * RAD) * Math.sin(L * RAD)) / RAD;
    return look(obs.lat, obs.lon, obs.gmst, ra, dec);
  }

  function moon(when, lat, lon) {
    var obs = observer(when, lat, lon);
    if (!obs) return null;
    var d = obs.d;
    var N = wrap(125.1228 - 0.0529538083 * d) * RAD;
    var i = 5.1454 * RAD;
    var w = wrap(318.0634 + 0.1643573223 * d) * RAD;
    var e = 0.0549;
    var M = wrap(115.3654 + 13.0649929509 * d) * RAD;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    var xv = 60.2666 * (Math.cos(E) - e);
    var yv = 60.2666 * Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv);
    var r = Math.hypot(xv, yv);
    var xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
    var yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
    var zh = r * Math.sin(v + w) * Math.sin(i);
    var ecl = (23.4393 - 3.563e-7 * d) * RAD;
    var xe = xh;
    var ye = yh * Math.cos(ecl) - zh * Math.sin(ecl);
    var ze = yh * Math.sin(ecl) + zh * Math.cos(ecl);
    var ra = wrap(Math.atan2(ye, xe) / RAD);
    var dec = Math.atan2(ze, Math.hypot(xe, ye)) / RAD;
    return look(obs.lat, obs.lon, obs.gmst, ra, dec);
  }

  function compare(headingDeg, azimuthDeg) {
    if (!finite(headingDeg) || !finite(azimuthDeg)) return { status: "NO HEADING", delta: null };
    var delta = wrap(azimuthDeg - headingDeg);
    if (delta > 180) delta -= 360;
    return { status: "CHECK", delta: delta };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-astro");
      if (host) host.textContent = "NO FIX";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.astro = { sun: sun, moon: moon, compare: compare, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
