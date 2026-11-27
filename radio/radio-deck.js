/* Radio layout helper. On phones the thumb dock carries the active tool's primary
   control. The dock button only clicks the real in-card control and copies its
   label/disabled state; it never fakes a result. */
(function () {
  "use strict";
  var PRIMARY = {
    listen: "#rg-hero-connect",
    band: "#band button[onclick^='quickScan']",
    watch: "#watch .exo-usb-connect",
    scan: "#scan button[onclick^='scanStart']",
    decode: "#decode .exo-usb-connect",
    ble: "#ble button[onclick=\"bleCmd('start')\"]",
    camera: "#camera button[onclick^='camStart']",
    tools: "#tools button[onclick=\"mon('start')\"]"
  };
  var dock = document.getElementById("rg-dock");
  var proxy = document.getElementById("rg-primary");
  if (!dock || !proxy) return;
  var src = null, obs = null;
  var phone = window.matchMedia("(max-width: 719.98px) and (min-height: 501px)");

  function sync() {
    if (!src) return;
    proxy.textContent = (src.textContent || "").trim();
    proxy.disabled = !!src.disabled;
    proxy.dataset.tone = /\bstop\b/.test(src.className) ? "stop" : "";
  }
  function bind() {
    var on = document.querySelector("main#exo-main > section.on");
    var sel = on && PRIMARY[on.id];
    var next = sel ? document.querySelector(sel) : null;
    if (next === src) { sync(); return; }
    if (src) src.classList.remove("rg-docked");
    if (obs) { obs.disconnect(); obs = null; }
    src = next;
    proxy.hidden = !src;
    dock.classList.toggle("has-primary", !!src);
    if (!src) return;
    src.classList.add("rg-docked");
    obs = new MutationObserver(sync);
    obs.observe(src, { attributes: true, childList: true, characterData: true, subtree: true });
    sync();
  }
  proxy.addEventListener("click", function () {
    if (src && !src.disabled) src.click();
  });
  function watch() {
    var main = document.getElementById("exo-main");
    if (!main) return;
    new MutationObserver(bind).observe(main, { attributes: true, attributeFilter: ["class"], subtree: false, childList: false });
    main.querySelectorAll(":scope > section").forEach(function (s) {
      new MutationObserver(bind).observe(s, { attributes: true, attributeFilter: ["class"] });
    });
    bind();
  }
  if (phone.addEventListener) phone.addEventListener("change", bind);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
})();

/* Late-mounting radio modules (PiP, passive radar, codec panels) append to <body>.
   Re-home them into the Live tab's Instruments card so they never float loose. */
(function () {
  "use strict";
  function home() {
    var card = document.getElementById("rg-modules");
    if (!card) return;
    var moved = false;
    Array.prototype.slice.call(document.body.children).forEach(function (n) {
      if (n.tagName === "SCRIPT" || n.id === "toast" || n.id === "rg-dock" || n.id === "rg-scroll") return;
      if (n.matches(".exo-wave, .exo-wave-btn, #exo-radar-map")) { card.appendChild(n); moved = true; }
    });
    if (moved) card.dataset.filled = "1";
    sync();
  }
  /* The instrument readouts only mean something with a receiver attached;
     keep the card out of the way until the USB SDR is connected. */
  function sync() {
    var card = document.getElementById("rg-modules");
    var st = document.querySelector("#watch .exo-usb-status");
    if (!card) return;
    var live = !!st && !/NO USB DEVICE|NO WEBUSB|UNSUPPORTED|DISCONNECTED|ERROR/i.test(st.textContent || "");
    card.hidden = !(card.dataset.filled && live);
  }
  setInterval(sync, 1500);
  new MutationObserver(home).observe(document.body, { childList: true });
  document.addEventListener("DOMContentLoaded", home);
  window.addEventListener("load", home);
})();


/* Instrument player for the page's <audio> elements. Same nodes the tuner,
   scanner and decoder already pause, load, and attach to — only the chrome
   is replaced. */
