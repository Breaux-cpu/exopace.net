(function () {
  var EXO = globalThis.EXO;
  var state = {
    series: "letter",
    scale: 50000,
    orient: "portrait",
    units: "metric",
    labels: "sparse",
    ink: "color",
    hill: "soft",
    contours: "full",
    base: "paper",
    offline: false,
    secondary: "off",
    measure: "off",
    layers: {
      woods: true, water: true, roads: true, trails: true, rail: true,
      air: true, buildings: true, land: true, peaks: true, grid: true,
      power: false, pipeline: false, flood: false, dep: false, ham: false, leaf: false,
    },
    sheets: [],
    active: null,
  };
  var past = [];
  var future = [];
  var magCache = {};
  var magTimer = null;
  var quadNames = Object.create(null);
  var quadPending = Object.create(null);
  var quadQueue = [];
  var quadBusy = 0;
  var measurePoints = [];
  var measureElev = null;
  var measureMag = null;
  var measureToken = 0;

  var map;
  var startView = { center: [-98.5, 39.5], zoom: 4 };
  var drag = null;
  var box = null;
  var moved = false;

  function $(id) { return document.getElementById(id); }

  function setStatus(text) {
    var el = $("fm-status");
    if (el) el.textContent = text;
  }

  function screenScale() {
    var lat = map.getCenter().lat * Math.PI / 180;
    var mpp = 156543.03392 * Math.cos(lat) / Math.pow(2, map.getZoom());
    return Math.round((mpp * 1000) / 0.264583);
  }

  function readout() {
    var c = map.getCenter();
    var mgrs = "—";
    try { mgrs = EXO.mgrs.format(c.lng, c.lat); } catch (err) { mgrs = "POLAR"; }
    $("fm-mgrs").textContent = mgrs;
    var sheetText = state.series === "letter"
      ? "SHEET 1:" + Number(state.scale).toLocaleString("en-US")
      : EXO.sheets.seriesTitle(state.series);
    $("fm-scale").textContent = "SCREEN 1:" + screenScale().toLocaleString("en-US") + "  ·  " + sheetText;
    var quads = state.sheets.filter(function (s) { return s.kind === "quad"; }).length;
    var countText = quads && quads === state.sheets.length
      ? quads + " QUAD" + (quads === 1 ? "" : "S")
      : state.sheets.length + " PAGE" + (state.sheets.length === 1 ? "" : "S");
    var activeNow = activeSheet();
    if (activeNow && activeNow.mapName) countText += " · " + activeNow.mapName;
    $("fm-count").textContent = countText;
    var north = $("fm-north");
    if (north) north.textContent = northText(c);
    var key = c.lat.toFixed(1) + "," + c.lng.toFixed(1);
    if (magCache[key] === undefined) {
      clearTimeout(magTimer);
      magTimer = setTimeout(fetchMag, 700);
    }
  }

  function northText(c) {
    try {
      var g = EXO.mgrs.convergence(c.lat, c.lng);
      var key = c.lat.toFixed(1) + "," + c.lng.toFixed(1);
      var mag = Object.prototype.hasOwnProperty.call(magCache, key) ? magCache[key] : undefined;
      var magText = mag === undefined ? "MAG …" : mag == null ? "MAG — CHART" : "MN " + Math.abs(mag).toFixed(1) + "° " + (mag >= 0 ? "E" : "W");
      return "GN " + Math.abs(g).toFixed(1) + "° " + (g >= 0 ? "E" : "W") + "  ·  " + magText;
    } catch (err) {
      return "GN —  ·  MAG — CHART";
    }
  }

  async function fetchMag() {
    if (!map) return;
    var c = map.getCenter();
    var key = c.lat.toFixed(1) + "," + c.lng.toFixed(1);
    if (magCache[key] === undefined) magCache[key] = await EXO.print.magDecl(c.lat, c.lng);
    var north = $("fm-north");
    if (north) north.textContent = northText(map.getCenter());
  }

  function snap() {
    return {
      series: state.series,
      scale: state.scale,
      orient: state.orient,
      active: state.active,
      sheets: state.sheets.map(function (s) { return EXO.sheets.encodeSheet(s); }),
    };
  }

  function restore(item) {
    state.series = item.series || "letter";
    state.scale = item.scale;
    state.orient = item.orient;
    state.sheets = item.sheets.map(function (b) {
      if (Array.isArray(b)) return EXO.sheets.make(b[0], b[1], b[2], b[3], b[4], b[5]);
      return EXO.sheets.decodeSheet(b, state.scale, state.orient);
    });
    state.active = item.active;
    paintChips();
    syncSheets();
  }

  function remember() {
    past.push(snap());
    if (past.length > 40) past.shift();
    future = [];
  }

  function undo() {
    if (!past.length) return;
    future.push(snap());
    restore(past.pop());
    setStatus("UNDO");
  }

  function redo() {
    if (!future.length) return;
    past.push(snap());
    restore(future.pop());
    setStatus("REDO");
  }

  function sheetFC() {
    return {
      type: "FeatureCollection",
      features: state.sheets.map(function (s) {
        return {
          type: "Feature",
          properties: { id: s.id, active: s.id === state.active ? 1 : 0, name: s.kind === "quad" ? (s.mapName || s.name) : "" },
          geometry: { type: "Polygon", coordinates: [EXO.sheets.ring(s)] },
        };
      }),
    };
  }

  function syncSheets() {
    state.sheets.forEach(rememberQuadName);
    var src = map.getSource("sheets");
    if (src) src.setData(sheetFC());
    readout();
    writeHash();
    state.sheets.forEach(enqueueQuadName);
  }

  function rememberQuadName(sheet) {
    if (!sheet || sheet.kind !== "quad") return;
    var cached = quadNames[sheet.id];
    if (cached) sheet.mapName = cached;
  }

  function enqueueQuadName(sheet) {
    if (!sheet || sheet.kind !== "quad") return;
    if (!EXO.sheets.quadIndexLayer(sheet.series)) return;
    if (sheet.mapName || Object.prototype.hasOwnProperty.call(quadNames, sheet.id) || quadPending[sheet.id]) return;
    quadPending[sheet.id] = {
      id: sheet.id,
      series: sheet.series,
      south: sheet.south,
      west: sheet.west,
      north: sheet.north,
      east: sheet.east,
    };
    quadQueue.push(sheet.id);
    pumpQuadNames();
  }

  function startQuadJob(id, job) {
    quadBusy += 1;
    fetchQuadName(job).then(function (name) {
      finishQuadName(id, name, false);
    }, function () {
      finishQuadName(id, "", true);
    });
  }

  function pumpQuadNames() {
    while (quadBusy < 3 && quadQueue.length) {
      var id = quadQueue.shift();
      var job = quadPending[id];
      if (!job) continue;
      startQuadJob(id, job);
    }
  }

  function finishQuadName(id, name, failed) {
    delete quadPending[id];
    quadBusy -= 1;
    if (!failed && !Object.prototype.hasOwnProperty.call(quadNames, id)) {
      quadNames[id] = name || "";
      if (name) {
        state.sheets.forEach(function (sheet) {
          if (sheet.id === id) sheet.mapName = name;
        });
        if (map) syncSheets();
      }
    }
    pumpQuadNames();
  }

  function cleanQuadName(value) {
    var text = String(value || "").replace(/[\u0000-\u001f]/g, "").trim();
    if (!text || text.toLowerCase() === "null") return "";
    return text.slice(0, 64);
  }

  async function fetchQuadName(job) {
    var lat = (job.south + job.north) / 2;
    var lon = (job.west + job.east) / 2;
    var layer = EXO.sheets.quadIndexLayer(job.series);
    if (!layer) return "";
    var url = "https://carto.nationalmap.gov/arcgis/rest/services/map_indices/MapServer/"
      + layer + "/query?geometry=" + encodeURIComponent(lon.toFixed(5) + "," + lat.toFixed(5))
      + "&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects"
      + "&outFields=CELL_NAME&returnGeometry=true&outSR=4326&geometryPrecision=4&f=json&resultRecordCount=1";
    var res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error("quad name");
    var data = await res.json();
    var feat = data.features && data.features[0];
    var ring = feat && feat.geometry && feat.geometry.rings && feat.geometry.rings[0];
    if (!ring || !ring.length) return "";
    var west = Infinity;
    var south = Infinity;
    var east = -Infinity;
    var north = -Infinity;
    ring.forEach(function (point) {
      if (!point || point.length < 2) return;
      var x = Number(point[0]);
      var y = Number(point[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      west = Math.min(west, x);
      east = Math.max(east, x);
      south = Math.min(south, y);
      north = Math.max(north, y);
    });
    var probe = { kind: "quad", west: job.west, south: job.south, east: job.east, north: job.north };
    if (!EXO.sheets.quadExtentFits(probe, west, south, east, north)) return "";
    var attrs = feat.attributes || {};
    return cleanQuadName(attrs.CELL_NAME || attrs.cell_name);
  }

  function measureFC() {
    var features = [];
    if (measurePoints.length === 2) {
      var line = EXO.measure.lineCoords(measurePoints[0], measurePoints[1]);
      if (line.length >= 2) {
        features.push({
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: line },
        });
      }
    }
    measurePoints.forEach(function (point) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "Point", coordinates: [point.lon, point.lat] },
      });
    });
    return { type: "FeatureCollection", features: features };
  }

  function elevText(fromElev, toElev) {
    var imperial = state.units === "imperial";
    var scale = imperial ? 3.280839895 : 1;
    var unit = imperial ? "FT" : "M";
    var from = Math.round(fromElev * scale);
    var to = Math.round(toElev * scale);
    var delta = to - from;
    return "ELEV " + from.toLocaleString("en-US") + " " + unit
      + " TO " + to.toLocaleString("en-US") + " " + unit
      + "  ·  Δ " + (delta > 0 ? "+" : "") + delta.toLocaleString("en-US") + " " + unit;
  }

  function paintMeasure() {
    var el = $("fm-leg");
    if (!el) return;
    if (state.measure !== "on") {
      el.textContent = "MEASURE OFF";
      return;
    }
    if (measurePoints.length === 0) {
      el.textContent = "CLICK THE START";
      return;
    }
    if (measurePoints.length === 1) {
      el.textContent = "CLICK THE END";
      return;
    }
    var a = measurePoints[0];
    var b = measurePoints[1];
    var conv;
    var zone;
    try {
      conv = EXO.mgrs.convergence(a.lat, a.lon);
      zone = EXO.mgrs.zoneFor(a.lat, a.lon);
    } catch (err) {
      el.textContent = "OUTSIDE THE MEASURE GRID";
      return;
    }
    var result = EXO.measure.solve(a.lat, a.lon, b.lat, b.lon, conv, measureMag);
    if (!result) {
      el.textContent = "NO GEODETIC SOLUTION";
      return;
    }
    if (result.distanceM === 0) {
      el.textContent = "SAME POINT";
      return;
    }
    var lines = [
      EXO.measure.formatDistance(result.distanceM, state.units),
      "TRUE " + EXO.measure.azText(result.trueAz) + "  ·  GRID " + EXO.measure.azText(result.gridAz) + " Z" + zone,
      result.magAz == null ? "MAG — CHART" : "MAG " + EXO.measure.azText(result.magAz),
      "BACK " + EXO.measure.azText(result.backTrue),
    ];
    if (measureElev && Number.isFinite(measureElev.a) && Number.isFinite(measureElev.b)) {
      lines.push(elevText(measureElev.a, measureElev.b));
    }
    el.textContent = lines.join("\n");
  }

  function loadMeasureExtra() {
    var token = ++measureToken;
    var a = measurePoints[0];
    var b = measurePoints[1];
    Promise.all([
      EXO.terrain.sample(a.lat, a.lon),
      EXO.terrain.sample(b.lat, b.lon),
      EXO.print.magDecl(a.lat, a.lon),
    ]).then(function (row) {
      if (token !== measureToken || measurePoints.length !== 2) return;
      measureElev = { a: row[0], b: row[1] };
      measureMag = row[2];
      paintMeasure();
    }, function () {
      if (token !== measureToken) return;
      measureMag = null;
      paintMeasure();
    });
  }

  function syncMeasure() {
    var src = map && map.getSource("measure");
    if (src) src.setData(measureFC());
    paintMeasure();
    if (state.measure === "on" && measurePoints.length === 2) loadMeasureExtra();
  }

  function placeMeasure(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -80 || lat > 84) {
      setStatus("OUTSIDE THE MEASURE GRID");
      return;
    }
    if (measurePoints.length >= 2) measurePoints = [];
    measurePoints.push({ lat: lat, lon: lon });
    measureElev = null;
    measureMag = null;
    measureToken += 1;
    syncMeasure();
  }

  function addSheet(lat, lon, quiet) {
    if (state.sheets.length >= 24) {
      setStatus("24 PAGE LIMIT");
      return;
    }
    if (!quiet) remember();
    var sheet;
    try {
      sheet = state.series === "letter"
        ? EXO.sheets.at(lat, lon, state.scale, state.orient)
        : EXO.sheets.quadAt(lat, lon, state.series);
    }
    catch (err) { setStatus("OUTSIDE THE SHEET GRID"); return; }
    if (state.sheets.some(function (s) { return s.id === sheet.id; })) {
      state.active = sheet.id;
    } else {
      state.sheets.push(sheet);
      state.active = sheet.id;
    }
    syncSheets();
  }

  function removeSheet(id) {
    remember();
    state.sheets = state.sheets.filter(function (s) { return s.id !== id; });
    if (state.active === id) state.active = state.sheets.length ? state.sheets[state.sheets.length - 1].id : null;
    syncSheets();
  }

  function activeSheet() {
    for (var i = 0; i < state.sheets.length; i++) {
      if (state.sheets[i].id === state.active) return state.sheets[i];
    }
    return null;
  }

  function replaceActive(next) {
    state.sheets = state.sheets.map(function (s) { return s.id === state.active ? next : s; });
    state.active = next.id;
    syncSheets();
  }

  function gridSpacing(zoom) {
    if (zoom < 6) return 100000;
    if (zoom < 9) return 10000;
    if (zoom < 12) return 5000;
    return 1000;
  }

  function syncGrid() {
    var src = map.getSource("grid");
    if (!src || !state.layers.grid) {
      if (src) src.setData(EXO.mapStyle.empty());
      return;
    }
    var b = map.getBounds();
    var z = map.getZoom();
    var step = gridSpacing(z);
    var features = [];
    var zones = {};
    try { zones[EXO.mgrs.utm(b.getCenter().lat, b.getCenter().lng).zone] = true; } catch (err) { return; }
    [b.getWest(), b.getEast()].forEach(function (lon) {
      try { zones[EXO.mgrs.utm(b.getCenter().lat, lon).zone] = true; } catch (err) {}
    });
    Object.keys(zones).forEach(function (zoneStr) {
      var zone = Number(zoneStr);
      var corners = [
        [b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()],
        [b.getWest(), b.getNorth()], [b.getEast(), b.getNorth()],
      ];
      var es = [];
      var ns = [];
      corners.forEach(function (ll) {
        try {
          var u = EXO.mgrs.utm(ll[1], ll[0], zone);
          es.push(u.easting);
          ns.push(u.northing);
        } catch (err) {}
      });
      if (!es.length) return;
      var e0 = Math.floor(Math.min.apply(null, es) / step) * step;
      var e1 = Math.ceil(Math.max.apply(null, es) / step) * step;
      var n0 = Math.floor(Math.min.apply(null, ns) / step) * step;
      var n1 = Math.ceil(Math.max.apply(null, ns) / step) * step;
      var hemi = b.getCenter().lat < 0 ? "S" : "N";
      function line(coords, major) {
        features.push({ type: "Feature", properties: { major: major ? 1 : 0 }, geometry: { type: "LineString", coordinates: coords } });
      }
      for (var e = e0; e <= e1 && features.length < 400; e += step) {
        var coords = [];
        for (var n = n0; n <= n1; n += Math.max(step, (n1 - n0) / 8)) {
          var ll = EXO.mgrs.utmInverse(zone, hemi, e, n);
          coords.push([ll.lon, ll.lat]);
        }
        line(coords, e % (step * 10) === 0);
      }
      for (var n2 = n0; n2 <= n1 && features.length < 800; n2 += step) {
        var coords2 = [];
        for (var e2 = e0; e2 <= e1; e2 += Math.max(step, (e1 - e0) / 8)) {
          var ll2 = EXO.mgrs.utmInverse(zone, hemi, e2, n2);
          coords2.push([ll2.lon, ll2.lat]);
        }
        line(coords2, n2 % (step * 10) === 0);
      }
    });
    src.setData({ type: "FeatureCollection", features: features });
  }

  function graticuleStep(zoom) {
    if (zoom < 4) return 10;
    if (zoom < 6) return 5;
    if (zoom < 8) return 1;
    if (zoom < 10) return 0.5;
    if (zoom < 12) return 0.1;
    return 0.05;
  }

  function syncGraticule() {
    var src = map.getSource("graticule");
    if (!src) return;
    if (state.secondary !== "latlon") {
      src.setData(EXO.mapStyle.empty());
      return;
    }
    var b = map.getBounds();
    var step = graticuleStep(map.getZoom());
    var west = Math.max(-180, Math.floor(b.getWest() / step) * step);
    var east = Math.min(180, Math.ceil(b.getEast() / step) * step);
    var south = Math.max(-80, Math.floor(b.getSouth() / step) * step);
    var north = Math.min(84, Math.ceil(b.getNorth() / step) * step);
    var features = [];
    for (var lon = west; lon <= east && features.length < 400; lon += step) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[lon, south], [lon, north]] },
      });
    }
    for (var lat = south; lat <= north && features.length < 800; lat += step) {
      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: [[west, lat], [east, lat]] },
      });
    }
    src.setData({ type: "FeatureCollection", features: features });
  }

  function writeHash() {
    if (!map) return;
    var c = map.getCenter();
    var q = new URLSearchParams();
    q.set("lat", c.lat.toFixed(5));
    q.set("lon", c.lng.toFixed(5));
    q.set("z", map.getZoom().toFixed(2));
    q.set("series", state.series);
    q.set("scale", String(state.scale));
    q.set("orient", state.orient);
    if (state.sheets.length) {
      q.set("sheets", state.sheets.map(function (s) { return EXO.sheets.encodeSheet(s); }).join(","));
    }
    history.replaceState(null, "", "#" + q.toString());
  }

  function readHash() {
    var q = new URLSearchParams(location.hash.replace(/^#/, ""));
    var series = q.get("series");
    if (series && EXO.sheets.seriesSpec(series)) state.series = series;
    var scale = Number(q.get("scale"));
    if (state.series === "letter" && EXO.sheets.scales.indexOf(scale) >= 0) state.scale = scale;
    if (state.series !== "letter") state.scale = EXO.sheets.seriesScale(state.series);
    if (q.get("orient") === "landscape" || q.get("orient") === "portrait") state.orient = q.get("orient");
    var raw = q.get("sheets");
    if (raw) {
      state.sheets = raw.split(",").map(function (part) {
        try { return EXO.sheets.decodeSheet(part, state.scale, state.orient); }
        catch (err) { return null; }
      }).filter(Boolean);
      if (state.sheets.length) state.active = state.sheets[state.sheets.length - 1].id;
    }
    return EXO.sheets.viewFromHash(location.hash);
  }

  function paintChips() {
    document.querySelectorAll("[data-key]").forEach(function (group) {
      var key = group.getAttribute("data-key");
      var value = key.indexOf("layer-") === 0 ? String(state.layers[key.slice(6)]) : String(state[key]);
      if (key === "scale" && state.series !== "letter") value = "";
      var note = $("fm-series-note");
      if (note) note.textContent = EXO.sheets.seriesNote(state.series);
      group.querySelectorAll("button").forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-value") === value ? "true" : "false");
      });
    });
  }

  function applyStyle() {
    EXO.hill = state.hill;
    EXO.contours = state.contours;
    EXO.mapStyle.apply(map, state);
    paintChips();
  }

  function zoomToScale() {
    var lat = map.getCenter().lat * Math.PI / 180;
    var mpp = 0.264583 * state.scale / 1000;
    var z = Math.log2(156543.03392 * Math.cos(lat) / mpp);
    map.easeTo({ zoom: z, duration: 300 });
  }

  function hitSheet(point) {
    if (!map.getLayer("sheets-fill")) return null;
    var hits = map.queryRenderedFeatures(point, { layers: ["sheets-fill"] });
    return hits.length ? hits[0].properties.id : null;
  }

  function fillBounds(b) {
    remember();
    if (state.series !== "letter") {
      var spec = EXO.sheets.seriesSpec(state.series);
      var lat = b.getSouth();
      var guard = 0;
      while (lat < b.getNorth() && guard < 80) {
        var lon = b.getWest();
        var nextLat = null;
        var inner = 0;
        while (lon < b.getEast() && inner < 30 && guard < 80) {
          inner += 1;
          guard += 1;
          if (state.sheets.length >= 24) {
            setStatus("24 PAGE LIMIT");
            syncSheets();
            return;
          }
          var quad;
          try { quad = EXO.sheets.quadAt(lat, lon, state.series); }
          catch (err) { break; }
          addSheet(quad.mid.lat, quad.mid.lon, true);
          if (nextLat == null) nextLat = quad.north;
          lon = quad.east + 1e-8;
        }
        lat = nextLat == null ? lat + spec.dLat : nextLat + 1e-8;
      }
      setStatus("QUADS FILLED");
      return;
    }
    var ground = EXO.sheets.size(state.scale, state.orient);
    var mid = (b.getSouth() + b.getNorth()) / 2;
    var dLat = ground.hM / 111320 * 0.85;
    var dLon = ground.wM / (111320 * Math.cos(mid * Math.PI / 180)) * 0.85;
    if (!isFinite(dLat) || dLat <= 0) return;
    for (var lat = b.getSouth(); lat < b.getNorth(); lat += dLat) {
      for (var lon = b.getWest(); lon < b.getEast(); lon += dLon) {
        if (state.sheets.length >= 24) {
          setStatus("24 PAGE LIMIT");
          syncSheets();
          return;
        }
        addSheet(lat, lon, true);
      }
    }
    setStatus("PAGES FILLED");
  }

  function fillView() {
    fillBounds(map.getBounds());
  }

  async function jpegOf(canvas) {
    var blob = await new Promise(function (resolve) { canvas.toBlob(resolve, "image/jpeg", 0.82); });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function saveBytes(bytes, name, type) {
    var blob = new Blob([bytes], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  async function shareOrSave(bytes, name, type) {
    var file = new File([bytes], name, { type: type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return "shared";
      } catch (err) {
        if (err && err.name === "AbortError") return "cancel";
      }
    }
    saveBytes(bytes, name, type);
    return "saved";
  }

  async function captureStyle(sheet) {
    var paper = EXO.sheets.paper(sheet.scale, sheet.orient);
    var div = document.createElement("div");
    div.className = "fm-print-map";
    div.style.width = paper.neatWpx + "px";
    div.style.height = paper.neatHpx + "px";
    document.body.appendChild(div);
    var shot = new maplibregl.Map({
      container: div,
      style: EXO.mapStyle.build(),
      interactive: false,
      fadeDuration: 0,
      attributionControl: false,
      preserveDrawingBuffer: true,
      pixelRatio: 1,
    });
    try {
      await new Promise(function (resolve, reject) {
        var timer = setTimeout(function () { reject(new Error("sheet timeout")); }, 12000);
        shot.on("load", function () { clearTimeout(timer); resolve(); });
        shot.on("error", function () {});
      });
      EXO.mapStyle.apply(shot, state);
      if (shot.getLayer("grid-line")) shot.setLayoutProperty("grid-line", "visibility", "none");
      if (shot.getLayer("sheets-fill")) shot.setLayoutProperty("sheets-fill", "visibility", "none");
      if (shot.getLayer("sheets-line")) shot.setLayoutProperty("sheets-line", "visibility", "none");
      var mpp = sheet.wM / paper.neatWpx;
      var z = Math.log2(156543.03392 * Math.cos(sheet.mid.lat * Math.PI / 180) / mpp);
      shot.jumpTo({ center: [sheet.mid.lon, sheet.mid.lat], zoom: z, bearing: 0, pitch: 0 });
      await new Promise(function (resolve) {
        var timer = setTimeout(resolve, 8000);
        shot.once("idle", function () { setTimeout(function () { clearTimeout(timer); resolve(); }, 400); });
      });
      var src = shot.getCanvas();
      var copy = document.createElement("canvas");
      copy.width = src.width;
      copy.height = src.height;
      copy.getContext("2d").drawImage(src, 0, 0);
      return copy;
    } finally {
      shot.remove();
      div.remove();
    }
  }

  function pagesForExport() {
    var sheets = state.sheets.slice();
    if (!sheets.length) {
      var c = map.getCenter();
      try {
        sheets = [state.series === "letter"
          ? EXO.sheets.at(c.lat, c.lng, state.scale, state.orient)
          : EXO.sheets.quadAt(c.lat, c.lng, state.series)];
      } catch (err) {
        setStatus("OUTSIDE THE SHEET GRID");
        return null;
      }
      setStatus("NO PAGE PICKED — SHEET UNDER THE CENTER");
    }
    var pages = [];
    for (var i = 0; i < sheets.length; i++) {
      var part = sheets[i].kind === "quad" ? EXO.sheets.letterTiles(sheets[i]) : [sheets[i]];
      if (!part.length || pages.length + part.length > 36) {
        setStatus("36 PAGE LIMIT — PRINT ONE QUADRANGLE AT A TIME");
        return null;
      }
      pages = pages.concat(part);
    }
    return pages;
  }

  async function renderSheets(withStyle) {
    var sheets = pagesForExport();
    if (!sheets) return null;
    var canvases = [];
    for (var i = 0; i < sheets.length; i++) {
      setStatus("SHEET " + (i + 1) + " / " + sheets.length);
      var shot = null;
      if (withStyle && !state.offline) {
        try { shot = await captureStyle(sheets[i]); } catch (err) { shot = null; }
      }
      canvases.push(await EXO.print.page(sheets[i], {
        shot: shot,
        units: state.units,
        contours: state.contours,
        hill: state.hill,
      }));
    }
    return { sheets: sheets, canvases: canvases };
  }

  async function downloadPdf() {
    try {
      var pack = await renderSheets(true);
      if (!pack) return;
      var pages = [];
      for (var i = 0; i < pack.canvases.length; i++) {
        pages.push({
          jpeg: await jpegOf(pack.canvases[i]),
          landscape: pack.sheets[i].orient === "landscape",
        });
      }
      saveBytes(EXO.print.pdf(pages), "exopace-field-map.pdf", "application/pdf");
      setStatus("PDF READY — PRINT AT ACTUAL SIZE");
    } catch (err) {
      setStatus("PDF FAILED");
    }
  }

  async function sendAtak() {
    try {
      var pack = await renderSheets(true);
      if (!pack) return;
      var jpegs = [];
      for (var i = 0; i < pack.canvases.length; i++) jpegs.push(await jpegOf(pack.canvases[i]));
      var bytes = await EXO.atak.kmz(pack.sheets, jpegs);
      var how = await shareOrSave(bytes, "exopace-field-map.kmz", "application/vnd.google-earth.kmz");
      if (how === "shared") setStatus("SHARE SHEET — PICK ATAK");
      else if (how === "saved") setStatus("KMZ SAVED — OPEN IT IN ATAK");
      else setStatus("SHARE CANCELLED");
    } catch (err) {
      setStatus("ATAK EXPORT FAILED");
    }
  }

  async function fitJpeg(canvas) {
    var max = 1024;
    var scale = Math.min(1, max / canvas.width, max / canvas.height);
    if (scale === 1) return jpegOf(canvas);
    var copy = document.createElement("canvas");
    copy.width = Math.max(1, Math.round(canvas.width * scale));
    copy.height = Math.max(1, Math.round(canvas.height * scale));
    copy.getContext("2d").drawImage(canvas, 0, 0, copy.width, copy.height);
    return jpegOf(copy);
  }

  async function sendGarmin() {
    try {
      var pack = await renderSheets(true);
      if (!pack) return;
      if (pack.sheets.length > 100) {
        setStatus("GARMIN LIMIT IS 100 IMAGES");
        return;
      }
      var jpegs = [];
      for (var i = 0; i < pack.canvases.length; i++) jpegs.push(await fitJpeg(pack.canvases[i]));
      var bytes = EXO.garmin.kmz(pack.sheets, jpegs);
      saveBytes(bytes, "exopace-garmin.kmz", "application/vnd.google-earth.kmz");
      var skipped = pack.sheets.filter(EXO.garmin.spansDateLine).length;
      setStatus(skipped
        ? "GARMIN KMZ — COPY TO Garmin/CustomMaps — " + skipped + " DATE-LINE PAGE LEFT OUT"
        : "GARMIN KMZ — COPY TO Garmin/CustomMaps");
    } catch (err) {
      setStatus("GARMIN EXPORT FAILED");
    }
  }

  async function sendMbtiles() {
    var sheets = state.sheets.slice();
    if (!sheets.length) {
      setStatus("PICK A PAGE FIRST");
      return;
    }
    try {
      var pack = await EXO.mbtiles.build(sheets, setStatus);
      var how = await shareOrSave(pack.bytes, "exopace-atak.mbtiles", "application/octet-stream");
      var note = "MBTILES z" + pack.zoom + " — " + pack.count + " TILES";
      if (pack.missing) note += " — " + pack.missing + " MISSING";
      note += how === "shared" ? " — PICK ATAK" : " — IMPORT THE FILE IN ATAK";
      setStatus(note);
    } catch (err) {
      setStatus("MBTILES FAILED");
    }
  }

  function flyTo(hit) {
    map.flyTo({ center: [hit.lon, hit.lat], zoom: hit.zoom || 12 });
    setStatus(hit.label || "FOUND");
  }

  function hideSuggest() {
    var list = $("fm-suggest");
    if (!list) return;
    list.hidden = true;
    list.innerHTML = "";
  }

  function showSuggest(rows) {
    var list = $("fm-suggest");
    list.innerHTML = "";
    if (!rows.length) { list.hidden = true; return; }
    rows.forEach(function (row) {
      var li = document.createElement("li");
      var btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = row.label;
      btn.onclick = function () {
        hideSuggest();
        $("fm-q").value = row.label;
        flyTo({ lon: row.lon, lat: row.lat, zoom: 13, label: row.label });
      };
      li.appendChild(btn);
      list.appendChild(li);
    });
    list.hidden = false;
  }

  var suggestTimer = null;
  function queueSuggest() {
    clearTimeout(suggestTimer);
    var q = $("fm-q").value.trim();
    if (EXO.search.parse(q) || q.length < 3) { hideSuggest(); return; }
    suggestTimer = setTimeout(async function () {
      try {
        var res = await fetch("/api/geocode?q=" + encodeURIComponent(q));
        if (!res.ok) return;
        var rows = await res.json();
        if ($("fm-q").value.trim() === q) showSuggest(rows);
      } catch (err) {}
    }, 350);
  }

  async function goSearch(ev) {
    ev.preventDefault();
    var q = $("fm-q").value.trim();
    var hit = null;
    try { hit = EXO.search.parse(q); } catch (err) { setStatus("BAD MGRS"); return; }
    if (hit) { hideSuggest(); flyTo(hit); return; }
    setStatus("SEARCHING");
    try {
      var res = await fetch("/api/geocode?q=" + encodeURIComponent(q));
      var rows = res.ok ? await res.json() : [];
      if (!rows.length) { setStatus("NO MATCH"); hideSuggest(); return; }
      hideSuggest();
      flyTo({ lon: rows[0].lon, lat: rows[0].lat, zoom: 13, label: rows[0].label });
    } catch (err) {
      setStatus("SEARCH FAILED");
    }
  }

  function zoomToPages() {
    if (!state.sheets.length) { setStatus("NO PAGES"); return; }
    var bounds = new maplibregl.LngLatBounds();
    state.sheets.forEach(function (s) {
      bounds.extend([s.sw.lon, s.sw.lat]);
      bounds.extend([s.ne.lon, s.ne.lat]);
      bounds.extend([s.se.lon, s.se.lat]);
      bounds.extend([s.nw.lon, s.nw.lat]);
    });
    map.fitBounds(bounds, { padding: 36, duration: 400 });
  }

  async function saveToCopy() {
    if (!state.offline) {
      setStatus("SHEET SAVE RUNS ON THE VQ COPY");
      return;
    }
    var sheets = state.sheets.slice();
    if (!sheets.length) {
      var c = map.getCenter();
      sheets = [EXO.sheets.at(c.lat, c.lng, state.scale, state.orient)];
    }
    var tiles = [];
    var seen = {};
    sheets.forEach(function (sheet) {
      var box = EXO.sheets.bbox(sheet);
      var z = EXO.print.zoomFor(sheet.scale);
      [z - 1, z, Math.min(15, z + 1)].forEach(function (zz) {
        if (zz < 8) return;
        EXO.terrain.tilesForBbox(zz, box[0], box[1], box[2], box[3]).forEach(function (t) {
          var k = t.join("/");
          if (!seen[k]) { seen[k] = true; tiles.push({ z: t[0], x: t[1], y: t[2] }); }
        });
      });
    });
    if (tiles.length > 800) tiles = tiles.slice(0, 800);
    setStatus("SAVING " + tiles.length + " TILES");
    var res = await fetch("/api/prefetch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tiles: tiles }),
    });
    if (!res.ok) { setStatus("COPY DID NOT SAVE"); return; }
    var data = await res.json();
    setStatus("SAVED " + data.saved + " TILES ON THIS COPY");
  }

  function bind() {
    document.querySelectorAll("[data-key]").forEach(function (group) {
      group.addEventListener("click", function (ev) {
        var btn = ev.target.closest("button");
        if (!btn) return;
        var key = group.getAttribute("data-key");
        var value = btn.getAttribute("data-value");
        if (key.indexOf("layer-") === 0) {
          state.layers[key.slice(6)] = value === "true";
        } else if (key === "series") {
          remember();
          state.series = value;
          if (value !== "letter") state.scale = EXO.sheets.seriesScale(value);
          state.sheets = [];
          state.active = null;
          syncSheets();
        } else if (key === "scale") {
          remember();
          state.series = "letter";
          state.scale = Number(value);
          state.sheets = [];
          state.active = null;
          syncSheets();
        } else if (key === "pitch") {
          map.easeTo({ pitch: value === "3d" ? 58 : 0, bearing: 0, duration: 400 });
        } else {
          state[key] = value;
        }
        if (key === "measure") {
          if (state.measure !== "on") {
            measurePoints = [];
            measureElev = null;
            measureMag = null;
            measureToken += 1;
          }
          if (map && map.getCanvas()) map.getCanvas().style.cursor = state.measure === "on" ? "crosshair" : "";
        }
        applyStyle();
        if (key === "measure" || key === "units") syncMeasure();
        if (key === "contours" || key === "hill" || key === "secondary" || key.indexOf("layer-") === 0) {
          syncGrid();
          syncGraticule();
        }
        if (EXO.overlays && (key.indexOf("layer-") === 0)) EXO.overlays.sync(map, state, setStatus);
      });
    });
    $("fm-locate").onclick = function () {
      if (!navigator.geolocation) { setStatus("NO GPS"); return; }
      navigator.geolocation.getCurrentPosition(function (pos) {
        map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14 });
        setStatus("GPS FIX");
      }, function () { setStatus("NO GPS FIX"); }, { enableHighAccuracy: true, timeout: 8000 });
    };
    $("fm-fit").onclick = zoomToScale;
    $("fm-pages").onclick = zoomToPages;
    $("fm-undo").onclick = undo;
    $("fm-redo").onclick = redo;
    $("fm-fill").onclick = fillView;
    $("fm-clear").onclick = function () {
      remember();
      state.sheets = [];
      state.active = null;
      syncSheets();
      setStatus("PAGES CLEARED");
    };
    $("fm-pdf").onclick = downloadPdf;
    $("fm-atak").onclick = sendAtak;
    $("fm-mbtiles").onclick = sendMbtiles;
    $("fm-garmin").onclick = sendGarmin;
    $("fm-save").onclick = saveToCopy;
    $("fm-go").addEventListener("submit", goSearch);
    $("fm-q").addEventListener("input", queueSuggest);
    $("fm-q").addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") hideSuggest();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.target.closest("input, select, textarea")) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "z") {
        ev.preventDefault();
        if (ev.shiftKey) redo();
        else undo();
        return;
      }
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === "y") {
        ev.preventDefault();
        redo();
        return;
      }
      var sheet = activeSheet();
      if (!sheet) return;
      var de = 0;
      var dn = 0;
      if (ev.key === "ArrowLeft") de = -1000;
      else if (ev.key === "ArrowRight") de = 1000;
      else if (ev.key === "ArrowDown") dn = -1000;
      else if (ev.key === "ArrowUp") dn = 1000;
      else return;
      ev.preventDefault();
      remember();
      var next = EXO.sheets.nudge(sheet, de, dn);
      next = EXO.sheets.snapEdges(next, state.sheets);
      replaceActive(next);
    });
  }

  function wireMap() {
    var hashReady = false;
    map.on("load", function () {
      map.resize();
      map.jumpTo({ center: startView.center, zoom: startView.zoom });
      hashReady = true;
      applyStyle();
      syncSheets();
      syncGrid();
      syncGraticule();
      readout();
      writeHash();
      syncMeasure();
      if (EXO.overlays) EXO.overlays.sync(map, state, setStatus);
    });
    map.on("move", readout);
    map.on("moveend", function () {
      syncGrid();
      syncGraticule();
      if (hashReady) writeHash();
      if (hashReady && EXO.overlays) EXO.overlays.sync(map, state, setStatus);
    });
    map.on("click", function (ev) {
      if (state.measure === "on") {
        if (moved) { moved = false; return; }
        placeMeasure(ev.lngLat.lat, ev.lngLat.lng);
        return;
      }
      if (map.getLayer("ham-point")) {
        var ham = map.queryRenderedFeatures(ev.point, { layers: ["ham-point"] });
        if (ham.length && ham[0].properties && ham[0].properties.label) {
          setStatus(String(ham[0].properties.label));
          return;
        }
      }
      if (moved) { moved = false; return; }
      var id = hitSheet(ev.point);
      if (id && id === state.active) removeSheet(id);
      else if (id) { state.active = id; syncSheets(); }
      else addSheet(ev.lngLat.lat, ev.lngLat.lng);
    });
    map.on("mousedown", function (ev) {
      if (state.measure === "on") return;
      if (ev.originalEvent.shiftKey) {
        map.dragPan.disable();
        box = { a: ev.lngLat, b: ev.lngLat };
        return;
      }
      var id = hitSheet(ev.point);
      if (!id) return;
      state.active = id;
      var sheet = activeSheet();
      var u = EXO.mgrs.utm(ev.lngLat.lat, ev.lngLat.lng, sheet.zone);
      drag = { e: u.easting, n: u.northing, sheet: sheet };
      moved = false;
      map.dragPan.disable();
    });
    map.on("mousemove", function (ev) {
      if (box) box.b = ev.lngLat;
      if (!drag) return;
      if (drag.sheet.kind === "quad") {
        var quad;
        try { quad = EXO.sheets.quadAt(ev.lngLat.lat, ev.lngLat.lng, drag.sheet.series); }
        catch (err) { return; }
        if (quad.id === drag.sheet.id) return;
        if (!moved) remember();
        moved = true;
        replaceActive(quad);
        drag.sheet = quad;
        return;
      }
      var u = EXO.mgrs.utm(ev.lngLat.lat, ev.lngLat.lng, drag.sheet.zone);
      var de = Math.round((u.easting - drag.e) / 1000) * 1000;
      var dn = Math.round((u.northing - drag.n) / 1000) * 1000;
      if (!de && !dn) return;
      if (!moved) remember();
      moved = true;
      var next = EXO.sheets.nudge(drag.sheet, de, dn);
      next = EXO.sheets.snapEdges(next, state.sheets);
      replaceActive(next);
      drag.sheet = next;
      drag.e += de;
      drag.n += dn;
    });
    window.addEventListener("mouseup", function () {
      if (box) {
        var west = Math.min(box.a.lng, box.b.lng);
        var east = Math.max(box.a.lng, box.b.lng);
        var south = Math.min(box.a.lat, box.b.lat);
        var north = Math.max(box.a.lat, box.b.lat);
        box = null;
        map.dragPan.enable();
        if (east - west > 0.001) {
          moved = true;
          fillBounds({
            getWest: function () { return west; },
            getEast: function () { return east; },
            getSouth: function () { return south; },
            getNorth: function () { return north; },
          });
        }
      }
      if (drag) {
        drag = null;
        map.dragPan.enable();
      }
    });
  }

  var emptyPng = Uint8Array.from(atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
  ), function (c) { return c.charCodeAt(0); });

  function packBytes(bytes) {
    if (!bytes || !bytes.byteLength) return emptyPng.buffer;
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function registerProtocols() {
    if (registerProtocols.done || !globalThis.maplibregl) return;
    registerProtocols.done = true;
    function tile(kind, req, abort) {
      var m = String(req.url).match(/(\d+)\/(\d+)\/(\d+)/);
      if (!m) return Promise.resolve({ data: emptyPng.buffer });
      var signal = abort && abort.signal;
      var job = kind === "hill"
        ? EXO.terrain.hillshadePng(Number(m[1]), Number(m[2]), Number(m[3]), signal)
        : EXO.terrain.contourPng(Number(m[1]), Number(m[2]), Number(m[3]), signal);
      return job.then(function (bytes) { return { data: packBytes(bytes) }; }).catch(function () {
        return { data: emptyPng.buffer };
      });
    }
    maplibregl.addProtocol("hill", function (req, abort) { return tile("hill", req, abort); });
    maplibregl.addProtocol("contour", function (req, abort) { return tile("contour", req, abort); });
  }

  async function boot() {
    bind();
    try {
      var host = await fetch("host.json").then(function (r) { return r.json(); });
      state.offline = !!(host && host.offlineHost);
    } catch (err) {
      state.offline = false;
    }
    EXO.offlineHost = state.offline;
    registerProtocols();
    EXO.hill = state.hill;
    EXO.contours = state.contours;
    startView = readHash() || { center: [-98.5, 39.5], zoom: 4 };
    map = new maplibregl.Map({
      container: "fm-map",
      style: EXO.mapStyle.build(),
      center: startView.center,
      zoom: startView.zoom,
      hash: false,
      attributionControl: true,
      maxPitch: 70,
    });
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
    wireMap();
    paintChips();
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    }
    setStatus(state.offline ? "OFFLINE COPY" : "ONLINE");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
