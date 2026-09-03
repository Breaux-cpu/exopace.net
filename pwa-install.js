/* MOC install chip — lives outside #root so React does not wipe it. */
(function () {
  var btn = document.getElementById("exo-install");
  if (!btn) return;

  function standalone() {
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  var deferred = null;
  if (standalone()) {
    btn.hidden = true;
    return;
  }
  // No beforeinstallprompt → click cannot install. Do not paint a dead chip
  // on SAT NAME (390 leftover). iOS has no BIP; Radio CHAT already has the recipe.
  btn.hidden = true;

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
    if (!deferred) {
      btn.hidden = true;
      return;
    }
    deferred.prompt();
    deferred.userChoice.finally(function () {
      deferred = null;
      btn.hidden = true;
    });
  });
})();
