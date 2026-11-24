/* Rotor BPF comb. Silence is not a detection. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function powerAt(samples, k) {
    var n = samples.length;
    var w = 2 * Math.PI * k / n;
    var coeff = 2 * Math.cos(w);
    var s0 = 0;
    var s1 = 0;
    var s2 = 0;
    for (var i = 0; i < n; i++) {
      s0 = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    return s1 * s1 + s2 * s2 - coeff * s1 * s2;
  }

  function bandPower(samples, sampleRate, freq) {
    if (!finite(freq) || freq <= 0 || freq >= sampleRate / 2) return 0;
    var k = Math.round(freq * samples.length / sampleRate);
    return powerAt(samples, k);
  }

  function classify(samples, sampleRate, at) {
    if (!samples || !samples.length) return { status: "NO SAMPLES", events: [] };
    if (!finite(sampleRate) || sampleRate < 2000 || samples.length < 256) return { status: "BASELINE_CALIBRATING", events: [] };
    var clean = [];
    for (var i = 0; i < samples.length; i++) {
      if (!finite(samples[i])) return { status: "NO SAMPLES", events: [] };
      clean.push(samples[i]);
    }
    var lows = [];
    var best = null;
    for (var f = 80; f <= 200; f += 10) {
      var p1 = bandPower(clean, sampleRate, f);
      var p2 = bandPower(clean, sampleRate, f * 2);
      var p3 = bandPower(clean, sampleRate, f * 3);
      lows.push(p1);
      var score = Math.min(p1, p2, p3);
      if (!best || score > best.score) best = { f: f, score: score, p1: p1 };
    }
    lows.sort(function (a, b) { return a - b; });
    var median = lows[Math.floor(lows.length / 2)] || 0;
    if (!best || best.score <= 1e-6 || best.score < median * 8) return { status: "NO ROTOR", events: [] };
    return { status: "ROTOR", events: [{ hz: best.f, at: typeof at === "string" && at ? at : null }] };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-acoustic");
      if (host) host.textContent = "NO SAMPLES";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.acoustic = { classify: classify, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
