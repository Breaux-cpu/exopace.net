/* Two-point terrain profile. Heights come from EXO.terrain.sample. */
(function (root) {
  var R = 6371000;
  var K = 4 / 3;
  var BANDS = [145, 433, 915, 2400];
  var armed = false;
  var ends = [];
  var mapRef = null;

  function pointAlong(a, b, f) {
    var lat1 = a.lat * Math.PI / 180;
    var lon1 = a.lon * Math.PI / 180;
    var lat2 = b.lat * Math.PI / 180;
    var dLon = (b.lon - a.lon) * Math.PI / 180;
    var y = Math.sin(dLon) * Math.cos(lat2);
    var x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    var brg = Math.atan2(y, x);
    var dist = 2 * Math.asin(Math.min(1, Math.sqrt(
      Math.pow(Math.sin((lat2 - lat1) / 2), 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dLon / 2), 2)
    )));
    var A = Math.sin((1 - f) * dist) / Math.sin(dist);
    var B = Math.sin(f * dist) / Math.sin(dist);
    var X = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(b.lon * Math.PI / 180);
    var Y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(b.lon * Math.PI / 180);
    var Z = A * Math.sin(lat1) + B * Math.sin(lat2);
    return {
      lat: Math.atan2(Z, Math.sqrt(X * X + Y * Y)) * 180 / Math.PI,
      lon: Math.atan2(Y, X) * 180 / Math.PI,
      meters: f * dist * R,
      bearing: (brg * 180 / Math.PI + 360) % 360,
    };
  }

  function fspl(km, mhz) {
    return 20 * Math.log10(km) + 20 * Math.log10(mhz) + 32.44;
  }

  async function profile(a, b) {
    var steps = 48;
    var samples = [];
    var missing = 0;
    for (var i = 0; i <= steps; i++) {
      var p = pointAlong(a, b, i / steps);
      var elev = await root.EXO.terrain.sample(p.lat, p.lon);
      if (elev == null) missing += 1;
      samples.push({ d: p.meters, ground: elev, lat: p.lat, lon: p.lon });
    }
    if (missing > steps / 3) return { error: "ELEVATION UNREACHABLE", missing: missing };
    var total = samples[samples.length - 1].d;
    var h1 = samples[0].ground;
    var h2 = samples[samples.length - 1].ground;
    if (h1 == null || h2 == null) return { error: "ELEVATION UNREACHABLE" };
    var bands = BANDS.map(function (mhz) {
      var worst = Infinity;
      var blockedAt = null;
      samples.forEach(function (s) {
        if (s.ground == null) return;
        var d1 = Math.max(1, s.d);
        var d2 = Math.max(1, total - s.d);
        var bulge = (d1 * d2) / (2 * K * R);
        var los = h1 + (h2 - h1) * (s.d / Math.max(1, total));
        var lambda = 299792458 / (mhz * 1e6);
        var fresnel = Math.sqrt(lambda * d1 * d2 / Math.max(1, total));
        var clearance = (los + 2) - (s.ground + bulge + 0.6 * fresnel);
        if (clearance < worst) { worst = clearance; blockedAt = s.d; }
      });
      if (worst === Infinity) return { mhz: mhz, clearance: null, verdict: "ELEVATION UNREACHABLE", fspl: null, blockedAt: null };
      return {
        mhz: mhz,
        clearance: worst,
        verdict: worst >= 0 ? "CLEAR" : "OBSTRUCTED",
        fspl: total > 10 ? fspl(total / 1000, mhz) : null,
        blockedAt: worst >= 0 ? null : blockedAt,
      };
    });
    return { samples: samples, total: total, bands: bands, h1: h1, h2: h2 };
  }

  function draw(canvas, result) {
    if (!canvas || !result || !result.samples) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = "#04070d";
    ctx.fillRect(0, 0, w, h);
    var grounds = result.samples.map(function (s) { return s.ground; }).filter(function (n) { return n != null; });
    var min = Math.min.apply(null, grounds);
    var max = Math.max.apply(null, grounds);
    if (max - min < 20) max = min + 20;
    ctx.beginPath();
    result.samples.forEach(function (s, i) {
      if (s.ground == null) return;
      var x = (i / (result.samples.length - 1)) * (w - 16) + 8;
      var y = h - 16 - ((s.ground - min) / (max - min)) * (h - 32);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#7ee0ff";
    ctx.stroke();
    ctx.strokeStyle = "#ffe08a";
    ctx.beginPath();
    ctx.moveTo(8, h - 16 - ((result.h1 - min) / (max - min)) * (h - 32));
    ctx.lineTo(w - 8, h - 16 - ((result.h2 - min) / (max - min)) * (h - 32));
    ctx.stroke();
  }

  async function run() {
    var box = document.getElementById("fm-link");
    if (!box) return;
    if (ends.length < 2) { box.textContent = "STANDBY · NEED TWO POINTS"; return; }
    box.textContent = "SAMPLING TERRAIN";
    var result = await profile(ends[0], ends[1]);
    if (result.error) { box.textContent = result.error; return; }
    var lines = result.bands.map(function (b) {
      var loss = b.fspl == null ? "—" : b.fspl.toFixed(1) + " dB";
      var clr = b.clearance == null ? "—" : b.clearance.toFixed(1) + " m";
      return b.mhz + " MHz " + b.verdict + " · FSPL " + loss + " · CLR " + clr;
    });
    box.textContent = (result.total / 1000).toFixed(2) + " km · " + lines.join(" · ");
    draw(document.getElementById("fm-link-plot"), result);
  }

  root.EXO = root.EXO || {};
  root.EXO.link = {
    arm: function (on) {
      armed = !!on;
      ends = [];
      var box = document.getElementById("fm-link");
      if (box) box.textContent = armed ? "STANDBY · CLICK A THEN B" : "LOS OFF";
    },
    capture: function (ev) {
      if (!armed || !ev || !ev.lngLat) return false;
      ends.push({ lat: ev.lngLat.lat, lon: ev.lngLat.lng });
      if (ends.length > 2) ends = ends.slice(-2);
      if (ends.length === 2) run();
      else {
        var box = document.getElementById("fm-link");
        if (box) box.textContent = "A SET · CLICK B";
      }
      return true;
    },
  };

  function bind() {
    var btn = document.getElementById("fm-los");
    if (!btn) return;
    btn.addEventListener("click", function () {
      arm(!armed);
      btn.setAttribute("aria-pressed", armed ? "true" : "false");
    });
    var box = document.getElementById("fm-link");
    if (box && !armed) box.textContent = "LOS OFF";
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
