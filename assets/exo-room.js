/* Room payloads stay ciphertext. The passphrase never leaves this page. */
(function (root) {
  function bytes(text) {
    return new TextEncoder().encode(text);
  }

  async function key(passphrase, salt) {
    var material = await crypto.subtle.importKey("raw", bytes(passphrase), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function encrypt(passphrase, payload) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var secret = await key(passphrase, salt);
    var cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, secret, bytes(JSON.stringify(payload))));
    function b64(buf) { return btoa(String.fromCharCode.apply(null, buf)); }
    return { salt: b64(salt), iv: b64(iv), cipher: b64(cipher) };
  }

  async function decrypt(passphrase, packet) {
    function raw(text) {
      var bin = atob(text);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    var secret = await key(passphrase, raw(packet.salt));
    var plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw(packet.iv) }, secret, raw(packet.cipher));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  root.EXO = root.EXO || {};
  root.EXO.room = { encrypt: encrypt, decrypt: decrypt };
})(typeof globalThis !== "undefined" ? globalThis : window);
