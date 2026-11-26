/* Sentinel layout helpers: the phone thumb dock mirrors the real Start control,
   and the watchlist sheet closes on Escape. No data is created here. */
(function () {
  "use strict";
  function mirror(proxy) {
    var target = document.getElementById(proxy.getAttribute("data-proxy"));
    if (!target) { proxy.hidden = true; return; }
    function sync() {
      proxy.textContent = target.textContent;
      proxy.disabled = !!target.disabled;
      var label = target.getAttribute("aria-label");
      if (label) proxy.setAttribute("aria-label", label); else proxy.removeAttribute("aria-label");
    }
    new MutationObserver(sync).observe(target, { attributes: true, childList: true, characterData: true, subtree: true });
    proxy.addEventListener("click", function () { if (!target.disabled) target.click(); });
    sync();
  }
  document.querySelectorAll("[data-proxy]").forEach(mirror);
  var sheet = document.getElementById("sn-sheet");
  var toggle = document.getElementById("sn-sheet-toggle");
  document.addEventListener("click", function (e) {
    if (!sheet || sheet.getAttribute("data-open") !== "true" || sheet.contains(e.target)) return;
    if (!window.matchMedia("(max-width: 719.98px)").matches) return;
    sheet.setAttribute("data-open", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !sheet || sheet.getAttribute("data-open") !== "true") return;
    sheet.setAttribute("data-open", "false");
    if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
  });
})();

/* Measure the shell's fixed COPY/JUMP dock so page docks sit exactly on top of it. */
(function () {
  "use strict";
  function measure() {
    var d = document.querySelector(".exo-pill-actions");
    var h = 0;
    if (d && getComputedStyle(d).position === "fixed") {
      var r = d.getBoundingClientRect();
      if (r.height > 0 && r.bottom >= window.innerHeight - 2) h = Math.ceil(window.innerHeight - r.top);
    }
    document.documentElement.style.setProperty("--pg-shell-dock", h + "px");
  }
  window.addEventListener("resize", measure);
  window.addEventListener("orientationchange", measure);
  document.addEventListener("DOMContentLoaded", measure);
  window.addEventListener("load", measure);
  if (window.ResizeObserver) {
    var tries = 0, t = setInterval(function () {
      var d = document.querySelector(".exo-pill-actions");
      if (d || ++tries > 40) { clearInterval(t); if (d) new ResizeObserver(measure).observe(d); measure(); }
    }, 100);
  }
  measure();
})();
