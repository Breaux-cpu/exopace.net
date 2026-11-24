/* Deterministic excerpts from local records. No model and no vault means no brief. */
(function (root) {
  function tokens(text) {
    var seen = {};
    String(text || "").toLowerCase().split(/[^a-z0-9]+/).forEach(function (word) {
      if (word.length >= 3) seen[word] = true;
    });
    return Object.keys(seen);
  }

  function retrieve(query, docs) {
    if (!docs || !docs.length) return { status: "NO VAULT", hits: [], accelerator: accelerator() };
    var want = tokens(query);
    if (!want.length) return { status: "NO QUERY", hits: [], accelerator: accelerator() };
    var hits = [];
    docs.forEach(function (doc) {
      if (!doc || typeof doc.text !== "string" || !doc.text.trim()) return;
      var have = tokens(doc.text);
      var overlap = want.filter(function (word) { return have.indexOf(word) !== -1; });
      if (!overlap.length) return;
      var sentences = doc.text.split(/(?<=[.!?])\s+/);
      var passage = sentences.filter(function (sentence) {
        var bag = tokens(sentence);
        return overlap.some(function (word) { return bag.indexOf(word) !== -1; });
      }).join(" ");
      if (!passage || doc.text.indexOf(passage) === -1) passage = doc.text;
      hits.push({ id: doc.id || "", title: doc.title || "", text: passage, overlap: overlap.length });
    });
    hits.sort(function (a, b) { return b.overlap - a.overlap; });
    if (!hits.length) return { status: "NO MATCH", hits: [], accelerator: accelerator() };
    return { status: "BRIEF", hits: hits.slice(0, 4), accelerator: accelerator() };
  }

  function accelerator() {
    var gpu = typeof navigator !== "undefined" && navigator.gpu;
    return gpu ? "WEBGPU" : "NO WEBGPU";
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-brief");
      if (host) host.textContent = "NO VAULT";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.brief = { retrieve: retrieve, accelerator: accelerator, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
