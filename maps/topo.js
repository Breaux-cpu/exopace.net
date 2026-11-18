/* Historical USGS paper scans for one quadrangle.
   The match is the catalogue cell, not a redraw of the collar. */
(function (root) {
  var EXTENT = {
    usgs75: "7.5 x 7.5 minute",
    usgs15: "15 x 15 minute",
    usgs100: "30 x 60 minute",
    usgs250: "1 x 2 degree",
  };

  function queryExtent(series) {
    return EXTENT[series] || "";
  }

  function httpsUrl(url) {
    if (typeof url !== "string" || !url) return "";
    var parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return "";
    }
    if (parsed.protocol !== "https:") return "";
    var host = parsed.hostname.toLowerCase();
    var usgs = host === "usgs.gov" || host.endsWith(".usgs.gov");
    var national = host === "nationalmap.gov" || host.endsWith(".nationalmap.gov");
    var staged = host === "prd-tnm.s3.amazonaws.com";
    if (!usgs && !national && !staged) return "";
    return parsed.href;
  }

  function yearOf(item) {
    var published = String(item && item.publicationDate || "");
    var dated = published.match(/^(\d{4})/);
    if (dated) return Number(dated[1]);
    var title = String(item && item.title || "");
    var years = title.match(/\b(?:18|19|20)\d{2}\b/g);
    if (!years) return 0;
    return Number(years[years.length - 1]);
  }

  function mapName(title) {
    var text = String(title || "");
    var named = text.match(/Quadrangle for (.+?)(?:\s+(?:18|19|20)\d{2})\s*$/);
    if (!named) return "";
    return named[1].trim();
  }

  function edgesMatch(sheet, box) {
    if (!sheet || !box) return false;
    var west = Number(box.minX);
    var east = Number(box.maxX);
    var south = Number(box.minY);
    var north = Number(box.maxY);
    var edges = [west, east, south, north, sheet.west, sheet.east, sheet.south, sheet.north];
    if (!edges.every(function (n) { return Number.isFinite(n); })) return false;
    var tol = 0.01;
    return Math.abs(sheet.west - west) <= tol
      && Math.abs(sheet.east - east) <= tol
      && Math.abs(sheet.south - south) <= tol
      && Math.abs(sheet.north - north) <= tol;
  }

  /* One file per year. Same-year duplicates keep the later download URL so the choice stays stable. */
  function editions(sheet, items) {
    if (!sheet || sheet.kind !== "quad") return [];
    var want = queryExtent(sheet.series);
    if (!want) return [];
    var byYear = Object.create(null);
    (items || []).forEach(function (item) {
      if (!item || item.extent !== want) return;
      if (!edgesMatch(sheet, item.boundingBox)) return;
      var pdf = httpsUrl(item.downloadURL);
      if (!pdf) return;
      var year = yearOf(item);
      if (!year) return;
      var row = byYear[year];
      if (row && pdf <= row.pdf) return;
      byYear[year] = {
        year: year,
        name: mapName(item.title),
        pdf: pdf,
        preview: httpsUrl(item.previewGraphicURL),
      };
    });
    return Object.keys(byYear).map(function (year) {
      return byYear[year];
    }).sort(function (a, b) {
      return b.year - a.year;
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.topo = {
    queryExtent: queryExtent,
    editions: editions,
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.topo;
})(typeof globalThis !== "undefined" ? globalThis : this);
