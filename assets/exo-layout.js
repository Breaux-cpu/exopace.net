/* Shared shell helpers: Mission status pill, sheets, dock measure, PWA updates. Idempotent. */
(function (global) {
  if (global.EXO_LAYOUT) return;

  function assetUrl(name) {
    var script = document.querySelector("script[src*='exo-layout.js']");
    if (script && script.src) {
      try { return new URL(name, script.src).href; } catch (e) {}
    }
    return "/assets/" + name;
  }

  function hasStylesheet(fragment) {
    var nodes = document.querySelectorAll("link[rel='stylesheet'], style");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var href = el.getAttribute("href") || "";
      if (href.indexOf(fragment) !== -1) return true;
    }
    return false;
  }

  function injectLink(href, attr) {
    var l = document.createElement("link");
    l.rel = "stylesheet";
    l.href = href;
    l.setAttribute(attr, "1");
    (document.head || document.documentElement).appendChild(l);
  }

  function ensureStyles() {
    if (!hasStylesheet("exo-tokens.css") && !document.querySelector("link[data-exo-tokens], style[data-exo-tokens]")) {
      injectLink(assetUrl("exo-tokens.css"), "data-exo-tokens");
    }
    if (!hasStylesheet("exo-layout.css") && !document.querySelector("link[data-exo-layout], style[data-exo-layout]")) {
      injectLink(assetUrl("exo-layout.css?v=8"), "data-exo-layout");
    }
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

  function publishDockHeight() {
    var root = document.documentElement;
    var actions = document.querySelector(".exo-pill-actions");
    var height = 0;
    if (actions && !document.querySelector("#composer")) {
      var st = window.getComputedStyle(actions);
      if (st.position === "fixed" && st.display !== "none" && st.visibility !== "hidden") {
        height = Math.round(actions.getBoundingClientRect().height);
      }
    }
    var value = height + "px";
    root.style.setProperty("--exo-dock-real", value);
    if (document.body) document.body.style.setProperty("--exo-dock-real", value);
    return height;
  }

  var dockFrame = 0;
  function scheduleDockPublish() {
    if (dockFrame) cancelAnimationFrame(dockFrame);
    dockFrame = requestAnimationFrame(function () {
      dockFrame = 0;
      publishDockHeight();
    });
  }

  function observeDock() {
    if (observeDock._bound) return;
    observeDock._bound = true;
    window.addEventListener("resize", scheduleDockPublish);
    window.addEventListener("orientationchange", scheduleDockPublish);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", scheduleDockPublish);
    }
    if (typeof ResizeObserver === "function") {
      observeDock._ro = new ResizeObserver(scheduleDockPublish);
      var actions = document.querySelector(".exo-pill-actions");
      if (actions) observeDock._ro.observe(actions);
    }
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
    if (sheet.id && location.hash !== "#" + sheet.id) {
      try { history.replaceState(null, "", "#" + sheet.id); } catch (e) {}
    }
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
    if (target.id && location.hash === "#" + target.id) {
      try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    }
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


  var SITES = [
    { href: "/", label: "Home", match: /^\/$|^\/index\.html$/ },
    { href: "/mission/", label: "Mission", match: /^\/mission\/|^\/lock\// },
    { href: "/radio/", label: "Radio", match: /^\/radio\// },
    { href: "/mesh/", label: "Mesh", match: /^\/mesh\// },
    { href: "/maps/", label: "Field Maps", match: /^\/maps\// },
    { href: "https://cams.exopace.net/map", label: "Cameras", match: /$^/ },
    { href: "/sentinel/", label: "Sentinel", match: /^\/sentinel\// },
    { href: "/system/", label: "System", match: /^\/system\// }
  ];

  function ensureSites() {
    var nav = document.querySelector("nav.exo-sites");
    if (!nav) return nav;
    var path = location.pathname || "/";
    nav.setAttribute("aria-label", "EXOpace surfaces");
    nav.innerHTML = SITES.map(function (s) {
      var cur = s.match.test(path) ? ' aria-current="page"' : "";
      return '<a href="' + s.href + '"' + cur + ">" + s.label + "</a>";
    }).join("");
    hintSites(nav);
    return nav;
  }

  /* Phones: bring the current surface into view and mark which edges have
     more links, so the clipped nav reads as scrollable (exo-modern.css). */
  function hintSites(nav) {
    if (nav._exoHint) return;
    nav._exoHint = true;
    function edges() {
      var more = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4;
      nav.classList.toggle("exo-sites-more", more);
      nav.classList.toggle("exo-sites-start", nav.scrollLeft > 4);
    }
    function centre() {
      var cur = nav.querySelector('[aria-current="page"]');
      if (cur && nav.scrollWidth > nav.clientWidth + 4) {
        var box = nav.getBoundingClientRect();
        var row = cur.getBoundingClientRect();
        if (row.right > box.right - 24 || row.left < box.left) {
          nav.scrollLeft += row.left - box.left - (box.width - row.width) / 2;
        }
      }
      edges();
    }
    nav.addEventListener("scroll", edges, { passive: true });
    global.addEventListener("resize", edges);
    if (document.readyState === "complete") centre();
    else global.addEventListener("load", centre);
    edges();
  }

  /* Signed-in probe. The sign-in itself lives on cams (Google). One answer per
     browser session: sessionStorage keeps it so every page does not re-ask.
     States: "in" | "out" | "error". Never reads an email or token. */
  var ME_URL = "https://cams.exopace.net/api/me";
  var ME_KEY = "exo-me-v1";
  var mePending = null;

  function readMe() {
    try {
      var raw = sessionStorage.getItem(ME_KEY);
      if (!raw) return null;
      var row = JSON.parse(raw);
      return row && (row.state === "in" || row.state === "out") ? row : null;
    } catch (e) { return null; }
  }

  function writeMe(state) {
    try {
      if (state === "in" || state === "out") sessionStorage.setItem(ME_KEY, JSON.stringify({ state: state, at: Date.now() }));
      else sessionStorage.removeItem(ME_KEY);
    } catch (e) {}
  }

  function probeMe(opts) {
    var fresh = !!(opts && opts.fresh);
    if (!fresh) {
      var cached = readMe();
      if (cached) return Promise.resolve(cached.state);
      if (mePending) return mePending;
    }
    var ctrl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
    mePending = fetch(ME_URL, { credentials: "include", cache: "no-store", mode: "cors", signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        if (res.status === 401 || res.status === 403) return "out";
        if (!res.ok) return "error";
        return res.json().then(function (body) {
          if (!body || typeof body !== "object" || typeof body.signedIn !== "boolean") return "error";
          return body.signedIn ? "in" : "out";
        }, function () { return "error"; });
      }, function () { return "error"; })
      .then(function (state) {
        clearTimeout(timer);
        mePending = null;
        writeMe(state);
        paintAccount(state);
        try { document.dispatchEvent(new CustomEvent("exo:me", { detail: { state: state } })); } catch (e) {}
        return state;
      });
    return mePending;
  }

  function ensureAccount() {
    var bar = document.querySelector("header.exo-bar");
    if (!bar) return null;
    var link = bar.querySelector("a.exo-acct");
    if (!link) {
      link = document.createElement("a");
      link.className = "exo-acct";
      link.href = "/signin/";
      link.setAttribute("data-state", "checking");
      link.innerHTML = '<span class="exo-acct-dot" aria-hidden="true"></span><span class="exo-acct-label">Account</span>';
      bar.appendChild(link);
    }
    if (/^\/signin\//.test(location.pathname || "")) link.setAttribute("aria-current", "page");
    return link;
  }

  function paintAccount(state) {
    var link = document.querySelector("header.exo-bar a.exo-acct");
    if (!link) return;
    var label = link.querySelector(".exo-acct-label");
    var text = state === "in" ? "Signed in" : state === "out" ? "Sign in" : state === "error" ? "Account" : "Account";
    link.setAttribute("data-state", state || "checking");
    link.setAttribute("aria-label", state === "in" ? "Signed in. Open account" : state === "out" ? "Sign in" : "Account status");
    if (label) label.textContent = text;
  }

  function initAccount() {
    if (!ensureAccount()) return;
    var cached = readMe();
    paintAccount(cached ? cached.state : "checking");
    if (!cached) probeMe();
  }

  function openHashSheet() {
    var id = (location.hash || "").replace(/^#/, "");
    if (!id) return;
    var sheet = document.getElementById(id);
    if (sheet && (sheet.classList.contains("exo-sheet") || sheet.getAttribute("data-exo-sheet") != null)) {
      openSheet(sheet);
    }
  }


  /* PWA: register the scope's worker, poll for updates, and reload once
     when a new worker claims the page — unless the operator is mid-action. */
  var SW_RELOAD_KEY = "exo-sw-reloaded-at";
  var SW_POLL_MS = 15 * 60 * 1000;
  var MAP_DRAG_MS = 4000;
  var FRESH_MS = 8000;
  var LOOP_GUARD_MS = 30000;

  function swScriptForPath(path) {
    if (/^\/mesh(\/|$)/.test(path)) return "/mesh/sw.js";
    if (/^\/maps(\/|$)/.test(path)) return "/maps/sw.js";
    if (/^\/radio(\/|$)/.test(path)) return "";
    return "/sw.js";
  }

  function recentlyReloaded() {
    try {
      var at = Number(sessionStorage.getItem(SW_RELOAD_KEY) || 0);
      return at > 0 && Date.now() - at < LOOP_GUARD_MS;
    } catch (e) {
      return false;
    }
  }

  function markReload() {
    try { sessionStorage.setItem(SW_RELOAD_KEY, String(Date.now())); } catch (e) {}
  }

  function reloadForUpdate() {
    if (recentlyReloaded()) return;
    markReload();
    location.reload();
  }

  var lastMapDrag = 0;
  function trackMapDrag(event) {
    if (!event || !event.target || !event.target.closest) return;
    if (event.type === "pointermove" && !(event.buttons || event.pressure)) return;
    if (event.target.closest("#globe, #map, .fm-body, .leaflet-container, .maplibregl-map, .cesium-viewer, .cesium-widget, canvas")) {
      lastMapDrag = Date.now();
    }
  }

  function missionLockActive() {
    try {
      var row = global.EXO && global.EXO.bus && typeof global.EXO.bus.get === "function" && global.EXO.bus.get();
      if (row && (row.label || row.norad || (row.kind && row.kind !== "none"))) return true;
    } catch (e) {}
    var badge = document.getElementById("exo-pill-target");
    if (!badge) return false;
    var text = (badge.textContent || "").trim();
    return text !== "" && text !== "NO TARGET";
  }

  function pageIsBusy() {
    var ae = document.activeElement;
    if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT" || ae.isContentEditable)) return true;
    if (missionLockActive()) return true;
    if (Date.now() - lastMapDrag < MAP_DRAG_MS) return true;
    return false;
  }

  function showUpdateToast() {
    if (document.querySelector(".exo-update-toast")) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "exo-update-toast";
    btn.textContent = "Updated, tap to refresh";
    btn.addEventListener("click", function () { reloadForUpdate(); });
    (document.body || document.documentElement).appendChild(btn);
  }

  function initServiceWorker() {
    if (initServiceWorker._bound) return;
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:") return;
    var script = swScriptForPath(location.pathname || "/");
    if (!script) return;
    initServiceWorker._bound = true;

    var loadedAt = Date.now();
    var hadController = !!navigator.serviceWorker.controller;
    var pending = false;

    function applyUpdate() {
      if (recentlyReloaded()) return;
      var hidden = document.visibilityState === "hidden";
      var fresh = Date.now() - loadedAt < FRESH_MS;
      if (hidden || fresh || !pageIsBusy()) {
        pending = false;
        reloadForUpdate();
        return;
      }
      pending = true;
      showUpdateToast();
    }

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (!hadController) {
        hadController = true;
        return;
      }
      applyUpdate();
    });

    document.addEventListener("pointerdown", trackMapDrag, true);
    document.addEventListener("pointermove", trackMapDrag, true);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && pending) {
        pending = false;
        reloadForUpdate();
      }
    });

    navigator.serviceWorker.register(script).then(function (reg) {
      function check() { return reg.update().catch(function () {}); }
      check();
      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") check();
      });
      setInterval(check, SW_POLL_MS);
    }).catch(function () {});
  }

  function init() {
    ensureStyles();
    ensureSites();
    initAccount();
    initServiceWorker();
    wrapPill(document);
    observeDock();
    publishDockHeight();
    openHashSheet();
    window.addEventListener("hashchange", openHashSheet);
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
  }

  global.EXO_LAYOUT = {
    sites: SITES,
    ensureSites: ensureSites,
    probeMe: probeMe,
    readMe: readMe,
    paintAccount: paintAccount,
    wrapPill: wrapPill,
    openSheet: openSheet,
    closeSheet: closeSheet,
    toggleSheet: toggleSheet,
    publishDockHeight: publishDockHeight,
    init: init
  };

  ensureStyles();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(window);
