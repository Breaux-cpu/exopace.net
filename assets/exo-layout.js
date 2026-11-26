/* Shared shell helpers: wrap the status pill, drive sheets, measure the dock. Idempotent. */
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
      injectLink(assetUrl("exo-layout.css?v=4"), "data-exo-layout");
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
    { href: "/mission/", label: "Mission", match: /^\/$|^\/index\.html$|^\/mission\/|^\/lock\// },
    { href: "/radio/", label: "Radio", match: /^\/radio\// },
    { href: "/mesh/", label: "Mesh", match: /^\/mesh\// },
    { href: "/maps/", label: "Field Maps", match: /^\/maps\// },
    { href: "/cameras/", label: "Cameras", match: /^\/cameras\// },
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
    return nav;
  }

  function openHashSheet() {
    var id = (location.hash || "").replace(/^#/, "");
    if (!id) return;
    var sheet = document.getElementById(id);
    if (sheet && (sheet.classList.contains("exo-sheet") || sheet.getAttribute("data-exo-sheet") != null)) {
      openSheet(sheet);
    }
  }

  function init() {
    ensureStyles();
    ensureSites();
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
