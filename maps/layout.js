/* Field Maps layout: tool tabs, the phone sheet, and single-switch layer rows.
   Pure UI: every control still fires the same app.js handler it always did. */
(function () {
  var dock = document.getElementById("fm-dock");
  if (!dock) return;
  var tabs = Array.prototype.slice.call(dock.querySelectorAll('.fm-tabs [role="tab"]'));
  var grab = document.getElementById("fm-grab");
  var phone = window.matchMedia("(max-width: 719px) and (min-height: 501px)");
  var STATES = ["peek", "half", "full"];
  var KEY = "fm-tab";

  function setState(state) {
    dock.setAttribute("data-state", state);
    if (grab) {
      grab.setAttribute("aria-expanded", state === "peek" ? "false" : "true");
      grab.setAttribute("aria-label", state === "full" ? "Collapse panel" : "Expand panel");
    }
  }

  function select(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
    try { sessionStorage.setItem(KEY, tab.getAttribute("data-tab")); } catch (e) {}
    var body = dock.querySelector(".fm-panel-body");
    if (body) body.scrollTop = 0;
  }

  tabs.forEach(function (tab, i) {
    tab.addEventListener("click", function () {
      var already = tab.getAttribute("aria-selected") === "true";
      select(tab, false);
      if (phone.matches && dock.getAttribute("data-state") === "peek") setState("half");
      else if (phone.matches && already && dock.getAttribute("data-state") !== "peek") setState("peek");
    });
    tab.addEventListener("keydown", function (ev) {
      var n = null;
      if (ev.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
      else if (ev.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (ev.key === "Home") n = tabs[0];
      else if (ev.key === "End") n = tabs[tabs.length - 1];
      if (!n) return;
      ev.preventDefault();
      select(n, true);
    });
  });

  if (grab) {
    grab.addEventListener("click", function () {
      var i = STATES.indexOf(dock.getAttribute("data-state"));
      setState(STATES[(i + 1) % STATES.length]);
    });
    // Drag the handle: up grows, down shrinks.
    var startY = null;
    grab.addEventListener("pointerdown", function (ev) { startY = ev.clientY; });
    window.addEventListener("pointerup", function (ev) {
      if (startY == null) return;
      var dy = ev.clientY - startY;
      startY = null;
      if (Math.abs(dy) < 24) return;
      var i = STATES.indexOf(dock.getAttribute("data-state"));
      setState(STATES[Math.max(0, Math.min(STATES.length - 1, i + (dy < 0 ? 1 : -1)))]);
      grab.dataset.dragged = "1";
      setTimeout(function () { delete grab.dataset.dragged; }, 0);
    });
    grab.addEventListener("click", function (ev) {
      if (grab.dataset.dragged) { ev.stopImmediatePropagation(); }
    }, true);
  }

  // A layer row is one switch: tapping the lit name sends the matching HIDE tap.
  dock.addEventListener("click", function (ev) {
    var btn = ev.target.closest && ev.target.closest('#fm-sec-layers .fm-seg[data-key^="layer-"] button[data-value="true"]');
    if (!btn || btn.getAttribute("aria-pressed") !== "true") return;
    var off = btn.parentElement.querySelector('button[data-value="false"]');
    if (!off) return;
    ev.preventDefault();
    ev.stopPropagation();
    off.click();
  }, true);
  // Switch semantics for assistive tech; app.js keeps aria-pressed in sync.
  Array.prototype.forEach.call(dock.querySelectorAll('#fm-sec-layers .fm-seg[data-key^="layer-"]'), function (seg) {
    seg.setAttribute("role", "group");
    var on = seg.querySelector('button[data-value="true"]');
    var off = seg.querySelector('button[data-value="false"]');
    if (off) off.tabIndex = -1;
    if (on) on.setAttribute("aria-label", (on.textContent || "").trim() + " layer");
  });

  // Restore the last tab for this session; deep links to #exo-link open DEVICE.
  var want = null;
  try { want = sessionStorage.getItem(KEY); } catch (e) {}
  if (location.hash === "#exo-link") want = "device";
  var start = tabs.filter(function (t) { return t.getAttribute("data-tab") === want; })[0];
  if (start) select(start, false);

  // MapLibre opens the compact attribution on first paint; start it closed so it
  // stays a 44px "i" button beside the scale bar instead of a wide banner.
  var tries = 0;
  (function closeAttrib() {
    var el = document.querySelector("#fm-map .maplibregl-ctrl-attrib.maplibregl-compact");
    if (el) {
      el.classList.remove("maplibregl-compact-show");
      el.removeAttribute("open");
      return;
    }
    if (++tries < 60) setTimeout(closeAttrib, 250);
  })();
})();
