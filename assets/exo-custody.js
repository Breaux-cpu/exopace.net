/* Append-only SHA-256 custody chain. An empty book is EMPTY. */
(function (root) {
  var GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";

  function sort(value) {
    if (Array.isArray(value)) return value.map(sort);
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = sort(value[key]); });
      return out;
    }
    return value;
  }

  function canonical(row) {
    return [row.seq, row.prev, row.time, row.kind, JSON.stringify(sort(row.body))].join("|");
  }

  function sha256(text) {
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", bytes).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  function append(ledger, input) {
    var book = Array.isArray(ledger) ? ledger : [];
    if (!input || typeof input.time !== "string" || !input.time.trim()) return Promise.resolve(null);
    if (typeof input.kind !== "string" || !input.kind.trim()) return Promise.resolve(null);
    if (!input.body || typeof input.body !== "object" || Array.isArray(input.body)) return Promise.resolve(null);
    var seq = book.length;
    var prev = seq ? book[seq - 1].hash : GENESIS;
    var row = { seq: seq, prev: prev, time: input.time, kind: input.kind, body: sort(input.body), hash: "" };
    return sha256(canonical(row)).then(function (hash) {
      row.hash = hash;
      return book.concat([row]);
    });
  }

  function merkle(hashes) {
    if (!hashes.length) return Promise.resolve(null);
    var level = hashes.slice();
    function step() {
      if (level.length === 1) return Promise.resolve(level[0]);
      var jobs = [];
      for (var i = 0; i < level.length; i += 2) {
        jobs.push(sha256(level[i] + (level[i + 1] || level[i])));
      }
      return Promise.all(jobs).then(function (next) {
        level = next;
        return step();
      });
    }
    return step();
  }

  function verify(ledger) {
    var book = Array.isArray(ledger) ? ledger : [];
    if (!book.length) return Promise.resolve({ status: "EMPTY", root: null });
    var prev = GENESIS;
    for (var i = 0; i < book.length; i++) {
      var row = book[i];
      if (!row || row.seq !== i || row.prev !== prev) return Promise.resolve({ status: "HASH MISMATCH", root: null });
      prev = row.hash;
    }
    return Promise.all(book.map(function (row) { return sha256(canonical(row)); })).then(function (hashes) {
      for (var n = 0; n < hashes.length; n++) {
        if (hashes[n] !== book[n].hash) return { status: "HASH MISMATCH", root: null };
      }
      return merkle(hashes).then(function (rootHash) {
        return { status: "VERIFIED INTACT", root: rootHash };
      });
    });
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-custody");
      if (host) host.textContent = "EMPTY";
      var button = documentRef.getElementById("exo-custody-verify");
      if (!button || button.dataset.exoBound) return;
      button.dataset.exoBound = "1";
      button.addEventListener("click", function () {
        verify([]).then(function (result) {
          if (host) host.textContent = result.status;
        }).catch(function () {
          if (host) host.textContent = "EMPTY";
        });
      });
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.custody = { canonical: canonical, sha256: sha256, append: append, verify: verify, mount: mount, GENESIS: GENESIS };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
