/* Letter sheets use a 160 mm by 200 mm neatline.
   A 1:25,000 portrait sheet is 4 km by 5 km. 1:24,000 on that paper
   is 3.84 km by 4.8 km and is not a USGS quadrangle.
   USGS sheets are latitude/longitude quadrangles. Their printed size
   follows the ground distance at the series scale, then tiles onto letter. */
(function (root) {
  var SCALES = [15000, 24000, 25000, 48000, 50000, 100000, 250000];
  var QUAD_SCALES = [20000, 24000, 25000, 62500, 100000, 250000];
  var NEAT_W_MM = 160;
  var NEAT_H_MM = 200;
  var SERIES = {
    letter: { title: "LETTER" },
    usgs75: { dLat: 7.5 / 60, dLon: 7.5 / 60, scale: 24000, title: "USGS 7.5′" },
    usgs15: { dLat: 15 / 60, dLon: 15 / 60, scale: 62500, title: "USGS 15′" },
    usgs100: { dLat: 0.5, dLon: 1, scale: 100000, title: "USGS 30×60′" },
    usgs250: { dLat: 1, dLon: 2, scale: 250000, title: "USGS 1×2°" },
  };

  function size(scale, orient) {
    if (SCALES.indexOf(scale) < 0 && QUAD_SCALES.indexOf(scale) < 0) throw new Error("unknown scale");
    var wM = NEAT_W_MM * scale / 1000;
    var hM = NEAT_H_MM * scale / 1000;
    if (orient === "landscape") {
      var swap = wM;
      wM = hM;
      hM = swap;
    }
    return { wKm: wM / 1000, hKm: hM / 1000, wM: wM, hM: hM };
  }

  /* Missing lat/lon must stay missing. Number(null) is 0, which is a real place. */
  function viewFromHash(hash) {
    var q = new URLSearchParams(String(hash || "").replace(/^#/, ""));
    if (!q.has("lat") || !q.has("lon")) return null;
    var latText = q.get("lat");
    var lonText = q.get("lon");
    if (!latText || !lonText) return null;
    var lat = Number(latText);
    var lon = Number(lonText);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    var zoom = 12;
    if (q.has("z") && q.get("z")) {
      var z = Number(q.get("z"));
      if (Number.isFinite(z)) zoom = Math.min(22, Math.max(0, z));
    }
    return { center: [lon, lat], zoom: zoom };
  }

  /* 120 dpi print. 160 mm is 756 px. Ground meters per pixel follows the scale. */
  function paper(scale, orient) {
    var ground = size(scale, orient);
    var dpi = 120;
    var neatWmm = ground.wM / scale * 1000;
    var neatHmm = ground.hM / scale * 1000;
    return {
      dpi: dpi,
      neatWmm: neatWmm,
      neatHmm: neatHmm,
      neatWpx: Math.round(neatWmm * dpi / 25.4),
      neatHpx: Math.round(neatHmm * dpi / 25.4),
    };
  }

  function make(zone, hemi, e0, n0, scale, orient) {
    var ground = size(scale, orient);
    var mgrs = root.EXO.mgrs;
    var sw = mgrs.utmInverse(zone, hemi, e0, n0);
    var se = mgrs.utmInverse(zone, hemi, e0 + ground.wM, n0);
    var ne = mgrs.utmInverse(zone, hemi, e0 + ground.wM, n0 + ground.hM);
    var nw = mgrs.utmInverse(zone, hemi, e0, n0 + ground.hM);
    var mid = mgrs.utmInverse(zone, hemi, e0 + ground.wM / 2, n0 + ground.hM / 2);
    var id = zone + hemi + ":" + e0 + ":" + n0 + ":" + scale + ":" + orient;
    var name = "";
    try {
      name = mgrs.forward(sw.lon, sw.lat, 2);
    } catch (err) {
      name = zone + hemi;
    }
    return {
      id: id,
      zone: zone,
      hemi: hemi,
      e0: e0,
      n0: n0,
      scale: scale,
      orient: orient,
      wM: ground.wM,
      hM: ground.hM,
      name: name,
      sw: sw,
      se: se,
      ne: ne,
      nw: nw,
      mid: mid,
    };
  }

  function at(lat, lon, scale, orient) {
    var u = root.EXO.mgrs.utm(lat, lon);
    var ground = size(scale, orient);
    var e0 = Math.floor(u.easting / ground.wM) * ground.wM;
    var n0 = Math.floor(u.northing / ground.hM) * ground.hM;
    return make(u.zone, u.hemi, e0, n0, scale, orient);
  }

  function nudge(sheet, de, dn) {
    if (sheet.kind === "quad") {
      var spec = SERIES[sheet.series];
      var south = sheet.south;
      var west = sheet.west;
      if (dn > 0) south += spec.dLat;
      if (dn < 0) south -= spec.dLat;
      if (de > 0) west += spec.dLon;
      if (de < 0) west -= spec.dLon;
      return quadMake(sheet.series, south, west);
    }
    return make(sheet.zone, sheet.hemi, sheet.e0 + de, sheet.n0 + dn, sheet.scale, sheet.orient);
  }

  function ring(sheet) {
    return [
      [sheet.sw.lon, sheet.sw.lat],
      [sheet.se.lon, sheet.se.lat],
      [sheet.ne.lon, sheet.ne.lat],
      [sheet.nw.lon, sheet.nw.lat],
      [sheet.sw.lon, sheet.sw.lat],
    ];
  }

  function bbox(sheet) {
    var lons = [sheet.sw.lon, sheet.se.lon, sheet.ne.lon, sheet.nw.lon];
    var lats = [sheet.sw.lat, sheet.se.lat, sheet.ne.lat, sheet.nw.lat];
    return [
      Math.min.apply(null, lons),
      Math.min.apply(null, lats),
      Math.max.apply(null, lons),
      Math.max.apply(null, lats),
    ];
  }

  function floorStep(value, step) {
    var arc = Math.round(step * 3600);
    var ticks = Math.round(value * 3600);
    return Math.floor(ticks / arc) * arc / 3600;
  }

  function inAlaska(lat, lon) {
    if (lat < 51 || lat > 72) return false;
    if (lon <= -129 && lon >= -180) return true;
    if (lon >= 170 && lon <= 180) return true;
    return false;
  }

  function inPuertoRico(lat, lon) {
    return lat >= 17.8 && lat <= 18.6 && lon >= -67.5 && lon <= -65.2;
  }

  function meridionalMeters(south, north) {
    var mid = (south + north) / 2 * Math.PI / 180;
    var perDeg = 111132.92 - 559.82 * Math.cos(2 * mid) + 1.175 * Math.cos(4 * mid);
    return perDeg * (north - south);
  }

  function parallelMeters(west, east, lat) {
    var phi = lat * Math.PI / 180;
    var perDeg = 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi);
    return Math.abs(perDeg * (east - west));
  }

  function degText(deg, pos, neg) {
    var hemi = deg < 0 ? neg : pos;
    var abs = Math.abs(deg);
    var degrees = Math.floor(abs + 1e-8);
    var minutes = (abs - degrees) * 60;
    var shown = Math.abs(minutes - Math.round(minutes)) < 0.02 ? String(Math.round(minutes)) : minutes.toFixed(1);
    return degrees + "°" + shown + "′" + hemi;
  }

  function seriesSpec(series) {
    return SERIES[series] || null;
  }

  function seriesScale(series) {
    var spec = SERIES[series];
    return spec && spec.scale ? spec.scale : 50000;
  }

  function seriesTitle(series) {
    var spec = SERIES[series];
    if (!spec || series === "letter") return "LETTER";
    return spec.title + "  1:" + spec.scale.toLocaleString("en-US");
  }

  function seriesNote(series) {
    var scan = " FIND USGS SCAN opens the USGS GeoPDF of that paper map, collar included. SHOW crops that year's scan to this cell, using the sharpest overview under about 1.2 MB. The link keeps that year. Print draws it in the neatline. The collar names the next cell on each side by that cell's corner. A cell past the sheet grid is omitted. A WGS84 sheet uses transverse mercator. A CONUS NAD27 polyconic sheet is shifted with the published three-parameter datum. Any other projection stays off the map. Neither replaces these letter tiles.";
    if (series === "usgs75") {
      return "A 7.5′ quadrangle is 7.5 minutes of latitude by 7.5 minutes of longitude. The conterminous United States and Hawaii use 1:24,000. Alaska uses 1:25,000. Puerto Rico uses 1:20,000. The sheet uses the National Map name when that cell has the same edges. The PDF splits that quadrangle into US Letter pages at true scale." + scan;
    }
    if (series === "usgs15") {
      return "A 15′ quadrangle is 15 minutes on a side, at 1:62,500. USGS ended this series. The sheet uses the National Map name when that cell has the same edges. The PDF splits it into US Letter pages at true scale." + scan;
    }
    if (series === "usgs100") {
      return "A 30×60′ quadrangle is 30 minutes of latitude by 60 minutes of longitude, at 1:100,000. The sheet uses the National Map name when that cell has the same edges. The PDF splits that cell into US Letter pages at true scale." + scan;
    }
    if (series === "usgs250") {
      return "A 1×2° quadrangle is 1 degree of latitude by 2 degrees of longitude, at 1:250,000. The National Map degree index is 1° by 1°, so this sheet keeps the corner label. The PDF splits that cell into US Letter pages at true scale." + scan;
    }
    return "Each letter scale uses the same 160 mm by 200 mm neatline. 1:24k is 3.84 km by 4.8 km. It is not a USGS quadrangle.";
  }

  function quadScale(series, lat, lon) {
    if (series === "usgs75" && inAlaska(lat, lon)) return 25000;
    if (series === "usgs75" && inPuertoRico(lat, lon)) return 20000;
    return seriesScale(series);
  }

  function quadMake(series, south, west) {
    var spec = SERIES[series];
    if (!spec || !spec.dLat) throw new Error("unknown series");
    south = Math.round(south * 3600) / 3600;
    west = Math.round(west * 3600) / 3600;
    var north = Math.round((south + spec.dLat) * 3600) / 3600;
    var east = Math.round((west + spec.dLon) * 3600) / 3600;
    if (south < -80 || north > 84) throw new Error("polar UPS is not on these sheets");
    if (east > 180 || west < -180) throw new Error("outside the sheet grid");
    var midLat = (south + north) / 2;
    var midLon = (west + east) / 2;
    var scale = quadScale(series, midLat, midLon);
    var sw = { lat: south, lon: west };
    var se = { lat: south, lon: east };
    var ne = { lat: north, lon: east };
    var nw = { lat: north, lon: west };
    var mid = { lat: midLat, lon: midLon };
    var u = root.EXO.mgrs.utm(midLat, midLon);
    var usw = root.EXO.mgrs.utm(south, west, u.zone);
    var hM = meridionalMeters(south, north);
    var wM = parallelMeters(west, east, midLat);
    return {
      id: "Q:" + series + ":" + Math.round(south * 3600) + ":" + Math.round(west * 3600),
      kind: "quad",
      series: series,
      zone: u.zone,
      hemi: u.hemi,
      e0: usw.easting,
      n0: usw.northing,
      scale: scale,
      orient: "portrait",
      wM: wM,
      hM: hM,
      south: south,
      west: west,
      north: north,
      east: east,
      name: spec.title + " " + degText(south, "N", "S") + " " + degText(Math.abs(west) < 1e-8 ? 0 : west, "E", "W"),
      sw: sw,
      se: se,
      ne: ne,
      nw: nw,
      mid: mid,
    };
  }

  function cornerText(south, west) {
    var lon = Math.abs(west) < 1e-8 ? 0 : west;
    return degText(south, "N", "S") + " " + degText(lon, "E", "W");
  }

  /* The eight cells that share an edge or a corner. A cell past the grid is omitted. */
  function adjoins(sheet) {
    if (!sheet || sheet.kind !== "quad") return [];
    var spec = SERIES[sheet.series];
    if (!spec || !spec.dLat) return [];
    var slots = [
      ["N", 1, 0],
      ["NE", 1, 1],
      ["E", 0, 1],
      ["SE", -1, 1],
      ["S", -1, 0],
      ["SW", -1, -1],
      ["W", 0, -1],
      ["NW", 1, -1],
    ];
    var out = [];
    slots.forEach(function (slot) {
      try {
        var next = quadMake(sheet.series, sheet.south + slot[1] * spec.dLat, sheet.west + slot[2] * spec.dLon);
        out.push({
          side: slot[0],
          id: next.id,
          name: next.name,
          corner: cornerText(next.south, next.west),
          south: next.south,
          west: next.west,
          north: next.north,
          east: next.east,
        });
      } catch (err) {}
    });
    return out;
  }

  function adjoinLines(sheet) {
    var by = {};
    adjoins(sheet).forEach(function (cell) { by[cell.side] = cell.corner; });
    function pair(a, b) {
      var parts = [];
      if (by[a]) parts.push(a + " " + by[a]);
      if (by[b]) parts.push(b + " " + by[b]);
      return parts.join("  ·  ");
    }
    return [pair("N", "S"), pair("E", "W")].filter(Boolean);
  }

  function quadAt(lat, lon, series) {
    var spec = SERIES[series];
    if (!spec || !spec.dLat) throw new Error("unknown series");
    return quadMake(series, floorStep(lat, spec.dLat), floorStep(lon, spec.dLon));
  }

  function quadIndexLayer(series) {
    if (series === "usgs75") return 10;
    if (series === "usgs15") return 9;
    if (series === "usgs100") return 8;
    return 0;
  }

  function quadExtentFits(sheet, west, south, east, north) {
    if (!sheet || sheet.kind !== "quad") return false;
    if (![west, south, east, north].every(function (n) { return Number.isFinite(n); })) return false;
    var tol = 0.02;
    return Math.abs(sheet.west - west) <= tol
      && Math.abs(sheet.south - south) <= tol
      && Math.abs(sheet.east - east) <= tol
      && Math.abs(sheet.north - north) <= tol;
  }

  function quadFromArc(series, southArc, westArc) {
    if (!SERIES[series] || !SERIES[series].dLat) throw new Error("unknown series");
    if (!Number.isFinite(southArc) || !Number.isFinite(westArc)) throw new Error("bad quad");
    var spec = SERIES[series];
    var stepLat = Math.round(spec.dLat * 3600);
    var stepLon = Math.round(spec.dLon * 3600);
    if (southArc % stepLat !== 0 || westArc % stepLon !== 0) throw new Error("off the quadrangle grid");
    return quadMake(series, southArc / 3600, westArc / 3600);
  }

  /* UTM letter tiles that cover a quadrangle at its true scale. */
  function letterTiles(quad) {
    if (!quad || quad.kind !== "quad") return [quad];
    var ground = size(quad.scale, "portrait");
    var sw = root.EXO.mgrs.utm(quad.sw.lat, quad.sw.lon);
    var corners = [quad.sw, quad.se, quad.ne, quad.nw];
    var eastings = [];
    var northings = [];
    corners.forEach(function (ll) {
      var u = root.EXO.mgrs.utm(ll.lat, ll.lon, sw.zone);
      eastings.push(u.easting);
      northings.push(u.northing);
    });
    var e0 = Math.floor(Math.min.apply(null, eastings) / ground.wM) * ground.wM;
    var n0 = Math.floor(Math.min.apply(null, northings) / ground.hM) * ground.hM;
    var eEnd = Math.max.apply(null, eastings);
    var nEnd = Math.max.apply(null, northings);
    var tiles = [];
    var guard = 0;
    for (var n = n0; n < nEnd - 0.5 && guard < 48; n += ground.hM) {
      for (var e = e0; e < eEnd - 0.5 && guard < 48; e += ground.wM) {
        guard += 1;
        var tile = make(sw.zone, sw.hemi, e, n, quad.scale, "portrait");
        var box = bbox(tile);
        if (box[2] < quad.west || box[0] > quad.east || box[3] < quad.south || box[1] > quad.north) continue;
        tile.quadName = quad.mapName ? quad.mapName + " · " + quad.name : quad.name;
        tile.quadId = quad.id;
        tile.adjoinLines = adjoinLines(quad);
        tile.tileLabel = "R" + (Math.round((n - n0) / ground.hM) + 1) + "C" + (Math.round((e - e0) / ground.wM) + 1);
        tiles.push(tile);
      }
    }
    return tiles;
  }

  function encodeSheet(sheet) {
    if (sheet.kind === "quad") {
      return ["Q", sheet.series, Math.round(sheet.south * 3600), Math.round(sheet.west * 3600)].join(":");
    }
    return [sheet.zone, sheet.hemi, sheet.e0, sheet.n0, sheet.scale, sheet.orient].join(":");
  }

  function decodeSheet(part, fallbackScale, fallbackOrient) {
    var b = String(part || "").split(":");
    if (b[0] === "Q") return quadFromArc(b[1], Number(b[2]), Number(b[3]));
    if (b.length < 6) throw new Error("bad sheet");
    var sheetScale = Number(b[4]);
    if (SCALES.indexOf(sheetScale) < 0) sheetScale = fallbackScale;
    var orient = b[5] === "landscape" || b[5] === "portrait" ? b[5] : fallbackOrient;
    return make(Number(b[0]), b[1], Number(b[2]), Number(b[3]), sheetScale, orient);
  }

  /* Snap a moved southwest corner onto a neighbour edge when it is within 250 m. */
  function snapEdges(sheet, others) {
    if (sheet.kind === "quad") return sheet;
    var e0 = sheet.e0;
    var n0 = sheet.n0;
    for (var i = 0; i < others.length; i++) {
      var o = others[i];
      if (o.id === sheet.id || o.zone !== sheet.zone) continue;
      if (Math.abs(e0 - (o.e0 + o.wM)) < 250) e0 = o.e0 + o.wM;
      if (Math.abs(e0 + sheet.wM - o.e0) < 250) e0 = o.e0 - sheet.wM;
      if (Math.abs(n0 - (o.n0 + o.hM)) < 250) n0 = o.n0 + o.hM;
      if (Math.abs(n0 + sheet.hM - o.n0) < 250) n0 = o.n0 - sheet.hM;
    }
    if (e0 === sheet.e0 && n0 === sheet.n0) return sheet;
    return make(sheet.zone, sheet.hemi, e0, n0, sheet.scale, sheet.orient);
  }

  root.EXO = root.EXO || {};
  root.EXO.sheets = {
    size: size,
    paper: paper,
    make: make,
    at: at,
    nudge: nudge,
    ring: ring,
    bbox: bbox,
    snapEdges: snapEdges,
    scales: SCALES,
    viewFromHash: viewFromHash,
    seriesSpec: seriesSpec,
    seriesScale: seriesScale,
    seriesTitle: seriesTitle,
    seriesNote: seriesNote,
    quadAt: quadAt,
    adjoins: adjoins,
    adjoinLines: adjoinLines,
    quadIndexLayer: quadIndexLayer,
    quadExtentFits: quadExtentFits,
    quadFromArc: quadFromArc,
    letterTiles: letterTiles,
    encodeSheet: encodeSheet,
    decodeSheet: decodeSheet,
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.sheets;
})(typeof globalThis !== "undefined" ? globalThis : this);
