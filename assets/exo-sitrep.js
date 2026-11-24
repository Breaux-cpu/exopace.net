/* Observations the operator wrote down. An empty book is not a report. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function realGrid(mgrs) {
    var grid = String(mgrs || "").trim();
    if (!grid || grid.toUpperCase() === "NO FIX") return false;
    return /\d/.test(grid);
  }

  function entry(obs) {
    if (!obs || !realGrid(obs.mgrs) || !String(obs.text || "").trim()) return null;
    return {
      mgrs: String(obs.mgrs).trim(),
      text: String(obs.text).trim(),
      at: finite(obs.at) ? obs.at : null,
    };
  }

  function sitrep(rows) {
    var lines = (rows || []).map(entry).filter(Boolean);
    if (!lines.length) return "NO OBSERVATIONS";
    return lines.map(function (row) {
      return "SITREP\nDTG: " + (row.at == null ? "UNSTATED" : String(row.at)) + "\nMGRS: " + row.mgrs + "\nOBS: " + row.text;
    }).join("\n\n");
  }

  async function seal(bytes, keyBytes) {
    if (!bytes || !bytes.length || !keyBytes || keyBytes.length !== 32) return null;
    if (!root.crypto || !root.crypto.subtle) return null;
    var iv = root.crypto.getRandomValues(new Uint8Array(12));
    var key = await root.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
    var ct = new Uint8Array(await root.crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes));
    return { iv: Array.from(iv), ct: Array.from(ct) };
  }

  async function open(sealed, keyBytes) {
    if (!sealed || !sealed.iv || !sealed.ct || !keyBytes || keyBytes.length !== 32) return null;
    if (!root.crypto || !root.crypto.subtle) return null;
    var key = await root.crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["decrypt"]);
    try {
      var plain = await root.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: new Uint8Array(sealed.iv) },
        key,
        new Uint8Array(sealed.ct),
      );
      return new Uint8Array(plain);
    } catch (err) {
      return null;
    }
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-sitrep");
    if (host) host.textContent = "NO OBSERVATIONS";
  }

  root.EXO = root.EXO || {};
  root.EXO.sitrep = { realGrid: realGrid, entry: entry, sitrep: sitrep, seal: seal, open: open, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
