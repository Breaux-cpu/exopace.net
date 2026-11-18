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
  var measureToken = 0;
  var topoToken = 0;
  var topoFor = "";

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
    dropStaleTopo();
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
    if (measurePoints.length >= 2) {
      var line = EXO.measure.routeLine(measurePoints);
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

  function mgrsText(point) {
    try { return EXO.mgrs.format(point.lon, point.lat); }
    catch (err) { return ""; }
  }

  function measureLegs() {
    var legs = [];
    for (var i = 1; i < measurePoints.length; i++) {
      var from = measurePoints[i - 1];
      var to = measurePoints[i];
      var conv = EXO.mgrs.convergence(from.lat, from.lon);
      var decl = from.declKnown ? from.decl : null;
      legs.push(EXO.measure.solve(from.lat, from.lon, to.lat, to.lon, conv, decl));
    }
    return legs;
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
      el.textContent = "CLICK THE NEXT POINT";
      return;
    }
    var a = measurePoints[measurePoints.length - 2];
    var b = measurePoints[measurePoints.length - 1];
    var legs;
    try {
      legs = measureLegs();
    } catch (err) {
      el.textContent = "OUTSIDE THE MEASURE GRID";
      return;
    }
    var result = legs[legs.length - 1];
    if (!result && measurePoints.length === 2) {
      el.textContent = "NO GEODETIC SOLUTION";
      return;
    }
    if (result && result.distanceM === 0 && measurePoints.length === 2) {
      el.textContent = "SAME POINT";
      return;
    }
    var lines = [];
    for (var i = 0; i < legs.length; i++) {
      var leg = legs[i];
      var from = measurePoints[i];
      var head = legs.length > 1 ? "LEG " + (i + 1) + "  ·  " : "";
      if (!leg) {
        lines.push(head + "NO GEODETIC SOLUTION");
        continue;
      }
      if (leg.distanceM === 0) {
        lines.push(head + "SAME POINT");
        continue;
      }
      var zone;
      try { zone = EXO.mgrs.zoneFor(from.lat, from.lon); }
      catch (err) { zone = ""; }
      lines.push(head + EXO.measure.formatDistance(leg.distanceM, state.units));
      if (leg.trueAz != null) {
        lines.push("TRUE " + EXO.measure.azText(leg.trueAz) + "  ·  GRID " + EXO.measure.azText(leg.gridAz) + (zone === "" ? "" : " Z" + zone));
        lines.push(leg.magAz == null ? "MAG — CHART" : "MAG " + EXO.measure.azText(leg.magAz));
        lines.push("BACK " + EXO.measure.azText(leg.backTrue));
      }
    }
    if (legs.length > 1) {
      var total = EXO.measure.totalDistance(legs);
      if (total != null) lines.push("TOTAL " + EXO.measure.formatDistance(total, state.units));
    }
    var startGrid = mgrsText(a);
    var endGrid = mgrsText(b);
    if (startGrid) lines.push("START " + startGrid);
    if (endGrid) lines.push("END " + endGrid);
    if (result && Number.isFinite(a.elev) && Number.isFinite(b.elev)) {
      lines.push(elevText(a.elev, b.elev));
      var grade = EXO.measure.slope(result.distanceM, b.elev - a.elev);
      if (grade) {
        lines.push("SLOPE " + (grade.degrees > 0 ? "+" : "") + grade.degrees.toFixed(1) + "°  ·  "
          + (grade.percent > 0 ? "+" : "") + grade.percent.toFixed(1) + "%  ·  PATH "
          + EXO.measure.formatDistance(grade.pathM, state.units));
      }
    }
    el.textContent = lines.join("\n");
  }

  function loadMeasureExtra() {
    var token = ++measureToken;
    var jobs = [];
    measurePoints.forEach(function (point, index) {
      if (!point.elevKnown) {
        jobs.push(EXO.terrain.sample(point.lat, point.lon).then(function (elev) {
          return { index: index, elev: elev };
        }, function () {
          return { index: index, elev: null };
        }));
      }
      if (index < measurePoints.length - 1 && !point.declKnown) {
        jobs.push(EXO.print.magDecl(point.lat, point.lon).then(function (decl) {
          return { index: index, decl: decl };
        }, function () {
          return { index: index, decl: null };
        }));
      }
    });
    if (!jobs.length) return;
    Promise.all(jobs).then(function (rows) {
      if (token !== measureToken) return;
      rows.forEach(function (row) {
        var point = measurePoints[row.index];
        if (!point) return;
        if (Object.prototype.hasOwnProperty.call(row, "elev")) {
          point.elev = row.elev;
          point.elevKnown = true;
        }
        if (Object.prototype.hasOwnProperty.call(row, "decl")) {
          point.decl = row.decl;
          point.declKnown = true;
        }
      });
      paintMeasure();
    });
  }

  function syncMeasure() {
    var src = map && map.getSource("measure");
    if (src) src.setData(measureFC());
    paintMeasure();
    if (map) writeHash();
    if (state.measure === "on" && measurePoints.length >= 2) loadMeasureExtra();
  }

  function placeMeasure(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -80 || lat > 84) {
      setStatus("OUTSIDE THE MEASURE GRID");
      return;
    }
    if (measurePoints.length >= 24) {
      setStatus("24 POINT LIMIT");
      return;
    }
    measurePoints.push({ lat: lat, lon: lon, elev: null, elevKnown: false, decl: null, declKnown: false });
    measureToken += 1;
    syncMeasure();
  }

  function clearRoute() {
    measurePoints = [];
    measureToken += 1;
    syncMeasure();
    setStatus(state.measure === "on" ? "ROUTE CLEARED" : "MEASURE OFF");
  }

  function downloadGpx() {
    if (measurePoints.length < 2) {
      setStatus("CLICK TWO POINTS");
      return;
    }
    var body = EXO.measure.gpx(measurePoints.map(function (point) {
      return {
        lat: point.lat,
        lon: point.lon,
        elev: point.elevKnown ? point.elev : null,
        name: mgrsText(point),
      };
    }));
    saveBytes(new TextEncoder().encode(body), "exopace-route.gpx", "application/gpx+xml");
    setStatus("ROUTE GPX");
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
    var route = EXO.measure.encodeRoute(measurePoints);
    if (route) q.set("route", route);
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
    var decoded = EXO.measure.decodeRoute(q.get("route"));
    if (decoded.length) {
      measurePoints = decoded.map(function (point) {
        return { lat: point.lat, lon: point.lon, elev: null, elevKnown: false, decl: null, declKnown: false };
      });
      state.measure = "on";
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
        route: measurePoints.length >= 2 ? measurePoints.map(function (p) {
          return { lat: p.lat, lon: p.lon };
        }) : null,
      }));
    }
    return { sheets: sheets, canvases: canvases };
  }

  function routeNote(pack, base) {
    var marked = pack && pack.canvases && pack.canvases.some(function (canvas) { return canvas.exoRoute; });
    return marked ? base + " — ROUTE ON THE PAGE" : base;
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
      setStatus(routeNote(pack, "PDF READY — PRINT AT ACTUAL SIZE"));
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
      var route = measurePoints.length >= 2 ? measurePoints.map(function (point) {
        return { lat: point.lat, lon: point.lon };
      }) : null;
      var bytes = await EXO.atak.kmz(pack.sheets, jpegs, route);
      var how = await shareOrSave(bytes, "exopace-field-map.kmz", "application/vnd.google-earth.kmz");
      var note = route ? " — ROUTE LINE IN THE FILE" : "";
      if (how === "shared") setStatus(routeNote(pack, "SHARE SHEET — PICK ATAK") + note);
      else if (how === "saved") setStatus(routeNote(pack, "KMZ SAVED — OPEN IT IN ATAK") + note);
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
      setStatus(routeNote(pack, skipped
        ? "GARMIN KMZ — COPY TO Garmin/CustomMaps — " + skipped + " DATE-LINE PAGE LEFT OUT"
        : "GARMIN KMZ — COPY TO Garmin/CustomMaps"));
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

  function paintTopoMessage(message) {
    var out = $("fm-topo-out");
    if (!out) return;
    out.replaceChildren();
    var p = document.createElement("p");
    p.className = "fm-note";
    p.textContent = message;
    out.appendChild(p);
  }

  function clearScanLayer() {
    if (!map) return;
    try {
      if (map.getLayer("usgs-scan")) map.removeLayer("usgs-scan");
      if (map.getSource("usgs-scan")) map.removeSource("usgs-scan");
    } catch (err) {}
  }

  function resetTopo(message) {
    topoToken += 1;
    topoFor = "";
    clearScanLayer();
    paintTopoMessage(message || "Pick a USGS quadrangle, then find its scan.");
  }

  function dropStaleTopo() {
    if (!topoFor) return;
    var sheet = activeSheet();
    var id = sheet ? sheet.id : "";
    if (id !== topoFor) resetTopo("The selected page changed. Find the scan again.");
  }

  function paintTopo(sheet, rows) {
    var out = $("fm-topo-out");
    if (!out) return;
    out.replaceChildren();
    var name = rows[0].name || sheet.name;
    var head = document.createElement("p");
    head.className = "fm-note";
    head.textContent = name + " · 1:" + Number(sheet.scale).toLocaleString("en-US");
    out.appendChild(head);
    var links = document.createElement("div");
    links.className = "fm-row";
    rows.forEach(function (item) {
      var a = document.createElement("a");
      a.className = "fm-btn";
      a.href = item.pdf;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = item.year + " SCAN";
      links.appendChild(a);
    });
    var show = document.createElement("button");
    show.type = "button";
    show.className = "fm-btn";
    show.textContent = "SHOW " + rows[0].year + " ON MAP";
    show.onclick = function () { showScan(rows[0]); };
    links.appendChild(show);
    var hide = document.createElement("button");
    hide.type = "button";
    hide.className = "fm-btn";
    hide.textContent = "HIDE SCAN";
    hide.onclick = function () {
      clearScanLayer();
      setStatus("SCAN HIDDEN");
    };
    links.appendChild(hide);
    out.appendChild(links);
    if (rows[0].preview) {
      var img = document.createElement("img");
      img.className = "fm-topo-scan";
      img.alt = "Thumbnail of the " + rows[0].year + " USGS scan of " + name;
      img.src = rows[0].preview;
      out.appendChild(img);
    }
    var note = document.createElement("p");
    note.className = "fm-note";
    note.textContent = "Each year opens the USGS GeoPDF, collar included. SHOW ON MAP places the newest scan from that file's GeoTIFF registration. The collar hangs outside the quadrangle. The letter-tile PDF is unchanged.";
    out.appendChild(note);
  }

  async function findTopo() {
    var sheet = activeSheet();
    if (!sheet || sheet.kind !== "quad" || !EXO.topo) {
      resetTopo("Pick a USGS quadrangle. A letter page is not a paper scan.");
      setStatus("NOT A USGS QUADRANGLE");
      return;
    }
    var extent = EXO.topo.queryExtent(sheet.series);
    if (!extent) {
      resetTopo("This sheet has no USGS scan lookup.");
      setStatus("NO USGS SCAN");
      return;
    }
    var token = ++topoToken;
    topoFor = sheet.id;
    setStatus("USGS CATALOGUE");
    var bbox = [sheet.west, sheet.south, sheet.east, sheet.north].map(function (n) {
      return Number(n).toFixed(6);
    }).join(",");
    var items = [];
    var total = Infinity;
    var truncated = false;
    try {
      for (var offset = 0; offset < total && offset < 200; offset += 50) {
        var url = "https://tnmaccess.nationalmap.gov/api/v1/products?datasets="
          + encodeURIComponent("Historical Topographic Maps")
          + "&bbox=" + encodeURIComponent(bbox)
          + "&q=" + encodeURIComponent(extent)
          + "&max=50&offset=" + offset;
        var res = await fetch(url);
        if (!res.ok) throw new Error("catalogue");
        var data = await res.json();
        if (token !== topoToken) return;
        total = Number(data.total);
        if (!Number.isFinite(total)) total = 0;
        var batch = data.items || [];
        items = items.concat(batch);
        if (!batch.length) break;
      }
      if (total > items.length) truncated = true;
    } catch (err) {
      if (token !== topoToken) return;
      setStatus("USGS CATALOGUE UNREACHABLE");
      paintTopoMessage("The USGS catalogue did not answer. Nothing was invented.");
      return;
    }
    if (token !== topoToken) return;
    var rows = EXO.topo.editions(sheet, items);
    if (!rows.length) {
      setStatus("NO USGS SCAN");
      paintTopoMessage("No scanned sheet matched this cell.");
      return;
    }
    paintTopo(sheet, rows);
    setStatus(truncated ? "USGS SCAN " + rows[0].year + " · CATALOGUE TRUNCATED" : "USGS SCAN " + rows[0].year);
  }

  async function jpegTile(bytes) {
    var copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    return createImageBitmap(new Blob([copy], { type: "image/jpeg" }));
  }

  async function showScan(row) {
    var sheet = activeSheet();
    if (!sheet || sheet.kind !== "quad" || !row || !map || !EXO.topo) {
      setStatus("NOT A USGS QUADRANGLE");
      return;
    }
    var tif = EXO.topo.geotiffUrl(row.pdf);
    if (!tif) {
      setStatus("NO GEOTIFF FOR THIS SCAN");
      return;
    }
    var token = topoToken;
    var sheetId = sheet.id;
    topoFor = sheetId;
    setStatus("READING SCAN REGISTRATION");
    try {
      var head = await fetch(tif, { headers: { Range: "bytes=0-65535" } });
      if (token !== topoToken || activeSheetId() !== sheetId) return;
      if (!head.ok && head.status !== 206) throw new Error("header");
      var headerBytes = new Uint8Array(await head.arrayBuffer());
      if (headerBytes.length > 2000000) throw new Error("header");
      var reg = EXO.topo.registration(headerBytes);
      if (!reg) {
        setStatus("SCAN NOT PLACED");
        return;
      }
      if (!EXO.topo.covers(sheet, reg.corners)) {
        setStatus("SCAN DOES NOT COVER THIS CELL");
        return;
      }
      var start = reg.overview.tiles[0].offset;
      var end = start;
      reg.overview.tiles.forEach(function (tile) {
        if (tile.offset < start) start = tile.offset;
        var tileEnd = tile.offset + tile.length;
        if (tileEnd > end) end = tileEnd;
      });
      if (end - start > 1500000 || end <= start) throw new Error("span");
      setStatus("LOADING SCAN");
      var body = await fetch(tif, { headers: { Range: "bytes=" + start + "-" + (end - 1) } });
      if (token !== topoToken || activeSheetId() !== sheetId) return;
      if (!body.ok && body.status !== 206) throw new Error("tiles");
      var buf = new Uint8Array(await body.arrayBuffer());
      if (buf.length !== end - start) throw new Error("short");
      var canvas = document.createElement("canvas");
      canvas.width = reg.overview.width;
      canvas.height = reg.overview.height;
      var ctx = canvas.getContext("2d");
      var cols = Math.ceil(reg.overview.width / reg.overview.tileWidth);
      for (var i = 0; i < reg.overview.tiles.length; i++) {
        var tile = reg.overview.tiles[i];
        var slice = buf.subarray(tile.offset - start, tile.offset - start + tile.length);
        if (slice[0] !== 255 || slice[1] !== 216) throw new Error("jpeg");
        var bitmap = await jpegTile(slice);
        ctx.drawImage(bitmap, (i % cols) * reg.overview.tileWidth, Math.floor(i / cols) * reg.overview.tileHeight);
        if (bitmap.close) bitmap.close();
      }
      if (token !== topoToken || activeSheetId() !== sheetId) return;
      clearScanLayer();
      var before = map.getLayer("sheets-fill") ? "sheets-fill" : undefined;
      map.addSource("usgs-scan", {
        type: "image",
        url: canvas.toDataURL("image/jpeg", 0.82),
        coordinates: reg.corners,
      });
      map.addLayer({
        id: "usgs-scan",
        type: "raster",
        source: "usgs-scan",
        paint: { "raster-opacity": 0.92 },
      }, before);
      setStatus("SCAN ON MAP · " + row.year);
    } catch (err) {
      if (token !== topoToken) return;
      clearScanLayer();
      setStatus("SCAN IMAGE UNREAD");
    }
  }

  function activeSheetId() {
    var sheet = activeSheet();
    return sheet ? sheet.id : "";
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
    $("fm-route-clear").onclick = clearRoute;
    $("fm-gpx").onclick = downloadGpx;
    $("fm-topo").onclick = findTopo;
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
      if (map.getCanvas()) map.getCanvas().style.cursor = state.measure === "on" ? "crosshair" : "";
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
    try {
      map = new maplibregl.Map({
        container: "fm-map",
        style: EXO.mapStyle.build(),
        center: startView.center,
        zoom: startView.zoom,
        hash: false,
        attributionControl: true,
        maxPitch: 70,
      });
    } catch (err) {
      setStatus("MAP FAILED");
      return;
    }
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
