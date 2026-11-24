/* Fountain blocks for a payload the caller already has. Empty input sends nothing. */
(function (root) {
  function encode(bytes, extra) {
    if (!bytes || !bytes.length) return [];
    var block = 16;
    var parts = [];
    for (var i = 0; i < bytes.length; i += block) {
      var slice = Array.from(bytes.slice(i, i + block));
      while (slice.length < block) slice.push(0);
      parts.push(slice);
    }
    var drops = parts.map(function (part, index) {
      return { ids: [index], data: part.slice() };
    });
    var spare = finiteCount(extra);
    for (var n = 0; n < spare; n++) {
      var a = n % parts.length;
      var b = (n + 1) % parts.length;
      var mixed = parts[a].map(function (value, index) { return value ^ parts[b][index]; });
      drops.push({ ids: a === b ? [a] : [a, b], data: mixed });
    }
    return drops.map(function (drop) {
      return frame(bytes.length, drop);
    });
  }

  function finiteCount(extra) {
    return typeof extra === "number" && Number.isFinite(extra) && extra > 0 ? Math.floor(extra) : 0;
  }

  function frame(total, drop) {
    var hex = drop.data.map(function (value) { return value.toString(16).padStart(2, "0"); }).join("");
    return "EXO1|" + total + "|" + drop.ids.join(".") + "|" + hex;
  }

  function parse(text) {
    var match = /^EXO1\|(\d+)\|([0-9.]+)\|([0-9a-fA-F]+)$/.exec(String(text || ""));
    if (!match || match[3].length % 2) return null;
    var data = [];
    for (var i = 0; i < match[3].length; i += 2) data.push(parseInt(match[3].slice(i, i + 2), 16));
    return { total: Number(match[1]), ids: match[2].split(".").map(Number), data: data };
  }

  function decode(frames) {
    var drops = (frames || []).map(parse).filter(Boolean);
    if (!drops.length) return null;
    var total = drops[0].total;
    if (!drops.every(function (drop) { return drop.total === total && drop.data.length === drops[0].data.length; })) return null;
    var width = drops[0].data.length;
    var pending = drops.map(function (drop) {
      return { ids: drop.ids.slice(), data: drop.data.slice() };
    });
    var solved = [];
    var guard = pending.length * pending.length + 1;
    while (pending.length && guard--) {
      var single = pending.findIndex(function (drop) { return drop.ids.length === 1; });
      if (single < 0) return null;
      var known = pending.splice(single, 1)[0];
      var id = known.ids[0];
      solved[id] = known.data;
      pending.forEach(function (drop) {
        var at = drop.ids.indexOf(id);
        if (at < 0) return;
        drop.ids.splice(at, 1);
        for (var i = 0; i < width; i++) drop.data[i] ^= known.data[i];
      });
      pending = pending.filter(function (drop) { return drop.ids.length > 0; });
    }
    var count = Math.ceil(total / width);
    if (solved.filter(Boolean).length < count) return null;
    var out = [];
    for (var n = 0; n < count; n++) out = out.concat(solved[n]);
    return Uint8Array.from(out.slice(0, total));
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-qr");
    if (host) host.textContent = "NO QR FRAME";
  }

  root.EXO = root.EXO || {};
  root.EXO.qr = { encode: encode, parse: parse, decode: decode, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
