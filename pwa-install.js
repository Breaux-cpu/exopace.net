/* MOC install chip — lives outside #root so React does not wipe it. */
(function () {
  var btn = document.getElementById("exo-install");
  if (!btn) return;

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }
  function isiOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  var deferred = null;
  if (standalone()) {
    btn.hidden = true;
    return;
  }
  if (isiOS()) btn.hidden = false;

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  window.addEventListener("appinstalled", function () {
    deferred = null;
    btn.hidden = true;
  });
  btn.addEventListener("click", function () {
    if (deferred) {
      deferred.prompt();
      deferred.userChoice.finally(function () {
        deferred = null;
        btn.hidden = true;
      });
      return;
    }
    btn.textContent = isiOS() ? "SHARE → ADD TO HOME SCREEN" : "BROWSER MENU → INSTALL APP";
  });
})();