(function () {
  "use strict";
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  var PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  var VOL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm11.5 3a3.5 3.5 0 0 0-1.8-3.1v6.2A3.5 3.5 0 0 0 15.5 12zm1.8-7v2a6 6 0 0 1 0 10v2a8 8 0 0 0 0-14z"/></svg>';
  var MUTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4zm12.6 1.4 1.4-1.4 1.4 1.4 1.4-1.4 1.4 1.4-1.4 1.4 1.4 1.4-1.4 1.4-1.4-1.4-1.4 1.4-1.4-1.4 1.4-1.4-1.4-1.4z"/></svg>';

  function fmt(t) {
    if (!isFinite(t) || t < 0) return "0:00";
    t = Math.floor(t);
    var m = Math.floor(t / 60), s = t % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function wrap(audio) {
    if (audio.dataset.rgPlayer === "1") return;
    audio.dataset.rgPlayer = "1";
    audio.classList.add("rg-player-src");
    audio.removeAttribute("controls");
    audio.setAttribute("aria-hidden", "true");
    audio.tabIndex = -1;

    var ui = document.createElement("div");
    ui.className = "rg-player";
    ui.setAttribute("role", "group");
    ui.setAttribute("aria-label", audio.getAttribute("aria-label") || "Audio player");
    ui.innerHTML =
      '<button type="button" class="rg-player-play" aria-label="Play" disabled>' + PLAY + "</button>" +
      '<div class="rg-player-scrub">' +
        '<span class="rg-player-time">0:00</span>' +
        '<input type="range" class="rg-player-seek" min="0" max="1000" value="0" step="1" aria-label="Seek" disabled>' +
        '<span class="rg-player-dur">0:00</span>' +
      "</div>" +
      '<div class="rg-player-volwrap">' +
        '<button type="button" class="rg-player-mute" aria-label="Mute" aria-pressed="false">' + VOL + "</button>" +
        '<input type="range" class="rg-player-vol" min="0" max="100" value="' + Math.round((audio.volume || 1) * 100) + '" step="1" aria-label="Volume">' +
      "</div>";
    audio.parentNode.insertBefore(ui, audio.nextSibling);

    var play = ui.querySelector(".rg-player-play");
    var seek = ui.querySelector(".rg-player-seek");
    var time = ui.querySelector(".rg-player-time");
    var dur = ui.querySelector(".rg-player-dur");
    var mute = ui.querySelector(".rg-player-mute");
    var vol = ui.querySelector(".rg-player-vol");
    var seeking = false;

    function hasSrc() {
      return !!(audio.getAttribute("src") || (audio.currentSrc && audio.currentSrc !== audio.baseURI));
    }
    function duration() {
      var d = audio.duration;
      return isFinite(d) && d > 0 ? d : 0;
    }
    function sync() {
      var d = duration();
      var live = hasSrc() && !d;
      var ready = hasSrc();
      play.disabled = !ready;
      play.innerHTML = audio.paused ? PLAY : PAUSE;
      play.setAttribute("aria-label", audio.paused ? "Play" : "Pause");
      time.textContent = fmt(audio.currentTime || 0);
      dur.textContent = live ? "LIVE" : fmt(d);
      seek.disabled = !ready || live;
      if (!seeking) {
        seek.value = !d ? 0 : String(Math.round((audio.currentTime / d) * 1000));
      }
      var muted = !!audio.muted || audio.volume === 0;
      mute.innerHTML = muted ? MUTE : VOL;
      mute.setAttribute("aria-label", muted ? "Unmute" : "Mute");
      mute.setAttribute("aria-pressed", muted ? "true" : "false");
      if (document.activeElement !== vol) vol.value = String(Math.round((muted ? 0 : audio.volume) * 100));
    }

    play.addEventListener("click", function () {
      if (play.disabled) return;
      if (audio.paused) audio.play().catch(function () { sync(); });
      else audio.pause();
    });
    seek.addEventListener("pointerdown", function () { seeking = true; });
    seek.addEventListener("pointerup", function () { seeking = false; });
    seek.addEventListener("input", function () {
      var d = duration();
      if (!d) return;
      audio.currentTime = (Number(seek.value) / 1000) * d;
      time.textContent = fmt(audio.currentTime);
    });
    mute.addEventListener("click", function () {
      audio.muted = !audio.muted;
      sync();
    });
    vol.addEventListener("input", function () {
      var n = Number(vol.value) / 100;
      audio.volume = n;
      if (n > 0) audio.muted = false;
      sync();
    });
    ui.addEventListener("keydown", function (e) {
      if (e.target === seek || e.target === vol) return;
      var d = duration();
      if (e.code === "Space" && e.target === play) return;
      if (e.key === "ArrowRight" && d) { e.preventDefault(); audio.currentTime = Math.min(d, (audio.currentTime || 0) + 5); }
      if (e.key === "ArrowLeft" && d) { e.preventDefault(); audio.currentTime = Math.max(0, (audio.currentTime || 0) - 5); }
      if (e.key === "ArrowUp") { e.preventDefault(); audio.volume = Math.min(1, audio.volume + 0.05); audio.muted = false; }
      if (e.key === "ArrowDown") { e.preventDefault(); audio.volume = Math.max(0, audio.volume - 0.05); }
      sync();
    });
    ["play", "pause", "ended", "emptied", "loadedmetadata", "durationchange", "timeupdate", "volumechange", "canplay"].forEach(function (ev) {
      audio.addEventListener(ev, sync);
    });
    new MutationObserver(sync).observe(audio, { attributes: true, attributeFilter: ["src"] });
    sync();
  }

  function boot() {
    document.querySelectorAll("audio").forEach(wrap);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();

/* The header line mirrors the receiver state in plain words, so it never claims
   "no receiver" while a USB SDR is streaming. */
(function () {
  "use strict";
  var sub = document.getElementById("sub");
  var st = document.querySelector("#watch .exo-usb-status");
  if (!sub || !st || !window.MutationObserver) return;
  var IDLE = sub.textContent;
  function sync() {
    var t = (st.textContent || "").trim();
    sub.textContent = /^Receiving/.test(t) ? "USB SDR connected. " + t + "." : IDLE;
  }
  new MutationObserver(sync).observe(st, { childList: true, characterData: true, subtree: true });
})();
