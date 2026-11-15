/* Garmin Custom Map KMZ. Copy the file to Garmin/CustomMaps on the unit.
   Each JPEG is scaled to at most 1024 px. This file has not been loaded on a Garmin. */
(function (root) {
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function spansDateLine(sheet) {
    var lons = [sheet.sw.lon, sheet.se.lon, sheet.ne.lon, sheet.nw.lon];
    return Math.max.apply(null, lons) - Math.min.apply(null, lons) > 180;
  }

  function box(sheet) {
    var lats = [sheet.sw.lat, sheet.se.lat, sheet.ne.lat, sheet.nw.lat];
    var lons = [sheet.sw.lon, sheet.se.lon, sheet.ne.lon, sheet.nw.lon];
    return {
      north: Math.max.apply(null, lats),
      south: Math.min.apply(null, lats),
      east: Math.max.apply(null, lons),
      west: Math.min.apply(null, lons),
    };
  }

  function kmz(sheets, jpegs) {
    var parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>',
      "<name>EXOpace Custom Map</name>",
    ];
    var files = [];
    sheets.forEach(function (sheet, i) {
      if (spansDateLine(sheet)) return;
      var b = box(sheet);
      var turn = root.EXO.mgrs.convergence(sheet.mid.lat, sheet.mid.lon, sheet.zone);
      var href = "files/tile-" + i + ".jpg";
      parts.push("<GroundOverlay><name>" + esc(sheet.name + " 1:" + sheet.scale) + "</name>");
      parts.push("<drawOrder>" + (i + 1) + "</drawOrder>");
      parts.push("<Icon><href>" + href + "</href></Icon><LatLonBox>");
      parts.push("<north>" + b.north.toFixed(6) + "</north>");
      parts.push("<south>" + b.south.toFixed(6) + "</south>");
      parts.push("<east>" + b.east.toFixed(6) + "</east>");
      parts.push("<west>" + b.west.toFixed(6) + "</west>");
      parts.push("<rotation>" + turn.toFixed(3) + "</rotation>");
      parts.push("</LatLonBox></GroundOverlay>");
      files.push({ name: href, bytes: jpegs[i] });
    });
    parts.push("</Document></kml>");
    files.unshift({ name: "doc.kml", bytes: new TextEncoder().encode(parts.join("")) });
    return root.EXO.atak.zipStore(files);
  }

  root.EXO = root.EXO || {};
  root.EXO.garmin = { kmz: kmz, box: box, spansDateLine: spansDateLine };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.garmin;
})(typeof globalThis !== "undefined" ? globalThis : this);
