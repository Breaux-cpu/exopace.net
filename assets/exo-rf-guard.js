/* Noise-floor guard. A missing baseline is not an alarm. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function clean(samples) {
    if (!samples || !samples.length) return [];
    var out = [];
    for (var i = 0; i < samples.length; i++) {
      if (!finite(samples[i])) return [];
      out.push(samples[i]);
    }
    return out;
  }

  function median(samples) {
    var sorted = samples.slice().sort(function (a, b) { return a - b; });
    return sorted[Math.floor(sorted.length / 2)];
  }

  function assess(samples, baseline) {
    var now = clean(samples);
    if (!now.length) return { status: "NO SAMPLES", alarm: null, deltaDb: null };
    if (now.length < 16) return { status: "BASELINE_CALIBRATING", alarm: null, deltaDb: null };
    var base = clean(baseline);
    if (base.length < 16) return { status: "BASELINE_CALIBRATING", alarm: null, deltaDb: null };
    var delta = median(now) - median(base);
    if (delta >= 12) return { status: "ANOMALY", alarm: "NOISE FLOOR", deltaDb: delta };
    return { status: "QUIET", alarm: null, deltaDb: delta };
  }

  function linkStatus(usbPresent, deviceCount, sampleCount) {
    if (!usbPresent || !deviceCount) return "NO USB DEVICE";
    if (!sampleCount) return "BASELINE_CALIBRATING";
    return "STANDBY";
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-rf");
      if (!host) return;
      var usb = typeof navigator !== "undefined" && navigator.usb;
      if (!usb || typeof usb.getDevices !== "function") {
        host.textContent = "NO USB DEVICE";
        return;
      }
      usb.getDevices().then(function (list) {
        host.textContent = linkStatus(true, list ? list.length : 0, 0);
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
  root.EXO.rfGuard = { assess: assess, linkStatus: linkStatus, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
