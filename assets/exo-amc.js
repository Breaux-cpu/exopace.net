/* Spectral kurtosis and instantaneous amplitude, phase, and frequency. Noise stays UNKNOWN. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function pairs(iq) {
    if (!iq || !iq.length) return [];
    var out = [];
    if (Array.isArray(iq[0])) {
      for (var i = 0; i < iq.length; i++) {
        if (!iq[i] || !finite(iq[i][0]) || !finite(iq[i][1])) return [];
        out.push([iq[i][0], iq[i][1]]);
      }
      return out;
    }
    if (iq.length % 2) return [];
    for (var n = 0; n < iq.length; n += 2) {
      if (!finite(iq[n]) || !finite(iq[n + 1])) return [];
      out.push([iq[n], iq[n + 1]]);
    }
    return out;
  }

  function variance(values) {
    if (!values.length) return 0;
    var mean = 0;
    for (var i = 0; i < values.length; i++) mean += values[i];
    mean /= values.length;
    var acc = 0;
    for (var n = 0; n < values.length; n++) {
      var d = values[n] - mean;
      acc += d * d;
    }
    return acc / values.length;
  }

  function median(values) {
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)];
  }

  function kurtosis(values) {
    var mean = 0;
    for (var i = 0; i < values.length; i++) mean += values[i];
    mean /= values.length;
    var second = 0;
    var fourth = 0;
    for (var n = 0; n < values.length; n++) {
      var d = values[n] - mean;
      var sq = d * d;
      second += sq;
      fourth += sq * sq;
    }
    second /= values.length;
    if (second < 1e-18) return 0;
    return (fourth / values.length) / (second * second);
  }

  function flatness(values) {
    var logSum = 0;
    var sum = 0;
    for (var i = 0; i < values.length; i++) {
      var v = values[i] + 1e-12;
      logSum += Math.log(v);
      sum += v;
    }
    var geo = Math.exp(logSum / values.length);
    var ari = sum / values.length;
    return ari > 0 ? geo / ari : 0;
  }

  function spectrum(samples) {
    var count = samples.length;
    var mag = new Array(count);
    for (var k = 0; k < count; k++) {
      var re = 0;
      var im = 0;
      for (var t = 0; t < count; t++) {
        var ang = -2 * Math.PI * k * t / count;
        var c = Math.cos(ang);
        var s = Math.sin(ang);
        re += samples[t][0] * c - samples[t][1] * s;
        im += samples[t][0] * s + samples[t][1] * c;
      }
      mag[k] = Math.hypot(re, im);
    }
    return mag;
  }

  function topTwo(mag) {
    var first = 0;
    var second = 0;
    var i1 = -1;
    var i2 = -1;
    for (var i = 0; i < mag.length; i++) {
      if (mag[i] > first) {
        second = first;
        i2 = i1;
        first = mag[i];
        i1 = i;
      } else if (mag[i] > second) {
        second = mag[i];
        i2 = i;
      }
    }
    return { first: first, second: second, gap: i1 < 0 || i2 < 0 ? 0 : Math.abs(i1 - i2) };
  }

  function autocorr(samples) {
    var count = samples.length;
    var best = 0;
    var lagAt = 0;
    var start = 12;
    var stop = Math.floor(count / 3);
    for (var lag = start; lag < stop; lag += 2) {
      var num = 0;
      var left = 0;
      var right = 0;
      for (var i = 0; i < count - lag; i++) {
        num += samples[i][0] * samples[i + lag][0] + samples[i][1] * samples[i + lag][1];
        left += samples[i][0] * samples[i][0] + samples[i][1] * samples[i][1];
        right += samples[i + lag][0] * samples[i + lag][0] + samples[i + lag][1] * samples[i + lag][1];
      }
      var den = Math.sqrt(left * right);
      var score = den > 0 ? num / den : 0;
      if (score > best) {
        best = score;
        lagAt = lag;
      }
    }
    return { score: best, lag: lagAt };
  }

  function symbolFlat(samples, lag) {
    if (lag < 16) return 0;
    var best = 0;
    var step = Math.max(1, Math.floor(lag / 4));
    for (var off = 0; off + lag <= samples.length; off += step) {
      var chunk = samples.slice(off, off + lag);
      var mag = spectrum(chunk).slice(1, Math.floor(lag / 2));
      if (mag.length < 4) continue;
      var score = flatness(mag);
      if (score > best) best = score;
    }
    return best;
  }

  function classify(iq) {
    var samples = pairs(iq);
    if (!iq || !iq.length) return { status: "NO SAMPLES", mode: null };
    if (!samples.length || samples.length < 64) return { status: "BASELINE_CALIBRATING", mode: null };
    var env = [];
    var sum = 0;
    for (var i = 0; i < samples.length; i++) {
      var amp = Math.hypot(samples[i][0], samples[i][1]);
      env.push(amp);
      sum += amp;
    }
    var meanE = sum / env.length;
    if (meanE < 1e-4) return { status: "BASELINE_CALIBRATING", mode: null };
    var cv = Math.sqrt(variance(env)) / meanE;
    var prev = Math.atan2(samples[0][1], samples[0][0]);
    var dphi = [];
    var jumps = 0;
    for (var n = 1; n < samples.length; n++) {
      var phase = Math.atan2(samples[n][1], samples[n][0]);
      var dp = phase - prev;
      while (dp > Math.PI) dp -= 2 * Math.PI;
      while (dp < -Math.PI) dp += 2 * Math.PI;
      if (Math.abs(dp) > 1.2) jumps += 1;
      dphi.push(dp);
      prev = phase;
    }
    var freqVar = variance(dphi);
    var half = spectrum(samples).slice(1, Math.floor(samples.length / 2));
    var peaks = topTwo(half);
    var ratio = peaks.first > 0 ? peaks.second / peaks.first : 0;
    var kurt = kurtosis(half);
    var flat = flatness(half);
    var ac = autocorr(samples);
    var aligned = symbolFlat(samples, ac.lag);
    var constant = cv < 0.12;
    var mode = null;
    if (constant && ratio >= 0.45 && peaks.gap >= 3 && jumps < 2) mode = "FSK";
    else if (constant && jumps >= 2 && jumps <= 8) mode = "PSK";
    else if (constant && freqVar < 0.0005) mode = "CW";
    else if (constant && freqVar >= 0.05) mode = "WFM";
    else if (constant) mode = "NFM";
    else if (cv >= 0.12 && ratio < 0.65 && peaks.first > median(half) * 4) mode = "AM";
    else if (ac.score >= 0.9 && aligned >= 0.4 && cv > 0.4 && kurt < 12) mode = "OFDM";
    return {
      status: mode || "UNKNOWN",
      mode: mode,
      features: { cv: cv, freqVar: freqVar, jumps: jumps, ratio: ratio, flat: flat, kurt: kurt, ac: ac.score, aligned: aligned, gap: peaks.gap },
    };
  }

  function workerSource() {
    var body = [finite, pairs, variance, median, kurtosis, flatness, spectrum, topTwo, autocorr, symbolFlat, classify]
      .map(function (fn) { return fn.toString(); })
      .join("\n");
    return "/* spectral kurtosis and instantaneous amplitude phase frequency */\n" +
      body +
      "\nself.onmessage = function (event) { self.postMessage(classify(event.data)); };\n";
  }

  function spawn(iq) {
    if (!iq || !iq.length) return null;
    if (typeof Worker === "undefined") return null;
    var blob = new Blob([workerSource()], { type: "text/javascript" });
    var url = URL.createObjectURL(blob);
    return new Worker(url);
  }

  function linkStatus(usbPresent, deviceCount) {
    if (!usbPresent || !deviceCount) return "NO USB DEVICE";
    return "NO SAMPLES";
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-amc");
      if (!host) return;
      var usb = typeof navigator !== "undefined" && navigator.usb;
      if (!usb || typeof usb.getDevices !== "function") {
        host.textContent = "NO USB DEVICE";
        return;
      }
      usb.getDevices().then(function (list) {
        host.textContent = linkStatus(true, list ? list.length : 0);
      }).catch(function () {
        host.textContent = "NO USB DEVICE";
      });
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.amc = { classify: classify, workerSource: workerSource, spawn: spawn, linkStatus: linkStatus, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
