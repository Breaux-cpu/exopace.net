/* Document Picture-in-Picture. No window is opened without a click, and none is faked. */
(function (root) {
  var CHANNEL = "exopace-pip";

  function supported(doc) {
    return !!(doc && doc.documentPictureInPicture && typeof doc.documentPictureInPicture.requestWindow === "function");
  }

  function post(message) {
    if (typeof BroadcastChannel !== "function") return false;
    var bus = new BroadcastChannel(CHANNEL);
    bus.postMessage(message);
    bus.close();
    return true;
  }

  async function open(doc, title) {
    if (!supported(doc)) return { ok: false, status: "PIP UNSUPPORTED" };
    try {
      var pip = await doc.documentPictureInPicture.requestWindow({ width: 360, height: 240 });
      pip.document.title = title || "EXOpace";
      pip.document.body.style.margin = "0";
      pip.document.body.style.background = "#04070d";
      pip.document.body.style.color = "#7ee0ff";
      pip.document.body.textContent = title || "EXOpace";
      post({ open: true, title: pip.document.title });
      return { ok: true, status: "PIP OPEN" };
    } catch (err) {
      return { ok: false, status: "PIP UNSUPPORTED" };
    }
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-pip");
    var button = documentRef.getElementById("exo-pip-open");
    if (host) host.textContent = supported(documentRef) ? "PIP READY" : "PIP UNSUPPORTED";
    if (!button || button.dataset.exoPip) return;
    button.dataset.exoPip = "1";
    button.addEventListener("click", function () {
      open(documentRef, button.getAttribute("data-title") || "EXOpace");
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.pip = { supported: supported, post: post, open: open, mount: mount, CHANNEL: CHANNEL };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
