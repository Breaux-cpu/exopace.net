/* Ciphertext relay. Peers that were not announced are not invented. */
(function (root) {
  var KINDS = { sentinel: true, tle: true, room: true };
  var SECRET = { passphrase: true, password: true, lat: true, lon: true, plain: true, text: true, coordinates: true };

  function pack(kind, packet) {
    if (!KINDS[kind] || !packet || typeof packet.cipher !== "string" || !packet.cipher) return null;
    var out = { v: 1, kind: kind, cipher: packet.cipher, stored: false };
    if (typeof packet.iv === "string") out.iv = packet.iv;
    if (typeof packet.salt === "string") out.salt = packet.salt;
    Object.keys(packet).forEach(function (key) {
      if (SECRET[key]) delete out[key];
    });
    return out;
  }

  function peers(list) {
    if (!list || !list.length) return { status: "STANDBY", peers: [] };
    var rows = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && typeof list[i].id === "string" && list[i].id.trim()) rows.push({ id: list[i].id });
    }
    if (!rows.length) return { status: "STANDBY", peers: [] };
    return { status: "PEER", peers: rows };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-federation");
      if (host) host.textContent = peers([]).status;
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.nostr = { pack: pack, peers: peers, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
