/* Shared shell helpers: wrap the status pill, drive sheets. Idempotent. */
(function (global) {
  if (global.EXO_LAYOUT) return;

  
  function ensureStyles() {
    if (document.querySelector("link[data-exo-layout], style[data-exo-layout]")) return;
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/assets/exo-layout.css?v=1";
    l.setAttribute("data-exo-layout", "1");
    (document.head || document.documentElement).appendChild(l);
  }

  function wrapPill(root) {
    var pill = (root || document).querySelector(".exo-pill");
    if (!pill || pill.querySelector(".exo-pill-status")) return pill;
    var status = document.createElement("div");
    status.className = "exo-pill-status";
    var actions = document.createElement("div");
    actions.className = "exo-pill-actions";
    var nodes = Array.prototype.slice.call(pill.childNodes);
    nodes.forEach(function (node) {
      if (node.nodeType !== 1) {
        status.appendChild(node);
        return;
      }
      var id = node.id || "";
      if (id === "exo-pill-copy" || id === "exo-pill-jump" || node.matches("button, a.exo-btn, a#exo-pill-jump")) {
        actions.appendChild(node);
      } else {
        status.appendChild(node);
      }
    });
    pill.appendChild(status);
    if (actions.childNodes.length) pill.appendChild(actions);
    return pill;
  }

  function closestSheet(el) {
    return el && el.closest ? el.closest(".exo-sheet, [data-exo-sheet]") : null;
  }

  function openSheet(sheet) {
    if (!sheet) return;
    sheet.classList.add("is-open");
    sheet.setAttribute("data-open", "true");
    document.body.classList.add("exo-sheet-open");
    var toggle = document.querySelector('[data-exo-sheet-toggle][aria-controls="' + sheet.id + '"]');
    if (toggle) toggle.setAttribute("aria-expanded", "true");
  }

  function closeSheet(sheet) {
    var target = sheet || document.querySelector(".exo-sheet.is-open, .exo-sheet[data-open='true'], [data-exo-sheet].is-open");
    if (!target) {
      document.body.classList.remove("exo-sheet-open");
      return;
    }
    target.classList.remove("is-open");
    target.setAttribute("data-open", "false");
    var open = document.querySelector(".exo-sheet.is-open, .exo-sheet[data-open='true']");
    if (!open) document.body.classList.remove("exo-sheet-open");
    var toggle = target.id && document.querySelector('[data-exo-sheet-toggle][aria-controls="' + target.id + '"]');
    if (toggle) toggle.setAttribute("aria-expanded", "false");
  }

  function toggleSheet(sheet) {
    if (!sheet) return;
    if (sheet.classList.contains("is-open") || sheet.getAttribute("data-open") === "true") closeSheet(sheet);
    else openSheet(sheet);
  }

  function onDocClick(event) {
    var toggle = event.target.closest && event.target.closest("[data-exo-sheet-toggle]");
    if (toggle) {
      var id = toggle.getAttribute("aria-controls");
      var sheet = id && document.getElementById(id);
      if (sheet) {
        event.preventDefault();
        toggleSheet(sheet);
      }
      return;
    }
    if (event.target.closest && event.target.closest("[data-exo-sheet-close], .exo-sheet-scrim, .exo-sheet-close")) {
      closeSheet(closestSheet(event.target) || undefined);
    }
  }

  function onKey(event) {
    if (event.key === "Escape") closeSheet();
  }

  function init() {
    ensureStyles();
    wrapPill(document);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
  }

  global.EXO_LAYOUT = {
    wrapPill: wrapPill,
    openSheet: openSheet,
    closeSheet: closeSheet,
    toggleSheet: toggleSheet,
    init: init
  };

  ensureStyles();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
