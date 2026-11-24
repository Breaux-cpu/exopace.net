/* Passive bistatic range-Doppler. No IQ means no return. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function pairs(iq) {
    var out = [];
    if (!iq || !iq.length) return out;
    if (typeof iq[0] === "object" && iq[0]) {
      for (var i = 0; i < iq.length; i++) {
        if (!finite(iq[i].i) || !finite(iq[i].q)) return [];
        out.push([iq[i].i, iq[i].q]);
      }
      return out;
    }
    if (iq.length % 2) return [];
    for (var j = 0; j < iq.length; j += 2) {
      if (!finite(iq[j]) || !finite(iq[j + 1])) return [];
      out.push([iq[j], iq[j + 1]]);
    }
    return out;
  }

  function analyze(iq) {
    var raw = pairs(iq);
    if (!raw.length) return { status: "NO SAMPLES", cells: [] };
    if (raw.length < 64) return { status: "BASELINE_CALIBRATING", cells: [] };
    var n = raw.length - (raw.length % 8);
    if (n < 64) return { status: "BASELINE_CALIBRATING", cells: [] };
    if (n > 2048) n = 2048;
    var pulses = 8;
    var len = n / pulses;
    var rangeBins = Math.min(4, len);
    var re = [];
    var im = [];
    for (var p = 0; p < pulses; p++) {
      re.push([]);
      im.push([]);
      for (var t = 0; t < len; t++) {
        re[p].push(raw[p * len + t][0]);
        im[p].push(raw[p * len + t][1]);
      }
    }
    var power = 0;
    for (var bin = 0; bin < rangeBins; bin++) {
      var meanRe = 0;
      var meanIm = 0;
      for (var p2 = 0; p2 < pulses; p2++) {
        meanRe += re[p2][bin];
        meanIm += im[p2][bin];
      }
      meanRe /= pulses;
      meanIm /= pulses;
      for (var p3 = 0; p3 < pulses; p3++) {
        re[p3][bin] -= meanRe;
        im[p3][bin] -= meanIm;
        power += re[p3][bin] * re[p3][bin] + im[p3][bin] * im[p3][bin];
      }
    }
    if (power < 1e-8) return { status: "BASELINE_CALIBRATING", cells: [] };
    var mags = [];
    for (var r = 0; r < rangeBins; r++) {
      for (var d = 0; d < pulses; d++) {
        var fre = 0;
        var fim = 0;
        for (var p4 = 0; p4 < pulses; p4++) {
          var ang = -2 * Math.PI * d * p4 / pulses;
          var c = Math.cos(ang);
          var s = Math.sin(ang);
          fre += re[p4][r] * c - im[p4][r] * s;
          fim += re[p4][r] * s + im[p4][r] * c;
        }
        mags.push({ range: r, doppler: d, mag: Math.sqrt(fre * fre + fim * fim) });
      }
    }
    var sorted = mags.map(function (m) { return m.mag; }).sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)] || 0;
    var cells = mags.filter(function (m) {
      return m.doppler !== 0 && m.mag > 1e-6 && m.mag > median * 4;
    });
    if (!cells.length) return { status: "STANDBY", cells: [] };
    return { status: "RETURN", cells: cells };
  }

  function linkStatus(usbPresent, deviceCount, sampleCount) {
    if (!usbPresent || !deviceCount) return "NO USB DEVICE";
    if (!sampleCount) return "BASELINE_CALIBRATING";
    return "STANDBY";
  }

  function paintMap(doc, cells) {
    var canvas = doc.getElementById("exo-radar-map");
    if (!canvas || typeof canvas.getContext !== "function") return;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var w = canvas.width || 320;
    var h = canvas.height || 96;
    ctx.fillStyle = "#04070d";
    ctx.fillRect(0, 0, w, h);
    if (!cells || !cells.length) return;
    cells.forEach(function (cell) {
      ctx.fillStyle = "#7ee0ff";
      ctx.fillRect((cell.range + 0.15) * (w / 4), h - (cell.doppler + 1) * (h / 8), w / 6, h / 10);
    });
  }

  function paint(doc, text) {
    var host = doc.getElementById("exo-radar");
    if (host) host.textContent = text;
    paintMap(doc, []);
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var run = function () {
      var usb = typeof navigator !== "undefined" && navigator.usb;
      if (!usb || typeof usb.getDevices !== "function") {
        paint(documentRef, "NO USB DEVICE");
        return;
      }
      usb.getDevices().then(function (list) {
        paint(documentRef, linkStatus(true, list ? list.length : 0, 0));
      }).catch(function () {
        paint(documentRef, "NO USB DEVICE");
      });
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  function spawn(iq, href) {
    if (typeof Worker === "undefined" || !href) return null;
    if (!pairs(iq).length) return null;
    var worker = new Worker(href);
    worker.postMessage({ iq: iq });
    return worker;
  }

  if (typeof WorkerGlobalScope !== "undefined" && typeof self !== "undefined" && self instanceof WorkerGlobalScope) {
    self.onmessage = function (ev) {
      var data = ev && ev.data ? ev.data : {};
      self.postMessage(analyze(data.iq));
    };
  }

  root.EXO = root.EXO || {};
  root.EXO.passiveRadar = { analyze: analyze, linkStatus: linkStatus, paintMap: paintMap, spawn: spawn, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
