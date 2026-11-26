(function () {
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function tabsOf(nav) {
    return Array.prototype.slice.call(nav.querySelectorAll(":scope > button"));
  }

  function panelId(btn) {
    if (btn.dataset.t) return btn.dataset.t;
    if (btn.dataset.s) return "scr-" + btn.dataset.s;
    return "";
  }

  function wantId() {
    var q = "";
    try { q = new URLSearchParams(location.search).get("tab") || ""; } catch (e) { q = ""; }
    var h = (location.hash || "").replace(/^#/, "");
    return q || h;
  }

  function activeOf(nav) {
    return nav.querySelector(":scope > button.on, :scope > button.active");
  }

  function fades(nav) {
    var max = nav.scrollWidth - nav.clientWidth;
    var left = max > 2 && nav.scrollLeft > 2;
    var right = max > 2 && nav.scrollLeft < max - 2;
    nav.style.setProperty("--exo-fade-l", left ? "52px" : "0px");
    nav.style.setProperty("--exo-fade-r", right ? "52px" : "0px");
  }

  function center(tab) {
    tab.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: reduce ? "auto" : "smooth"
    });
  }

  function wire(nav) {
    if (nav.dataset.exoTabsReady === "1") return;
    nav.dataset.exoTabsReady = "1";
    nav.setAttribute("role", "tablist");
    nav.setAttribute("aria-orientation", "horizontal");
    var lastId = "";
    var frame = 0;
    var primed = false;

    function sync() {
      var buttons = tabsOf(nav);
      var active = activeOf(nav);
      buttons.forEach(function (b, i) {
        var on = !!active && b === active;
        var pid = panelId(b);
        if (!b.id && pid) b.id = "exo-tab-" + pid;
        b.setAttribute("role", "tab");
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on || (!active && i === 0) ? 0 : -1;
        if (!pid) return;
        b.setAttribute("aria-controls", pid);
        var panel = document.getElementById(pid);
        if (!panel) return;
        panel.setAttribute("role", "tabpanel");
        if (b.id) panel.setAttribute("aria-labelledby", b.id);
      });
      fades(nav);
      if (!active) return;
      var id = active.id || panelId(active);
      var want = wantId();
      var pending = !primed && want && tabsOf(nav).some(function (b) {
        return b.dataset.t === want || b.dataset.s === want;
      }) && active.dataset.t !== want && active.dataset.s !== want;
      primed = true;
      if (pending || id === lastId) return;
      lastId = id;
      center(active);
    }

    function schedule() {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () { frame = 0; sync(); });
    }

    tabsOf(nav).forEach(function (b) {
      new MutationObserver(schedule).observe(b, { attributes: true, attributeFilter: ["class"] });
    });
    nav.addEventListener("scroll", function () { fades(nav); }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(function () { fades(nav); }).observe(nav);

    nav.addEventListener("wheel", function (e) {
      var max = nav.scrollWidth - nav.clientWidth;
      if (max <= 1 || !e.cancelable) return;
      var absX = Math.abs(e.deltaX);
      var absY = Math.abs(e.deltaY);
      if (absY <= absX) return;
      var dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= nav.clientWidth;
      if (nav.scrollLeft <= 0 && dy < 0) return;
      if (nav.scrollLeft >= max - 1 && dy > 0) return;
      e.preventDefault();
      nav.scrollLeft += dy;
    }, { passive: false });

    nav.addEventListener("keydown", function (e) {
      var move = { ArrowRight: 1, ArrowLeft: -1, Home: "home", End: "end" };
      if (!Object.prototype.hasOwnProperty.call(move, e.key)) return;
      var list = tabsOf(nav);
      var i = list.indexOf(document.activeElement);
      if (i < 0) return;
      var next;
      if (e.key === "Home") next = list[0];
      else if (e.key === "End") next = list[list.length - 1];
      else next = list[(i + move[e.key] + list.length) % list.length];
      e.preventDefault();
      next.focus();
      next.click();
    });

    sync();
  }

  function boot() {
    document.querySelectorAll("nav.exo-tabs").forEach(wire);
  }
  if (document.querySelector("nav.exo-tabs")) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
