/* Field copy and a local sun/moon estimate. No network. */
(function (root) {
  var ALPH = "23456789CFGHJMPQRVWX";
  var last = null;
  var toastTimer = null;

  function plusCode(lat, lon) {
    var latitude = Math.max(-90, Math.min(90, lat));
    var longitude = ((lon + 180) % 360 + 360) % 360 - 180;
    if (latitude >= 90) latitude = 89.999999;
    var latV = latitude + 90;
    var lonV = longitude + 180;
    var code = "";
    var latRes = 20;
    var lonRes = 20;
    for (var i = 0; i < 5; i++) {
      var latDigit = Math.min(19, Math.floor(latV / latRes));
      var lonDigit = Math.min(19, Math.floor(lonV / lonRes));
      code += ALPH.charAt(latDigit) + ALPH.charAt(lonDigit);
      latV -= latDigit * latRes;
      lonV -= lonDigit * lonRes;
      latRes /= 20;
      lonRes /= 20;
    }
    return code.slice(0, 8) + "+" + code.slice(8);
  }

  function dms(value, pos, neg) {
    var sign = value < 0 ? neg : pos;
    var abs = Math.abs(value);
    var deg = Math.floor(abs);
    var minutesFloat = (abs - deg) * 60;
    var min = Math.floor(minutesFloat);
    var sec = (minutesFloat - min) * 60;
    var secText = sec.toFixed(1);
    if (sec < 10) secText = "0" + secText;
    return deg + "°" + String(min).padStart(2, "0") + "′" + secText + "″" + sign;
  }

  function formats(lat, lon) {
    var mgrs = "POLAR";
    try {
      if (root.EXO && root.EXO.mgrs) mgrs = root.EXO.mgrs.format(lon, lat);
    } catch (err) { mgrs = "POLAR"; }
    return {
      mgrs: mgrs,
      dd: lat.toFixed(5) + ", " + lon.toFixed(5),
      dms: dms(lat, "N", "S") + " " + dms(lon, "E", "W"),
      plus: plusCode(lat, lon),
      geo: "geo:" + lat.toFixed(5) + "," + lon.toFixed(5),
    };
  }

  function sunElevation(lat, lon, when) {
    var rad = Math.PI / 180;
    var deg = 180 / Math.PI;
    var jd = when.getTime() / 86400000 + 2440587.5;
    var t = (jd - 2451545) / 36525;
    var L0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
    if (L0 < 0) L0 += 360;
    var M = 357.52911 + t * (35999.05029 - 0.0001537 * t);
    var Mr = M * rad;
    var C = Math.sin(Mr) * (1.914602 - t * (0.004817 + 0.000014 * t))
      + Math.sin(2 * Mr) * (0.019993 - 0.000101 * t)
      + Math.sin(3 * Mr) * 0.000289;
    var lambda = L0 + C - 0.00569 - 0.00478 * Math.sin((125.04 - 1934.136 * t) * rad);
    var eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
    var eps = (eps0 + 0.00256 * Math.cos((125.04 - 1934.136 * t) * rad)) * rad;
    var decl = Math.asin(Math.sin(eps) * Math.sin(lambda * rad));
    var y = Math.tan(eps / 2);
    var y2 = y * y;
    var L0r = L0 * rad;
    var e = 0.016708634;
    var eot = 4 * deg * (
      y2 * Math.sin(2 * L0r)
      - 2 * e * Math.sin(Mr)
      + 4 * e * y2 * Math.sin(Mr) * Math.cos(2 * L0r)
      - 0.5 * y2 * y2 * Math.sin(4 * L0r)
      - 1.25 * e * e * Math.sin(2 * Mr)
    );
    var minutes = when.getUTCHours() * 60 + when.getUTCMinutes() + when.getUTCSeconds() / 60 + when.getUTCMilliseconds() / 60000;
    var tst = minutes + eot + 4 * lon;
    var ha = ((tst / 4 - 180 + 540) % 360) - 180;
    var latr = lat * rad;
    var elev = Math.asin(Math.sin(latr) * Math.sin(decl) + Math.cos(latr) * Math.cos(decl) * Math.cos(ha * rad));
    return elev * deg;
  }

  function moonElevation(lat, lon, when) {
    var rad = Math.PI / 180;
    var d = when.getTime() / 86400000 + 2440587.5 - 2451545;
    var N = (125.1228 - 0.0529538083 * d) * rad;
    var i = 5.1454 * rad;
    var w = (318.0634 + 0.1643573223 * d) * rad;
    var e = 0.0549;
    var M = (115.3654 + 13.0649929509 * d) * rad;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    for (var k = 0; k < 5; k++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    var xv = Math.cos(E) - e;
    var yv = Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv);
    var xh = Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i);
    var yh = Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i);
    var zh = Math.sin(v + w) * Math.sin(i);
    var lonecl = Math.atan2(yh, xh);
    var latecl = Math.atan2(zh, Math.hypot(xh, yh));
    var eps = (23.439291 - 0.0130042 * (d / 36525)) * rad;
    var ra = Math.atan2(Math.sin(lonecl) * Math.cos(eps) - Math.tan(latecl) * Math.sin(eps), Math.cos(lonecl));
    var dec = Math.asin(Math.sin(latecl) * Math.cos(eps) + Math.cos(latecl) * Math.sin(eps) * Math.sin(lonecl));
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    if (gmst < 0) gmst += 360;
    var ha = (gmst + lon) * rad - ra;
    var latr = lat * rad;
    var alt = Math.asin(Math.sin(latr) * Math.sin(dec) + Math.cos(latr) * Math.cos(dec) * Math.cos(ha));
    return alt * 180 / Math.PI;
  }

  function lightName(elev) {
    if (elev > 6) return "DAY";
    if (elev >= 0) return "GOLDEN HOUR";
    if (elev >= -6) return "CIVIL TWILIGHT";
    return "NIGHT";
  }

  function nextLight(lat, lon, when) {
    var nowName = lightName(sunElevation(lat, lon, when));
    for (var step = 1; step <= 18 * 12; step++) {
      var at = new Date(when.getTime() + step * 5 * 60000);
      var name = lightName(sunElevation(lat, lon, at));
      if (name !== nowName) {
        var hh = String(at.getUTCHours()).padStart(2, "0");
        var mm = String(at.getUTCMinutes()).padStart(2, "0");
        return name + " " + hh + ":" + mm + "Z";
      }
    }
    return "STEADY";
  }

  function paint() {
    if (!last) return;
    var sky = document.getElementById("fm-sky");
    if (!sky) return;
    var now = new Date();
    var sun = sunElevation(last.lat, last.lon, now);
    var moon = moonElevation(last.lat, last.lon, now);
    sky.textContent = "SUN " + sun.toFixed(0) + "° " + lightName(sun)
      + " · MOON " + moon.toFixed(0) + "° EST"
      + " · NEXT " + nextLight(last.lat, last.lon, now);
  }

  function toast(message) {
    var el = document.getElementById("fm-toast");
    if (!el) return;
    el.hidden = false;
    el.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function copyText(text) {
    var done = function () { toast("COPIED"); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(text, done); });
    } else fallback(text, done);
  }

  function fallback(text, done) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); done(); } catch (err) { toast("COPY FAILED"); }
    area.remove();
  }

  function ready() {
    var el = document.getElementById("fm-ready");
    if (!el) return;
    if (!root.isSecureContext) {
      el.textContent = "TILES LIVE · SW NEEDS HTTPS";
      return;
    }
    var controlled = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    var keys = (root.caches && root.caches.keys) ? root.caches.keys() : Promise.resolve([]);
    keys.then(function (names) {
      var hit = (names || []).some(function (name) { return String(name).indexOf("exopace-maps") === 0; });
      if (hit && controlled) el.textContent = "SHELL CACHED · TILES LIVE";
      else if (hit) el.textContent = "SHELL IN CACHE · SW IDLE";
      else el.textContent = "NO MAP CACHE · TILES LIVE";
    }).catch(function () {
      el.textContent = "TILES LIVE";
    });
  }

  function bind() {
    var box = document.getElementById("fm-copy");
    if (!box || box.dataset.bound) return;
    box.dataset.bound = "1";
    box.addEventListener("click", function (event) {
      var btn = event.target.closest("button[data-copy]");
      if (!btn || !last) { toast("NO FIX"); return; }
      var pack = formats(last.lat, last.lon);
      var key = btn.getAttribute("data-copy");
      if (!pack[key] || pack[key] === "POLAR") { toast(key === "mgrs" ? "POLAR" : "NO FIX"); return; }
      copyText(pack[key]);
    });
    ready();
    setInterval(function () { if (last) paint(); }, 30000);
  }

  root.EXO = root.EXO || {};
  root.EXO.field = {
    sync: function (lat, lon) { last = { lat: lat, lon: lon }; paint(); },
    plusCode: plusCode,
    sunElevation: sunElevation,
    moonElevation: moonElevation,
    formats: formats,
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
