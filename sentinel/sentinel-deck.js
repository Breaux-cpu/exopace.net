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
    if (!window.matchMedia("(max-width: 639.98px)").matches) return;
    sheet.setAttribute("data-open", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !sheet || sheet.getAttribute("data-open") !== "true") return;
    sheet.setAttribute("data-open", "false");
    if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.focus(); }
  });
})();


/* First paint of the two-pane watchlist: if a module tile would sit on the
   clip edge, fade that sliver away so only complete items show. */
(function () {
  "use strict";
  function settle() {
    var sheet = document.getElementById("sn-sheet");
    if (!sheet) return;
    var wide = window.matchMedia("(min-width: 640px)").matches;
    if (!wide) {
      sheet.style.setProperty("--sn-fade-b", "0px");
      return;
    }
    var cr = sheet.getBoundingClientRect();
    var bottom = cr.bottom;
    var fade = 0;
    var nodes = sheet.querySelectorAll(".sn-waves > *, .sn-row, .sn-note, h2, button");
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.height < 8) continue;
      if (r.top < bottom - 2 && r.bottom > bottom + 1) {
        fade = Math.max(fade, Math.ceil(bottom - r.top) + 2);
      }
    }
    if (fade > cr.height * 0.4) fade = 28;
    sheet.style.setProperty("--sn-fade-b", fade + "px");
  }
  function hook() {
    settle();
    window.addEventListener("resize", settle);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", settle);
    var sheet = document.getElementById("sn-sheet");
    if (sheet && window.ResizeObserver) new ResizeObserver(settle).observe(sheet);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook);
  else hook();
})();
