/* Radio layout helper. On phones the thumb dock carries the active tool's primary
   control. The dock button only clicks the real in-card control and copies its
   label/disabled state; it never fakes a result. */
(function () {
  "use strict";
  var PRIMARY = {
    listen: "#livebtn",
    band: "#band button[onclick^='quickScan']",
    watch: "#watch .exo-usb-connect",
    scan: "#scan button[onclick^='scanStart']",
    decode: "#decode .exo-usb-connect",
    ble: "#ble button[onclick=\"bleCmd('start')\"]",
    camera: "#camera button[onclick^='camStart']",
    tools: "#tools button[onclick=\"mon('start')\"]"
  };
  var dock = document.getElementById("rg-dock");
  var proxy = document.getElementById("rg-primary");
  if (!dock || !proxy) return;
  var src = null, obs = null;
  var phone = window.matchMedia("(max-width: 719.98px) and (min-height: 501px)");

  function sync() {
    if (!src) return;
    proxy.textContent = (src.textContent || "").trim();
    proxy.disabled = !!src.disabled;
    proxy.dataset.tone = /\bstop\b/.test(src.className) ? "stop" : "";
  }
  function bind() {
    var on = document.querySelector("main#exo-main > section.on");
    var sel = on && PRIMARY[on.id];
    var next = sel ? document.querySelector(sel) : null;
    if (next === src) { sync(); return; }
    if (src) src.classList.remove("rg-docked");
    if (obs) { obs.disconnect(); obs = null; }
    src = next;
    proxy.hidden = !src;
    dock.classList.toggle("has-primary", !!src);
    if (!src) return;
    src.classList.add("rg-docked");
    obs = new MutationObserver(sync);
    obs.observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
    sync();
  }
  proxy.addEventListener("click", function () {
    if (src && !src.disabled) src.click();
  });
  function watch() {
    var main = document.getElementById("exo-main");
    if (!main) return;
    new MutationObserver(bind).observe(main, { attributes: true, attributeFilter: ["class"], subtree: false, childList: false });
    main.querySelectorAll(":scope > section").forEach(function (s) {
      new MutationObserver(bind).observe(s, { attributes: true, attributeFilter: ["class"] });
    });
    bind();
  }
  if (phone.addEventListener) phone.addEventListener("change", bind);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();

/* Late-mounting radio modules (PiP, passive radar, codec panels) append to <body>.
   Re-home them into the Live tab's Instruments card so they never float loose. */
(function () {
  "use strict";
  function home() {
    var card = document.getElementById("rg-modules");
    if (!card) return;
    var moved = false;
    Array.prototype.slice.call(document.body.children).forEach(function (n) {
      if (n.tagName === "SCRIPT" || n.id === "toast" || n.id === "rg-dock" || n.id === "rg-scroll") return;
      if (n.matches(".exo-wave, .exo-wave-btn, #exo-radar-map")) { card.appendChild(n); moved = true; }
    });
    if (moved) card.hidden = false;
  }
  new MutationObserver(home).observe(document.body, { childList: true });
  document.addEventListener("DOMContentLoaded", home);
  window.addEventListener("load", home);
})();
