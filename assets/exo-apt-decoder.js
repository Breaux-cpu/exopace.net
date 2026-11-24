/* NOAA APT from real samples only. No sync means no picture. */
(function (root) {
  var LINE = 2080;
  var IMAGE_AT = 86;
  var IMAGE_W = 909;

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function envelope(samples, sampleRate) {
    if (!samples || !samples.length || !finite(sampleRate) || sampleRate <= 0) return null;
    var win = Math.max(1, Math.round(sampleRate / 2400));
    var out = new Float32Array(samples.length);
    var acc = 0;
    for (var i = 0; i < samples.length; i++) {
      var x = samples[i];
      if (!finite(x)) return null;
      acc += Math.abs(x);
      if (i >= win) acc -= Math.abs(samples[i - win]);
      var n = Math.min(i + 1, win);
      out[i] = acc / n;
    }
    return out;
  }

  function resample(env, fromRate, toRate) {
    if (!env || !finite(fromRate) || !finite(toRate) || fromRate <= 0 || toRate <= 0) return null;
    var n = Math.floor(env.length * toRate / fromRate);
    if (n < 1) return null;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var src = i * fromRate / toRate;
      var j = Math.floor(src);
      if (j >= env.length) j = env.length - 1;
      var f = src - j;
      var a = env[j];
      var b = env[Math.min(j + 1, env.length - 1)];
      out[i] = a + (b - a) * f;
    }
    return out;
  }

  function syncWord() {
    var pat = [];
    for (var i = 0; i < 39; i++) pat.push((i % 4) < 2 ? 1 : 0);
    return pat;
  }

  function correlate(line, pat) {
    var best = -1;
    var at = 0;
    var limit = Math.min(48, line.length - pat.length);
    for (var s = 0; s <= limit; s++) {
      var acc = 0;
      for (var i = 0; i < pat.length; i++) {
        var v = line[s + i];
        if (!finite(v)) return null;
        acc += (pat[i] * 2 - 1) * (v - 0.5);
      }
      var score = acc / pat.length;
      if (score > best) {
        best = score;
        at = s;
      }
    }
    return { score: best, at: at };
  }

  function decode(samples, sampleRate) {
    var env = envelope(samples, sampleRate);
    if (!env) return { ok: false, status: "NO SAMPLES", pixels: [] };
    var px = resample(env, sampleRate, 4160);
    if (!px || px.length < LINE) return { ok: false, status: "NO SYNC", pixels: [] };
    var lines = Math.floor(px.length / LINE);
    var pat = syncWord();
    var image = [];
    for (var y = 0; y < lines; y++) {
      var raw = px.subarray(y * LINE, (y + 1) * LINE);
      var lo = Infinity;
      var hi = -Infinity;
      for (var i = 0; i < raw.length; i++) {
        if (raw[i] < lo) lo = raw[i];
        if (raw[i] > hi) hi = raw[i];
      }
      if (!(hi > lo)) continue;
      var norm = new Float32Array(raw.length);
      for (var k = 0; k < raw.length; k++) norm[k] = (raw[k] - lo) / (hi - lo);
      var hit = correlate(norm, pat);
      if (!hit || hit.score < 0.2) continue;
      var row = [];
      for (var p = 0; p < IMAGE_W; p++) {
        var q = norm[hit.at + IMAGE_AT + p];
        row.push(finite(q) ? Math.max(0, Math.min(255, Math.round(q * 255))) : 0);
      }
      image.push(row);
    }
    if (!image.length) return { ok: false, status: "NO SYNC", pixels: [] };
    return { ok: true, status: "SYNC", width: IMAGE_W, lines: image.length, pixels: image, calibrated: false };
  }

  function thermalLut(count) {
    if (!finite(count)) return null;
    var t = Math.max(0, Math.min(255, count)) / 255;
    return [Math.round(20 + 220 * t), Math.round(70 + 90 * (1 - Math.abs(t - 0.45) * 2)), Math.round(160 * (1 - t))];
  }

  function geoOverlay(pass, rows) {
    if (!pass || !finite(pass.lat) || !finite(pass.lon) || !finite(pass.headingDeg) || !finite(pass.groundSpeedMps)) return null;
    if (!finite(rows) || rows < 1 || pass.groundSpeedMps <= 0) return null;
    var step = pass.groundSpeedMps / 2;
    var points = [];
    var br = pass.headingDeg * Math.PI / 180;
    var cos = Math.cos(pass.lat * Math.PI / 180);
    if (!finite(cos) || Math.abs(cos) < 1e-6) return null;
    for (var i = 0; i < rows; i++) {
      var d = step * i;
      points.push({
        row: i,
        lat: pass.lat + (d * Math.cos(br)) / 111320,
        lon: pass.lon + (d * Math.sin(br)) / (111320 * cos),
      });
    }
    return { points: points, calibrated: false };
  }

  function linkStatus(usbPresent, sampleCount, deviceCount) {
    if (!usbPresent || !deviceCount) return "NO USB DEVICE";
    if (!sampleCount) return "OFFLINE";
    return "SAMPLES";
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-apt");
    if (!host) return;
    var usb = typeof navigator !== "undefined" && navigator.usb;
    if (!usb || typeof usb.getDevices !== "function") {
      host.textContent = "NO USB DEVICE";
      return;
    }
    usb.getDevices().then(function (list) {
      host.textContent = linkStatus(true, 0, list ? list.length : 0);
    }).catch(function () {
      host.textContent = "NO USB DEVICE";
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.apt = {
    envelope: envelope,
    resample: resample,
    decode: decode,
    thermalLut: thermalLut,
    geoOverlay: geoOverlay,
    linkStatus: linkStatus,
    mount: mount,
    LINE: LINE,
  };

  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
