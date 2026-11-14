/* Place jump. MGRS and coordinates resolve on the device. Names go to /api/geocode. */
(function (root) {
  function mgrsZoom(text) {
    var body = String(text || "").replace(/\s+/g, "").replace(/^\d{1,2}[A-Z]{3}/i, "");
    var digits = body.length / 2;
    if (digits >= 4) return 15;
    if (digits >= 2) return 12;
    return 8;
  }

  function parse(text) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    var compact = raw.replace(/\s+/g, "").toUpperCase();
    if (/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}\d*$/.test(compact) && (compact.replace(/^\d{1,2}[C-HJ-NP-X][A-HJ-NP-Z]{2}/, "").length % 2) === 0) {
      var ll = root.EXO.mgrs.toLatLon(compact);
      return { lon: ll.lon, lat: ll.lat, zoom: mgrsZoom(compact), label: raw };
    }
    var hem = raw.match(/^\s*([+-]?\d+(?:\.\d+)?)\s*([NnSs])?\s*[, ]\s*([+-]?\d+(?:\.\d+)?)\s*([EeWw])?\s*$/);
    if (!hem) return null;
    var lat = Number(hem[1]);
    var lon = Number(hem[3]);
    if (hem[2] && hem[2].toUpperCase() === "S") lat = -Math.abs(lat);
    if (hem[2] && hem[2].toUpperCase() === "N") lat = Math.abs(lat);
    if (hem[4] && hem[4].toUpperCase() === "W") lon = -Math.abs(lon);
    if (hem[4] && hem[4].toUpperCase() === "E") lon = Math.abs(lon);
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    return { lon: lon, lat: lat, zoom: 12, label: raw };
  }

  root.EXO = root.EXO || {};
  root.EXO.search = { parse: parse };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.search;
})(typeof globalThis !== "undefined" ? globalThis : this);
