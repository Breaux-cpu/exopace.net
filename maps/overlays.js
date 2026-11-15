/* FEMA flood, OSM leaf type, and OSM amateur radio for the current view. */
(function (root) {
  var timer = null;
  var job = 0;

  function empty() {
    return { type: "FeatureCollection", features: [] };
  }

  function spanTooWide(bounds, limit) {
    return bounds.getNorth() - bounds.getSouth() > limit || bounds.getEast() - bounds.getWest() > limit;
  }

  function publicSite() {
    return location.hostname === "exopace.net" || location.hostname === "www.exopace.net";
  }

  async function loadProxy(kind, bounds) {
    var q = "kind=" + encodeURIComponent(kind)
      + "&s=" + bounds.getSouth().toFixed(5)
      + "&w=" + bounds.getWest().toFixed(5)
      + "&n=" + bounds.getNorth().toFixed(5)
      + "&e=" + bounds.getEast().toFixed(5);
    var res = await fetch("/api/overlay?" + q);
    var data = await res.json();
    return { ok: res.ok, data: data };
  }

  async function loadFlood(bounds) {
    if (!publicSite()) return loadProxy("flood", bounds);
    var geometry = [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()].join(",");
    var url = "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query?where=1%3D1&geometry="
      + encodeURIComponent(geometry)
      + "&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects"
      + "&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=true&outSR=4326&f=geojson"
      + "&resultRecordCount=300&geometryPrecision=5";
    var res = await fetch(url);
    if (!res.ok) return { ok: false, data: { error: "unavailable" } };
    var raw = await res.json();
    if (raw.exceededTransferLimit) return { ok: true, data: { error: "zoom", features: [] } };
    var features = [];
    (raw.features || []).slice(0, 300).forEach(function (row) {
      var zone = row.properties && row.properties.FLD_ZONE;
      if (!zone || !row.geometry) return;
      features.push({
        type: "Feature",
        properties: {
          zone: String(zone).slice(0, 12),
          subtype: String((row.properties && row.properties.ZONE_SUBTY) || "").slice(0, 40),
          source: "FEMA NFHL",
        },
        geometry: row.geometry,
      });
    });
    return { ok: true, data: { features: features, source: "FEMA NFHL", truncated: (raw.features || []).length > 300 } };
  }

  function put(map, source, data) {
    var src = map.getSource(source);
    if (src) src.setData(data || empty());
  }

  async function pull(map, state, setStatus, token) {
    var bounds = map.getBounds();
    var notes = [];
    var tasks = [];
    if (state.layers.flood) tasks.push(["flood", "flood", "FLOOD", 0.75]);
    if (state.layers.ham) tasks.push(["ham", "ham", "HAM", 0.45]);
    if (state.layers.leaf) tasks.push(["leaf", "leaf", "LEAF", 0.45]);
    for (var i = 0; i < tasks.length; i++) {
      var task = tasks[i];
      if (spanTooWide(bounds, task[3])) {
        put(map, task[1], empty());
        notes.push(task[2] + " — ZOOM IN");
        continue;
      }
      try {
        var result = task[0] === "flood" ? await loadFlood(bounds) : await loadProxy(task[0], bounds);
        if (token !== job) return;
        var data = result.data || {};
        if (!result.ok || data.error === "unavailable" || data.error === "origin") {
          put(map, task[1], empty());
          notes.push(task[2] + " UNAVAILABLE");
        } else if (data.error === "zoom") {
          put(map, task[1], empty());
          notes.push(task[2] + " — ZOOM IN");
        } else {
          put(map, task[1], { type: "FeatureCollection", features: data.features || [] });
          if (data.truncated) notes.push(task[2] + " PARTIAL — ZOOM IN");
          else if (!(data.features || []).length) notes.push(task[2] + " — NONE IN VIEW");
          else notes.push(task[2] + " " + data.features.length);
        }
      } catch (err) {
        if (token !== job) return;
        put(map, task[1], empty());
        notes.push(task[2] + " UNAVAILABLE");
      }
    }
    if (token === job && notes.length && setStatus) setStatus(notes.join("  ·  "));
  }

  function sync(map, state, setStatus) {
    if (!map || !state || !map.isStyleLoaded || !map.isStyleLoaded()) return;
    clearTimeout(timer);
    job += 1;
    var token = job;
    if (!state.layers.flood && !state.layers.ham && !state.layers.leaf) return;
    timer = setTimeout(function () {
      pull(map, state, setStatus, token);
    }, 650);
  }

  root.EXO = root.EXO || {};
  root.EXO.overlays = { sync: sync };
})(typeof globalThis !== "undefined" ? globalThis : this);
