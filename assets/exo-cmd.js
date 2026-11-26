/* Keyboard jump list. Ctrl/Cmd+K, or / when focus is not in a field. */
(function loadExoLayout() {
  if (!document.querySelector("link[href*='exo-tokens.css'], link[data-exo-tokens], style[data-exo-tokens]")) {
    var t = document.createElement("link");
    t.rel = "stylesheet";
    t.href = "/assets/exo-tokens.css";
    t.setAttribute("data-exo-tokens", "1");
    (document.head || document.documentElement).appendChild(t);
  }
  if (!document.querySelector("link[data-exo-layout]")) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = "/assets/exo-layout.css?v=6";
    l.setAttribute("data-exo-layout", "1");
    (document.head || document.documentElement).appendChild(l);
  }
  if (window.EXO_LAYOUT || document.querySelector("script[data-exo-layout]")) return;
  var s = document.createElement("script");
  s.src = "/assets/exo-layout.js?v=2";
  s.async = true;
  s.setAttribute("data-exo-layout", "1");
  (document.head || document.documentElement).appendChild(s);
})();
(function () {
  var TABS = [
    ["Listen", "listen"], ["Band", "band"], ["Live", "watch"], ["Scan", "scan"],
    ["Maps", "maps"], ["Replays", "replay"], ["Decode", "decode"], ["Devices", "devices"],
    ["Events", "events"], ["Clips", "clips"], ["Voice", "voice"], ["Bluetooth", "ble"],
    ["WiFi", "wifi"], ["Cam", "camera"], ["Sentinel", "sentinel"], ["Weekly", "weekly"],
    ["Tools", "tools"]
  ];
  var SURFACES = [
    ["Mission", "/mission/"],
    ["Radio", "/radio/"],
    ["Mesh", "/mesh/"],
    ["Field Maps", "/maps/"],
    ["Cameras", "/cameras/"],
    ["Sentinel", "/sentinel/"],
    ["Cams", "https://cams.exopace.net/"]
  ];
  var root, input, list, lastFocus;

  function typing(target) {
    if (!target || !target.closest) return false;
    return !!target.closest("input, textarea, select, [contenteditable='true']");
  }

  function items() {
    var out = SURFACES.map(function (row) {
      return { label: row[0], hint: "surface", run: function () { location.assign(row[1]); } };
    });
    TABS.forEach(function (row) {
      out.push({
        label: "> " + row[0],
        hint: "radio",
        run: function () {
          if (typeof window.showTab === "function" && document.getElementById(row[1])) window.showTab(row[1]);
          else location.assign("/radio/#" + row[1]);
        }
      });
    });
    out.push({ label: "Lock ISS 25544", hint: "mission", run: function () { location.assign("/mission/?lock=25544"); } });
    out.push({ label: "Follow ISS", hint: "mission", run: function () { location.assign("/mission/?lock=25544&cam=follow"); } });
    out.push({
      label: "Orbital passes",
      hint: "radio",
      run: function () {
        if (typeof window.showTab === "function" && document.getElementById("decode")) window.showTab("decode");
        else location.assign("/radio/#decode");
      }
    });
    out.push({
      label: "Acoustic waterfall",
      hint: "radio",
      run: function () {
        if (typeof window.showTab === "function" && document.getElementById("watch")) {
          window.showTab("watch");
          var ears = document.getElementById("exo-audio");
          if (ears && ears.scrollIntoView) ears.scrollIntoView({ block: "nearest" });
        } else location.assign("/radio/#watch");
      }
    });
    out.push({ label: "Link profiler", hint: "maps", run: function () { location.assign("/maps/#exo-link"); } });
    out.push({ label: "Lock Hubble 20580", hint: "mission", run: function () { location.assign("/mission/?lock=20580"); } });
    out.push({
      label: "Copy page URL",
      hint: "clipboard",
      run: function () { copy(location.href, "URL COPIED"); }
    });
    out.push({
      label: "Copy coordinates",
      hint: "clipboard",
      run: function () {
        var fix = coordText();
        if (!fix) { toast("NO FIX"); return; }
        copy(fix, "COORDINATES COPIED");
      }
    });
    return out;
  }

  function coordText() {
    var mgrs = document.getElementById("fm-mgrs");
    var text = mgrs ? (mgrs.textContent || "").trim() : "";
    if (text && text !== "—" && text !== "POLAR") return text;
    return "";
  }

  function copy(text, okMsg) {
    var done = function () { toast(okMsg); close(); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () { fallback(text, done); });
    } else fallback(text, done);
  }

  function fallback(text, done) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); done(); } catch (err) { toast("COPY FAILED"); }
    area.remove();
  }

  function toast(message) {
    var el = document.getElementById("exo-cmd-toast");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, 2200);
  }

  function ensure() {
    if (root) return;
    root = document.createElement("div");
    root.className = "exo-cmd";
    root.hidden = true;
    root.innerHTML = ''
      + '<div class="exo-cmd__panel" role="dialog" aria-modal="true" aria-label="Jump">'
      + '<input class="exo-cmd__q" type="search" aria-label="Jump to a surface or command" placeholder="Jump, tab, lock, or copy" autocomplete="off">'
      + '<div class="exo-cmd__list" role="listbox"></div>'
      + '</div>'
      + '<p class="exo-cmd__toast" id="exo-cmd-toast" role="status" hidden></p>';
    document.body.appendChild(root);
    input = root.querySelector(".exo-cmd__q");
    list = root.querySelector(".exo-cmd__list");
    root.addEventListener("click", function (e) { if (e.target === root) close(); });
    input.addEventListener("input", draw);
    input.addEventListener("keydown", onInputKey);
  }

  function filtered() {
    var q = (input.value || "").trim().toLowerCase();
    return items().filter(function (item) {
      if (!q) return true;
      return (item.label + " " + item.hint).toLowerCase().indexOf(q) !== -1;
    });
  }

  function draw() {
    var rows = filtered();
    list.innerHTML = "";
    rows.forEach(function (item, index) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "exo-cmd__item" + (index === 0 ? " is-on" : "");
      btn.setAttribute("role", "option");
      btn.dataset.index = String(index);
      btn.innerHTML = '<span>' + escapeHtml(item.label) + '</span><small>' + escapeHtml(item.hint) + '</small>';
      btn.addEventListener("click", function () { item.run(); });
      list.appendChild(btn);
    });
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "exo-cmd__empty";
      empty.textContent = "NO MATCH";
      list.appendChild(empty);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function current() {
    return list.querySelector(".exo-cmd__item.is-on");
  }

  function move(step) {
    var buttons = Array.prototype.slice.call(list.querySelectorAll(".exo-cmd__item"));
    if (!buttons.length) return;
    var index = buttons.indexOf(current());
    if (index < 0) index = 0;
    index = (index + step + buttons.length) % buttons.length;
    buttons.forEach(function (btn, i) { btn.classList.toggle("is-on", i === index); });
    buttons[index].scrollIntoView({ block: "nearest" });
  }

  function onInputKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter") {
      e.preventDefault();
      var rows = filtered();
      var on = current();
      var index = on ? Number(on.dataset.index) : 0;
      if (rows[index]) { rows[index].run(); return; }
      var query = input.value.trim();
      var decide = globalThis.EXO && globalThis.EXO.decide;
      var routes = globalThis.EXO && globalThis.EXO.routes;
      if (!decide || !query) return;
      decide("choice", { query: query, surface: location.pathname }).then(function (res) {
        var row = res && res.answers && res.answers.route;
        if (!row || res.source === "fallback" || !(row.answer_confidence >= 0.55)) return;
        var path = routes && routes[row.choice];
        if (path) location.assign(path);
      });
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }

  function open() {
    ensure();
    lastFocus = document.activeElement;
    root.hidden = false;
    document.documentElement.dataset.exoCmd = "open";
    input.value = "";
    draw();
    input.focus();
  }

  function close() {
    if (!root || root.hidden) return;
    root.hidden = true;
    delete document.documentElement.dataset.exoCmd;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  document.addEventListener("keydown", function (e) {
    var key = e.key;
    if (key === "Escape" && root && !root.hidden) { e.preventDefault(); close(); return; }
    var chord = (e.metaKey || e.ctrlKey) && (key === "k" || key === "K");
    var slash = key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target);
    if (!chord && !slash) return;
    e.preventDefault();
    if (root && !root.hidden) close();
    else open();
  });
})();
