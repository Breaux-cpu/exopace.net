/* GS-232B and EasyComm II. No granted port means no command is sent. */
(function (root) {
  var STOW = { azMin: 0, azMax: 360, elMin: 0, elMax: 90 };

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function pad(n) {
    var text = String(Math.round(n));
    while (text.length < 3) text = "0" + text;
    return text;
  }

  function command(az, el, limits) {
    var lim = limits || STOW;
    if (!finite(az) || !finite(el)) return { status: "NO TRACK", gs232: null, easycomm: null };
    if (az < lim.azMin || az > lim.azMax || el < lim.elMin || el > lim.elMax) {
      return { status: "LIMIT", gs232: null, easycomm: null };
    }
    return {
      status: "POINT",
      gs232: "W" + pad(az) + " " + pad(el) + "\r",
      easycomm: "AZ" + az.toFixed(1) + " EL" + el.toFixed(1) + "\n",
    };
  }

  function track(look, limits) {
    if (!look) return command(NaN, NaN, limits);
    return command(look.az, look.el, limits);
  }

  function linkStatus(portCount) {
    var serial = typeof navigator !== "undefined" && navigator.serial;
    if (!serial || !portCount) return "NO USB DEVICE";
    return "STANDBY";
  }

  function paint(doc, text) {
    ["exo-rotator", "exo-rotator-mission"].forEach(function (id) {
      var node = doc.getElementById(id);
      if (node) node.textContent = text;
    });
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var serial = typeof navigator !== "undefined" && navigator.serial;
      if (!serial || typeof serial.getPorts !== "function") {
        paint(documentRef, "NO USB DEVICE");
        return;
      }
      serial.getPorts().then(function (list) {
        paint(documentRef, linkStatus(list ? list.length : 0));
      }).catch(function () {
        paint(documentRef, "NO USB DEVICE");
      });
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.rotator = { command: command, track: track, linkStatus: linkStatus, mount: mount, STOW: STOW };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
