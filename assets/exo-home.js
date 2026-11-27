/* EXOpace home: live status from real sources only, the install control,
   and the account chip. No counts are ever made up here. */
(function () {
  "use strict";

  function $(id) { return document.getElementById(id); }
  function chip(id, tone, text) {
    var el = $(id);
    if (!el) return;
    el.setAttribute("data-tone", tone);
    var b = el.querySelector("b");
    if (b) b.textContent = text;
  }
  function cell(id, tone, text) {
    var el = $(id);
    if (!el) return;
    el.setAttribute("data-tone", tone);
    el.textContent = text;
  }

  // Cams edge: same contract System reads.
  var ctrl = typeof AbortController === "function" ? new AbortController() : null;
  var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 8000);
  fetch("https://cams.exopace.net/api/health", { cache: "no-store", signal: ctrl ? ctrl.signal : undefined })
    .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status)); })
    .then(function (body) {
      clearTimeout(timer);
      var up = body && body.ok === true;
      var full = up && !!body.mongo;
      chip("hm-st-cams", full ? "ok" : "warn", full ? "Cams online" : "Cams degraded");
      cell("hm-lv-cams", full ? "ok" : "warn", full ? "ONLINE" : "DEGRADED");
    })
    .catch(function () {
      clearTimeout(timer);
      chip("hm-st-cams", "off", "Cams unreachable");
      cell("hm-lv-cams", "off", "UNREACHABLE");
    });

  // Account: shared shell probe (cached per session).
  function paintAcct(state) {
    var btn = $("hm-signin");
    if (state === "in") {
      chip("hm-st-acct", "ok", "Signed in");
      cell("hm-lv-acct", "ok", "SIGNED IN");
      if (btn) btn.textContent = "Signed in";
    } else if (state === "out") {
      chip("hm-st-acct", "off", "Signed out");
      cell("hm-lv-acct", "off", "SIGNED OUT");
      if (btn) btn.textContent = "Sign in";
    } else {
      chip("hm-st-acct", "off", "Account unknown");
      cell("hm-lv-acct", "off", "CAN'T REACH CAMS");
      if (btn) btn.textContent = "Account";
    }
  }
  if (window.EXO_LAYOUT && window.EXO_LAYOUT.probeMe) {
    window.EXO_LAYOUT.probeMe().then(paintAcct);
    document.addEventListener("exo:me", function (e) { paintAcct(e.detail && e.detail.state); });
  }

  // This browser.
  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }
  function paintNet() {
    var on = navigator.onLine !== false;
    var mode = standalone() ? "installed" : "browser";
    chip("hm-st-net", on ? "ok" : "off", (on ? "Online" : "Offline") + (mode === "installed" ? " · installed" : ""));
    cell("hm-lv-net", on ? "ok" : "off", (on ? "ONLINE" : "OFFLINE") + " · " + mode.toUpperCase());
  }
  paintNet();
  window.addEventListener("online", paintNet);
  window.addEventListener("offline", paintNet);

  // Clock: this device's own clock in UTC.
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function tickClock() {
    var d = new Date();
    cell("hm-lv-utc", "ok", pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + " UTC");
  }
  tickClock();
  setInterval(tickClock, 1000);

  // Install: one-tap when the browser offers it, honest instructions otherwise.
  var install = $("hm-install");
  var sheet = $("hm-install-sheet");
  var deferred = null;
  function closeSheet() { if (sheet) sheet.hidden = true; if (install) install.focus(); }
  function openSheet() { if (!sheet) return; sheet.hidden = false; var c = $("hm-install-close"); if (c) c.focus(); }
  if (install) {
    if (standalone()) install.hidden = true;
    window.addEventListener("beforeinstallprompt", function (e) {
      e.preventDefault();
      deferred = e;
    });
    window.addEventListener("appinstalled", function () {
      deferred = null;
      install.hidden = true;
      paintNet();
    });
    install.addEventListener("click", function (e) {
      e.preventDefault();
      if (deferred) {
        var d = deferred;
        deferred = null;
        install.setAttribute("data-path", "prompt");
        d.prompt();
        if (d.userChoice) d.userChoice.then(function (r) { if (r && r.outcome === "accepted") install.hidden = true; }).catch(function () {});
        return;
      }
      install.setAttribute("data-path", "sheet");
      openSheet();
    });
  }
  if (sheet) {
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });
    var close = $("hm-install-close");
    if (close) close.addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !sheet.hidden) closeSheet(); });
  }

  // Service worker registration and update checks live in exo-layout.js.
})();
