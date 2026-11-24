/* Frame budget from the battery the browser reports. A missing API is not a low battery. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function fpsFor(battery) {
    if (!battery || !finite(battery.level)) return { fps: 30, state: "NO BATTERY API" };
    if (battery.charging) return { fps: 30, state: "CHARGING" };
    if (battery.level < 0.15) return { fps: 8, state: "THERMAL" };
    if (battery.level < 0.4) return { fps: 15, state: "SAVE" };
    return { fps: 30, state: "FULL" };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-throttle");
    if (!host) return;
    var nav = typeof navigator !== "undefined" ? navigator : null;
    if (!nav || typeof nav.getBattery !== "function") {
      host.textContent = "NO BATTERY API";
      return;
    }
    nav.getBattery().then(function (battery) {
      var plan = fpsFor({ charging: !!battery.charging, level: battery.level });
      host.textContent = plan.state + " · " + plan.fps + " FPS";
      documentRef.documentElement.dataset.exoFps = String(plan.fps);
    }).catch(function () {
      host.textContent = "NO BATTERY API";
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.throttle = { fpsFor: fpsFor, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
