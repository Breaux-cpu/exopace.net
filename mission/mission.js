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

  function applyCesiumInsets() {
    var v = window.EXOPACE_VIEWER;
    var globe = document.getElementById("globe");
    if (!globe) return;
    var gr = globe.getBoundingClientRect();
    if (gr.width < 40 || gr.height < 40) return;
    var pad = { top: 0, right: 0, bottom: 0, left: 0 };
    var nodes = document.querySelectorAll(".hud .search, .hud .dossier, .hud .station, .hud .zoom, #mi-thumb, .hud .tl, #exo-install, #globe .cesium-viewer-bottom");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el.getClientRects().length) continue;
      var cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      var ox = Math.max(0, Math.min(r.right, gr.right) - Math.max(r.left, gr.left));
      var oy = Math.max(0, Math.min(r.bottom, gr.bottom) - Math.max(r.top, gr.top));
      if (ox < 16 || oy < 16) continue;
      var gap = 8;
      var fromTop = r.top - gr.top;
      var fromBottom = gr.bottom - r.bottom;
      var fromLeft = r.left - gr.left;
      var fromRight = gr.right - r.right;
      if (r.height < gr.height * 0.55) {
        if (fromTop <= fromBottom && fromTop + r.height < gr.height * 0.62) {
          pad.top = Math.max(pad.top, Math.round(r.bottom - gr.top + gap));
          continue;
        }
        if (fromBottom < fromTop && fromBottom + r.height < gr.height * 0.55) {
          pad.bottom = Math.max(pad.bottom, Math.round(gr.bottom - r.top + gap));
          continue;
        }
      }
      if (fromLeft <= fromRight) pad.left = Math.max(pad.left, Math.round(r.right - gr.left + gap));
      else pad.right = Math.max(pad.right, Math.round(gr.right - r.left + gap));
    }
    var maxX = Math.round(gr.width * 0.46);
    var maxY = Math.round(gr.height * 0.42);
    pad.left = Math.min(pad.left, maxX);
    pad.right = Math.min(pad.right, maxX);
    pad.top = Math.min(pad.top, maxY);
    pad.bottom = Math.min(pad.bottom, maxY);
    globe.style.boxSizing = "border-box";
    globe.style.padding = pad.top + "px " + pad.right + "px " + pad.bottom + "px " + pad.left + "px";
    if (v && typeof v.resize === "function") v.resize();
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
    applyCesiumInsets();
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
      applyCesiumInsets();
    }).observe(hud, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", applyCesiumInsets);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", applyCesiumInsets);
    if (window.ResizeObserver) new ResizeObserver(applyCesiumInsets).observe(hud);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
