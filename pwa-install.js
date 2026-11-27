/* EXOpace install control, shared by Home and Mission.
   - Install app: native prompt when the browser offers one, otherwise a sheet
     with steps for this browser. Hidden only when already running installed.
   - Download for Android: the signed APK on GitHub Releases ([data-exo-apk]).
   - Inside the Android app the launch URL carries ?apk=<versionCode>; if a newer
     APK exists, a small notice links to it. */
(function () {
  var APK = {
    versionCode: 2,
    version: "1.0.1",
    url: "https://github.com/Breaux-cpu/exopace.net/releases/download/android-v1.0.1/EXOpace-android-v1.0.1.apk",
  };
  window.EXO_APK = APK;

  var ua = navigator.userAgent || "";
  var isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var isAndroid = /Android/i.test(ua);
  var isSamsung = /SamsungBrowser/i.test(ua);
  var isFirefox = /Firefox|FxiOS/i.test(ua);

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      navigator.standalone === true;
  }

  // Android app shell version (TWA launch URL ?src=android&apk=N).
  var shellVer = 0;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get("src") === "android" && q.get("apk")) localStorage.setItem("exo-apk", q.get("apk"));
    shellVer = parseInt(localStorage.getItem("exo-apk") || "0", 10) || 0;
  } catch (e) {}
  if (!shellVer && document.referrer.indexOf("android-app://net.exopace.twa") === 0) shellVer = 1;
  var inApp = shellVer > 0 && standalone();

  // Download for Android links.
  document.querySelectorAll("[data-exo-apk]").forEach(function (a) {
    a.href = APK.url;
    a.setAttribute("download", "");
    var v = a.querySelector("[data-exo-apk-v]");
    if (v) v.textContent = "v" + APK.version;
    if (isIOS || inApp || standalone()) a.hidden = true;
  });

  function steps() {
    var all = [
      ["chrome-android", "Chrome on Android", "Tap menu ⋮ → <b>Add to Home screen</b> → <b>Install</b>."],
      ["samsung", "Samsung Internet (Galaxy, Fold)", "Tap the <b>install</b> icon in the address bar, or menu ≡ → <b>Add page to</b> → <b>Home screen</b>."],
      ["ios", "iPhone / iPad Safari", "Tap <b>Share</b> → <b>Add to Home Screen</b> → <b>Add</b>."],
      ["desktop", "Chrome or Edge on a computer", "Click the <b>install</b> icon at the right of the address bar, or menu → <b>Cast, save and share</b> → <b>Install page as app</b> (Edge: … → <b>Apps</b> → <b>Install this site as an app</b>)."],
    ];
    var mine = isIOS ? "ios" : isSamsung ? "samsung" : isAndroid ? "chrome-android" : "desktop";
    all.sort(function (a, b) { return (b[0] === mine) - (a[0] === mine); });
    return { list: all, mine: mine };
  }

  function fillSheet(listEl, whyEl) {
    var s = steps();
    listEl.innerHTML = s.list.map(function (r) {
      return '<li data-k="' + r[0] + '"' + (r[0] === s.mine ? ' data-here="1"' : "") + "><b>" + r[1] +
        (r[0] === s.mine ? " (this browser)" : "") + ":</b> " + r[2] + "</li>";
    }).join("");
    if (whyEl) {
      whyEl.textContent = isFirefox && !isAndroid
        ? "Firefox on a computer cannot install web apps. Use Chrome or Edge, or the steps below on your phone."
        : "This browser did not offer a one-tap install. Add EXOpace from the browser menu:";
    }
  }
  window.EXO_INSTALL_FILL = fillSheet;

  // Home has its own sheet in index.html; fill it with the same steps.
  var homeList = document.getElementById("hm-install-steps");
  if (homeList) fillSheet(homeList, document.getElementById("hm-install-why"));

  // Newer APK than the one running? One quiet notice, once per session.
  if (inApp && shellVer < APK.versionCode) {
    try {
      if (!sessionStorage.getItem("exo-apk-note")) {
        sessionStorage.setItem("exo-apk-note", "1");
        var n = document.createElement("a");
        n.id = "exo-apk-update";
        n.href = APK.url;
        n.textContent = "Android app v" + APK.version + " is available. Tap to download.";
        n.style.cssText = "position:fixed;left:50%;transform:translateX(-50%);bottom:calc(16px + env(safe-area-inset-bottom));z-index:90;background:#070c13;border:1px solid rgba(255,184,77,.55);color:#ffb84d;font:500 13px/1.3 'IBM Plex Sans',system-ui,sans-serif;padding:12px 16px;border-radius:12px;text-decoration:none;max-width:calc(100vw - 32px)";
        document.body.appendChild(n);
        setTimeout(function () { n.remove(); }, 12000);
      }
    } catch (e) {}
  }

  // Mission's floating chip. Home's button is handled by exo-home.js.
  var btn = document.getElementById("exo-install");
  if (!btn) return;
  if (standalone()) { btn.hidden = true; return; }
  btn.hidden = false;

  var deferred = null;
  var sheet = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener("appinstalled", function () { deferred = null; btn.hidden = true; });

  function buildSheet() {
    sheet = document.createElement("div");
    sheet.id = "exo-install-sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "exo-install-h");
    sheet.innerHTML =
      '<div class="exo-is-panel"><h2 id="exo-install-h">Install EXOpace</h2>' +
      '<p id="exo-install-why"></p><ol id="exo-install-steps"></ol>' +
      '<div class="exo-is-row">' +
      (isIOS ? "" : '<a class="exo-is-btn is-amber" id="exo-install-apk" href="' + APK.url + '" download>Download for Android (APK v' + APK.version + ")</a>") +
      '<button type="button" class="exo-is-btn" id="exo-install-close">Close</button></div></div>';
    var css = document.createElement("style");
    css.textContent =
      "#exo-install-sheet{position:fixed;inset:0;z-index:95;display:grid;place-items:end center;background:rgba(2,4,8,.6);backdrop-filter:blur(6px)}" +
      "#exo-install-sheet[hidden]{display:none}" +
      ".exo-is-panel{box-sizing:border-box;width:min(520px,calc(100% - 16px));margin:0 0 calc(12px + env(safe-area-inset-bottom));padding:22px 22px 18px;border:1px solid #1c2a33;border-radius:18px;background:#070c13;box-shadow:0 30px 80px rgba(0,0,0,.6);color:#e6f1f5;font-family:'IBM Plex Sans',system-ui,sans-serif;max-height:calc(100svh - 24px);overflow:auto}" +
      ".exo-is-panel h2{margin:0 0 10px;font:400 1.3rem/1.2 'IBM Plex Sans',system-ui,sans-serif}" +
      ".exo-is-panel p{margin:0 0 12px;color:#9fb0b4;font-size:13px;line-height:1.5}" +
      ".exo-is-panel ol{margin:0 0 16px;padding-left:1.2em;color:#c3d0d6;font-size:14px;line-height:1.6}" +
      ".exo-is-panel li[data-here]{color:#e6f1f5}" +
      ".exo-is-row{display:flex;flex-wrap:wrap;gap:10px}" +
      ".exo-is-btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid #1c2a33;border-radius:999px;background:transparent;color:#e6f1f5;font:500 13px/1 'IBM Plex Sans',system-ui,sans-serif;text-decoration:none;cursor:pointer;flex:1 1 160px}" +
      ".exo-is-btn.is-amber{border-color:rgba(255,184,77,.55);color:#ffb84d}" +
      ".exo-is-btn:focus-visible{outline:2px solid #ffb84d;outline-offset:2px}";
    document.head.appendChild(css);
    document.body.appendChild(sheet);
    fillSheet(document.getElementById("exo-install-steps"), document.getElementById("exo-install-why"));
    sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });
    document.getElementById("exo-install-close").addEventListener("click", closeSheet);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
  }
  function closeSheet() { if (sheet) sheet.hidden = true; btn.focus(); }

  btn.addEventListener("click", function () {
    if (deferred) {
      var d = deferred;
      deferred = null;
      btn.setAttribute("data-path", "prompt");
      d.prompt();
      if (d.userChoice) d.userChoice.then(function (r) { if (r && r.outcome === "accepted") btn.hidden = true; }).catch(function () {});
      return;
    }
    btn.setAttribute("data-path", "sheet");
    if (!sheet) buildSheet();
    sheet.hidden = false;
    document.getElementById("exo-install-close").focus();
  });
})();
