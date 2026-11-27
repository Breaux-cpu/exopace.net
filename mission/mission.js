/* Mission page helpers.
   1. No stars: turn off the Cesium skybox, sun and moon once the viewer exists.
   2. Below desktop: a thumb bar (LAYERS · STATION · VIEW) and one sheet (a bottom
      sheet on phones, a left side panel on landscape, Fold inner and tablets).
      The layer list, traffic toggles, camera modes, time bar and LOCATE move into
      the sheet while that layout applies and go back to where they were on desktop. Every control keeps its own handler; nothing is re-implemented. */
(function () {
  var tries = 0;
  function sky() {
    var v = window.EXOPACE_VIEWER;
    var scene = v && v.scene;
    if (!scene) {
      if (++tries < 240) setTimeout(sky, 250);
      return;
    }
    if (scene.skyBox) scene.skyBox.show = false;
    if (scene.sun) scene.sun.show = false;
    if (scene.moon) scene.moon.show = false;
    applyCesiumInsets();
  }

  /* Never pad #globe: CSS padding shrinks the Cesium canvas (box-sizing) and at
     phone widths can leave a ~30px-wide surface that paints black. HUD overlays
     the full-size globe. Resize only after the host has a real box, and only
     when that box or the viewer actually changes. */
  var insetTimer = 0;
  var lastGlobeBox = "";
  var lastViewer = null;
  function applyCesiumInsets() {
    var v = window.EXOPACE_VIEWER;
    var globe = document.getElementById("globe");
    if (!globe) return;
    var gr = globe.getBoundingClientRect();
    if (gr.width < 40 || gr.height < 40) return;
    globe.style.padding = "0px";
    var key = Math.round(gr.width) + "x" + Math.round(gr.height);
    if (key === lastGlobeBox && v === lastViewer) return;
    lastGlobeBox = key;
    lastViewer = v;
    if (v && typeof v.resize === "function") v.resize();
    if (v && v.scene && typeof v.scene.requestRender === "function") v.scene.requestRender();
  }
  function scheduleCesiumInsets() {
    if (insetTimer) clearTimeout(insetTimer);
    insetTimer = setTimeout(applyCesiumInsets, 50);
  }

  sky();
  applyCesiumInsets();

  var PHONE = window.matchMedia("(max-width: 1099px), (max-height: 500px)");   // compact: thumb bar + sheet
  var ROOMY = window.matchMedia("(min-width: 720px) and (min-height: 501px)");  // Fold inner / tablet: panel starts open
  var hud, thumb, sheet, title, panes = {}, marks = [], moved = false, pane = null;

  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (html != null) n.innerHTML = html;
    return n;
  }
  function reactButton(label) {
    var list = hud ? hud.querySelectorAll(".camstrip > .btn") : [];
    for (var i = 0; i < list.length; i++) if (list[i].textContent.trim() === label) return list[i];
    return null;
  }
  function stationOpen() { return !!(hud && hud.querySelector(".station")); }

  function build() {
    thumb = el("div", { id: "mi-thumb", role: "toolbar", "aria-label": "Mission tools" });
    thumb.innerHTML =
      '<button type="button" data-mi="layers" aria-controls="mi-sheet" aria-expanded="false">LAYERS<small id="mi-layers-state">SATS · FEEDS</small></button>' +
      '<button type="button" data-mi="station" aria-pressed="false">STATION<small id="mi-station-state">PASSES</small></button>' +
      '<button type="button" data-mi="view" aria-controls="mi-sheet" aria-expanded="false">VIEW<small id="mi-view-state">MOC · LIVE</small></button>';
    sheet = el("section", { id: "mi-sheet", role: "dialog", "aria-labelledby": "mi-sheet-title", hidden: "" });
    sheet.innerHTML =
      '<div class="mi-sheet-head"><h2 id="mi-sheet-title">LAYERS</h2><button type="button" id="mi-sheet-close" aria-label="Close">✕</button></div>' +
      '<div class="mi-sheet-body">' +
      '<div class="mi-pane" id="mi-pane-layers" hidden><p class="mi-label">SATELLITE LAYERS</p><div data-slot="layers"></div><p class="mi-label">LIVE FEEDS</p><div data-slot="traffic"></div></div>' +
      '<div class="mi-pane" id="mi-pane-view" hidden><p class="mi-label">CAMERA</p><div data-slot="camstrip"></div><p class="mi-label">TIME</p><div data-slot="timebar"></div><div data-slot="locate"></div></div>' +
      "</div>";
    title = sheet.querySelector("#mi-sheet-title");
    panes.layers = sheet.querySelector("#mi-pane-layers");
    panes.view = sheet.querySelector("#mi-pane-view");
    hud.appendChild(sheet);
    hud.appendChild(thumb);
    thumb.addEventListener("click", onThumb);
    sheet.querySelector("#mi-sheet-close").addEventListener("click", function () { close(); });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && pane) close(); });
  }

  // Move a node into a sheet slot, leaving a marker so it can go back exactly.
  function park(node, slot) {
    if (!node || node.__miParked) return;
    var mark = document.createComment("mi-slot");
    node.parentNode.insertBefore(mark, node);
    marks.push([node, mark]);
    node.__miParked = true;
    sheet.querySelector('[data-slot="' + slot + '"]').appendChild(node);
  }
  function unparkAll() {
    while (marks.length) {
      var pair = marks.pop();
      if (pair[1].parentNode) pair[1].parentNode.insertBefore(pair[0], pair[1]);
      if (pair[1].parentNode) pair[1].parentNode.removeChild(pair[1]);
      pair[0].__miParked = false;
    }
  }
  function parkAll() {
    park(hud.querySelector(".layers"), "layers");
    park(document.getElementById("exo-traffic"), "traffic");
    park(hud.querySelector(".camstrip"), "camstrip");
    park(hud.querySelector(".timebar"), "timebar");
    park(document.getElementById("exo-locate"), "locate");
  }

  function sync() {
    var open = !!pane || stationOpen();
    if (open) document.body.setAttribute("data-mi-open", pane || "station");
    else document.body.removeAttribute("data-mi-open");
    if (!thumb) return;
    thumb.querySelector('[data-mi="layers"]').setAttribute("aria-expanded", String(pane === "layers"));
    thumb.querySelector('[data-mi="view"]').setAttribute("aria-expanded", String(pane === "view"));
    thumb.querySelector('[data-mi="station"]').setAttribute("aria-pressed", String(stationOpen()));
    var cam = hud.querySelector(".camstrip > .btn.on:not(:nth-child(1)):not(:nth-child(2))");
    var rate = hud.querySelector(".timebar .btn.on");
    var label = (cam ? cam.textContent.replace("⌂", "").trim() : "FREE") + " · " + (rate ? rate.textContent.trim() : "LIVE");
    var vs = document.getElementById("mi-view-state");
    if (vs && vs.textContent !== label) vs.textContent = label;
    var onCount = hud.querySelectorAll(".layers .btn.on").length + document.querySelectorAll("#exo-traffic-row > .btn.on").length;
    var ls = document.getElementById("mi-layers-state");
    var lt = onCount + " ON";
    if (ls && ls.textContent !== lt) ls.textContent = lt;
  }

  function open(name) {
    if (stationOpen()) { var s = reactButton("STATION"); if (s) s.click(); }
    pane = name;
    panes.layers.hidden = name !== "layers";
    panes.view.hidden = name !== "view";
    title.textContent = name === "layers" ? "LAYERS & FEEDS" : "VIEW & TIME";
    sheet.hidden = false;
    sync();
  }
  function close() {
    pane = null;
    if (sheet) sheet.hidden = true;
    sync();
  }
  function onThumb(ev) {
    var b = ev.target.closest && ev.target.closest("button[data-mi]");
    if (!b) return;
    var what = b.getAttribute("data-mi");
    if (what === "station") {
      close();
      var s = reactButton("STATION");
      if (s) s.click();
      setTimeout(sync, 50);
      return;
    }
    if (pane === what) close();
    else open(what);
  }

  function apply() {
    if (!hud) return;
    if (PHONE.matches) {
      var first = !moved;
      parkAll();
      moved = true;
      if (first && ROOMY.matches && !pane && !stationOpen()) open("layers");
    } else if (moved) {
      close();
      unparkAll();
      moved = false;
    }
    sync();
    scheduleCesiumInsets();
  }

  /* One plain line instead of a column of red OFFLINE rows when no ground
     station gear answers. The rows stay underneath for operators. */
  function noHardwareNote() {
    var station = hud && hud.querySelector(".station");
    if (!station) return;
    var head = Array.prototype.find.call(station.querySelectorAll("h3"), function (h) { return /^RF CHAIN/.test(h.textContent); });
    if (!head) return;
    var kv = head.nextElementSibling && head.nextElementSibling.classList.contains("mi-nohw") ? head.nextElementSibling.nextElementSibling : head.nextElementSibling;
    if (!kv) return;
    var spans = kv.querySelectorAll("span");
    var off = spans.length > 0 && Array.prototype.every.call(spans, function (sp) { return sp.classList.contains("stoff") && !/PROBING/.test(sp.textContent); });
    var note = station.querySelector(".mi-nohw");
    if (off && !note) {
      note = el("p", { "class": "mi-nohw" });
      note.textContent = "No ground-station hardware connected. Passes are computed for EXOpace GS (Memphis) and work without it; radio, rotator and mesh need that gear.";
      head.after(note);
    } else if (!off && note) note.remove();
  }

  function start() {
    hud = document.querySelector(".hud");
    if (!hud || !hud.querySelector(".camstrip")) { setTimeout(start, 300); return; }
    build();
    apply();
    if (PHONE.addEventListener) PHONE.addEventListener("change", apply);
    else PHONE.addListener(apply);
    // exo-traffic.js mounts its rail and LOCATE a little later; park them when they show up.
    new MutationObserver(function () {
      if (PHONE.matches && moved) parkAll();
      sync();
      scheduleCesiumInsets();
    }).observe(hud, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    setInterval(noHardwareNote, 2000);
    window.addEventListener("resize", scheduleCesiumInsets);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleCesiumInsets);
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(scheduleCesiumInsets);
      ro.observe(hud);
      var globeEl = document.getElementById("globe");
      if (globeEl) ro.observe(globeEl);
      var rootEl = document.getElementById("root");
      if (rootEl) ro.observe(rootEl);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
