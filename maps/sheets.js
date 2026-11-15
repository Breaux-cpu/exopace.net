/* Letter sheets. The neatline is always 160 mm by 200 mm.
   A 1:25,000 portrait sheet is 4 km by 5 km. 1:24,000 is the same
   paper, 3.84 km by 4.8 km, and is not a USGS quadrangle. */
(function (root) {
  var SCALES = [15000, 24000, 25000, 48000, 50000, 100000, 250000];
  var NEAT_W_MM = 160;
  var NEAT_H_MM = 200;

  function size(scale, orient) {
    if (SCALES.indexOf(scale) < 0) throw new Error("unknown scale");
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

  /* Snap a moved southwest corner onto a neighbour edge when it is within 250 m. */
  function snapEdges(sheet, others) {
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
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.sheets;
})(typeof globalThis !== "undefined" ? globalThis : this);
