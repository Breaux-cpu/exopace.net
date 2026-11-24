/* Unsigned RTL IQ, radix-2 power spectrum, and FM / AM / USB demod. No samples are synthesized here. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EXO_IQ = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function unsignedToIq(bytes) {
    var n = Math.floor(bytes.length / 2);
    var i = new Float32Array(n);
    var q = new Float32Array(n);
    for (var k = 0; k < n; k++) {
      i[k] = (bytes[k * 2] - 127.5) / 127.5;
      q[k] = (bytes[k * 2 + 1] - 127.5) / 127.5;
    }
    return { i: i, q: q };
  }

  function fftRadix2(re, im) {
    var n = re.length;
    if (n !== im.length || (n & (n - 1)) !== 0) throw new Error("FFT length must be a power of two");
    for (var i = 1, j = 0; i < n; i++) {
      var bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        var tr = re[i]; re[i] = re[j]; re[j] = tr;
        var ti = im[i]; im[i] = im[j]; im[j] = ti;
      }
    }
    for (var len = 2; len <= n; len <<= 1) {
      var ang = -2 * Math.PI / len;
      var wlenRe = Math.cos(ang);
      var wlenIm = Math.sin(ang);
      for (var start = 0; start < n; start += len) {
        var wRe = 1;
        var wIm = 0;
        var half = len >> 1;
        for (var k = 0; k < half; k++) {
          var uRe = re[start + k];
          var uIm = im[start + k];
          var vRe = re[start + k + half] * wRe - im[start + k + half] * wIm;
          var vIm = re[start + k + half] * wIm + im[start + k + half] * wRe;
          re[start + k] = uRe + vRe;
          im[start + k] = uIm + vIm;
          re[start + k + half] = uRe - vRe;
          im[start + k + half] = uIm - vIm;
          var nextRe = wRe * wlenRe - wIm * wlenIm;
          wIm = wRe * wlenIm + wIm * wlenRe;
          wRe = nextRe;
        }
      }
    }
    return { re: re, im: im };
  }

  function powerDbfs(re, im) {
    var n = re.length;
    var out = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var mag = Math.hypot(re[i], im[i]) / n;
      out[i] = 20 * Math.log10(mag + 1e-20);
    }
    return out;
  }

  function demodFm(i, q, state) {
    var n = i.length;
    var out = new Float32Array(n);
    var have = state && state.re != null;
    var prevRe = have ? state.re : (n ? i[0] : 1);
    var prevIm = have ? state.im : (n ? q[0] : 0);
    var start = have ? 0 : 1;
    for (var k = start; k < n; k++) {
      var re = i[k] * prevRe + q[k] * prevIm;
      var im = q[k] * prevRe - i[k] * prevIm;
      out[k] = Math.atan2(im, re);
      prevRe = i[k];
      prevIm = q[k];
    }
    if (state) { state.re = prevRe; state.im = prevIm; }
    return out;
  }

  function demodAm(i, q) {
    var n = i.length;
    var out = new Float32Array(n);
    var mean = 0;
    for (var k = 0; k < n; k++) {
      out[k] = Math.hypot(i[k], q[k]);
      mean += out[k];
    }
    mean = n ? mean / n : 0;
    for (var j = 0; j < n; j++) out[j] -= mean;
    return out;
  }

  function demodUsb(i, q, sampleRate, state) {
    var n = i.length;
    var out = new Float32Array(n);
    var phase = state && state.phase ? state.phase : 0;
    var acc = state && state.acc ? state.acc : 0;
    var step = 2 * Math.PI * 1500 / (sampleRate || 1);
    var alpha = 1 - Math.exp(-2 * Math.PI * 2700 / (sampleRate || 1));
    for (var k = 0; k < n; k++) {
      var mixed = i[k] * Math.cos(phase) + q[k] * Math.sin(phase);
      acc += alpha * (mixed - acc);
      out[k] = acc;
      phase += step;
      if (phase > Math.PI * 2) phase -= Math.PI * 2;
    }
    if (state) { state.phase = phase; state.acc = acc; }
    return out;
  }

  function scaleAudio(phase, sampleRate, deviationHz) {
    var full = 2 * Math.PI * deviationHz / sampleRate;
    var out = new Float32Array(phase.length);
    for (var i = 0; i < phase.length; i++) {
      var v = full ? phase[i] / full : 0;
      out[i] = v > 1 ? 1 : v < -1 ? -1 : v;
    }
    return out;
  }

  function resample(samples, fromRate, toRate) {
    if (!samples.length || !fromRate || !toRate) return new Float32Array(0);
    var outLen = Math.max(1, Math.floor(samples.length * toRate / fromRate));
    var out = new Float32Array(outLen);
    var step = fromRate / toRate;
    var pos = 0;
    for (var i = 0; i < outLen; i++) {
      var idx = Math.floor(pos);
      var frac = pos - idx;
      var a = samples[idx] || 0;
      var b = samples[Math.min(samples.length - 1, idx + 1)] || 0;
      out[i] = a + (b - a) * frac;
      pos += step;
    }
    return out;
  }

  return {
    unsignedToIq: unsignedToIq,
    fftRadix2: fftRadix2,
    powerDbfs: powerDbfs,
    demodFm: demodFm,
    demodAm: demodAm,
    demodUsb: demodUsb,
    scaleAudio: scaleAudio,
    resample: resample,
  };
});
