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

  /* The link stores one four-digit year. Anything else is dropped. */
  function scanYearOf(text) {
    if (!/^\d{4}$/.test(String(text == null ? "" : text))) return 0;
    var year = Number(text);
    if (year < 1800 || year > 2099) return 0;
    return year;
  }

  function scanText(year) {
    var text = String(year == null ? "" : year);
    return scanYearOf(text) ? text : "";
  }

  function editionForYear(rows, year) {
    var want = typeof year === "number" ? (scanYearOf(String(year)) || 0) : scanYearOf(year);
    if (!want) return null;
    var found = null;
    (rows || []).forEach(function (row) {
      if (row && row.year === want) found = row;
    });
    return found;
  }

  /* PDF .../HistoricalTopo/PDF/{state}/{scale}/{name}_geo.pdf
     TIFF .../HistoricalTopo/GeoTIFF/{state}/{name}_geo.tif */
  function geotiffUrl(pdf) {
    var href = httpsUrl(pdf);
    if (!href) return "";
    var parsed;
    try {
      parsed = new URL(href);
    } catch (err) {
      return "";
    }
    var parts = parsed.pathname.split("/");
    var at = parts.indexOf("HistoricalTopo");
    if (at < 0 || parts[at + 1] !== "PDF" || parts.length !== at + 5) return "";
    var state = parts[at + 2];
    var scale = parts[at + 3];
    var file = parts[at + 4];
    if (!state || !/^\d+$/.test(scale) || !/_geo\.pdf$/i.test(file)) return "";
    parts = parts.slice(0, at).concat([
      "HistoricalTopo",
      "GeoTIFF",
      state,
      file.replace(/_geo\.pdf$/i, "_geo.tif"),
    ]);
    parsed.pathname = parts.join("/");
    parsed.search = "";
    parsed.hash = "";
    return httpsUrl(parsed.href);
  }

  function readU16(bytes, offset) {
    return bytes[offset] | (bytes[offset + 1] << 8);
  }

  function readU32(bytes, offset) {
    return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
  }

  function readF64(bytes, offset) {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 8).getFloat64(0, true);
  }

  function readIfd(bytes, offset) {
    if (!Number.isFinite(offset) || offset < 0 || offset + 2 > bytes.length) return null;
    var count = readU16(bytes, offset);
    var end = offset + 2 + count * 12 + 4;
    if (count > 80 || end > bytes.length) return null;
    var tags = Object.create(null);
    for (var i = 0; i < count; i++) {
      var at = offset + 2 + i * 12;
      tags[readU16(bytes, at)] = {
        typ: readU16(bytes, at + 2),
        count: readU32(bytes, at + 4),
        val: readU32(bytes, at + 8),
        at: at,
      };
    }
    return { tags: tags, next: readU32(bytes, offset + 2 + count * 12) };
  }

  function shortValue(tag) {
    if (!tag || tag.typ !== 3 || tag.count !== 1) return null;
    return tag.val & 65535;
  }

  function longValue(tag) {
    if (!tag || tag.typ !== 4 || tag.count !== 1) return null;
    return tag.val >>> 0;
  }

  function readDoubles(bytes, tag) {
    if (!tag || tag.typ !== 12 || tag.count < 1 || tag.count > 16) return null;
    var nbytes = tag.count * 8;
    var pos = nbytes > 4 ? tag.val : tag.at + 8;
    if (pos + nbytes > bytes.length) return null;
    var out = [];
    for (var i = 0; i < tag.count; i++) out.push(readF64(bytes, pos + i * 8));
    return out;
  }

  function readLongs(bytes, tag) {
    if (!tag || tag.typ !== 4 || tag.count < 1 || tag.count > 400) return null;
    if (tag.count === 1) return [tag.val >>> 0];
    var pos = tag.val;
    if (pos + tag.count * 4 > bytes.length) return null;
    var out = [];
    for (var i = 0; i < tag.count; i++) out.push(readU32(bytes, pos + i * 4));
    return out;
  }

  function geoKeyMap(bytes, tag) {
    if (!tag || tag.typ !== 3 || tag.count < 8 || tag.count > 128) return null;
    var pos = tag.count * 2 > 4 ? tag.val : tag.at + 8;
    if (pos + tag.count * 2 > bytes.length) return null;
    var n = readU16(bytes, pos + 6);
    if (4 + n * 4 > tag.count) return null;
    var keys = Object.create(null);
    for (var i = 0; i < n; i++) {
      var at = pos + 8 + i * 8;
      keys[readU16(bytes, at)] = {
        loc: readU16(bytes, at + 2),
        count: readU16(bytes, at + 4),
        val: readU16(bytes, at + 6),
      };
    }
    return keys;
  }

  function keyNumber(keys, id, doubles) {
    var key = keys[id];
    if (!key || key.count !== 1) return null;
    if (key.loc === 0) return key.val;
    if (key.loc === 34736) {
      if (!doubles || key.val >= doubles.length) return null;
      return doubles[key.val];
    }
    return null;
  }

  function meridional(phi, a, e2) {
    var e4 = e2 * e2;
    var e6 = e4 * e2;
    return a * (
      (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
      - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
      - (35 * e6 / 3072) * Math.sin(6 * phi)
    );
  }

  /* Inverse transverse mercator. Returns [lon, lat] degrees, or null. */
  function inverseTm(easting, northing, proj) {
    if (!proj) return null;
    var a = proj.a;
    var f = proj.f;
    if (!(a > 0) || !(f > 0) || !(proj.k0 > 0)) return null;
    var e2 = f * (2 - f);
    var ep2 = e2 / (1 - e2);
    var x = (easting - proj.easting) / proj.k0;
    var y = (northing - proj.northing) / proj.k0;
    var lat0 = proj.lat0 * Math.PI / 180;
    var lon0 = proj.lon0 * Math.PI / 180;
    var mu = (meridional(lat0, a, e2) + y) / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 * e2 * e2 / 256));
    var root = Math.sqrt(1 - e2);
    var e1 = (1 - root) / (1 + root);
    var phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var cos1 = Math.cos(phi1);
    if (Math.abs(cos1) < 1e-12) return null;
    var C1 = ep2 * cos1 * cos1;
    var T1 = Math.tan(phi1) * Math.tan(phi1);
    var sin1 = Math.sin(phi1);
    var n1 = a / Math.sqrt(1 - e2 * sin1 * sin1);
    var r1 = a * (1 - e2) / Math.pow(1 - e2 * sin1 * sin1, 1.5);
    var d = x / n1;
    var lat = phi1 - (n1 * Math.tan(phi1) / r1) * (
      d * d / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(d, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * Math.pow(d, 6) / 720
    );
    var lon = lon0 + (
      d
      - (1 + 2 * T1 + C1) * Math.pow(d, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * Math.pow(d, 5) / 120
    ) / cos1;
    return [lon * 180 / Math.PI, lat * 180 / Math.PI];
  }

  /* American polyconic inverse, Snyder PP 1395 equations 18-18 through 18-22.
     Returns [lon, lat] degrees on the file ellipsoid, or null. */
  function inversePoly(easting, northing, proj) {
    if (!proj) return null;
    var a = proj.a;
    var f = proj.f;
    if (!(a > 0) || !(f > 0)) return null;
    var e2 = f * (2 - f);
    var x = easting - proj.easting;
    var y = northing - proj.northing;
    var phi0 = proj.lat0 * Math.PI / 180;
    var lam0 = proj.lon0 * Math.PI / 180;
    var M0 = meridional(phi0, a, e2);
    if (Math.abs(y + M0) < 0.001) return [(lam0 + x / a) * 180 / Math.PI, 0];
    var A = (M0 + y) / a;
    var B = x * x / (a * a) + A * A;
    var phi = A;
    var settled = false;
    for (var i = 0; i < 20; i++) {
      var sp = Math.sin(phi);
      var cp = Math.cos(phi);
      if (Math.abs(cp) < 1e-12 || Math.abs(Math.sin(2 * phi)) < 1e-12) return null;
      var root = Math.sqrt(1 - e2 * sp * sp);
      var C = root * Math.tan(phi);
      var Ma = meridional(phi, a, e2) / a;
      var Mp = (1 - e2) / (root * root * root);
      var num = A * (C * Ma + 1) - Ma - (Ma * Ma + B) * C / 2;
      var den = e2 * Math.sin(2 * phi) * (Ma * Ma + B - 2 * A * Ma) / (4 * C)
        + (A - Ma) * (C * Mp - 2 / Math.sin(2 * phi)) - Mp;
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
      var next = phi - num / den;
      if (Math.abs(next - phi) < 1e-12) {
        phi = next;
        settled = true;
        break;
      }
      phi = next;
    }
    if (!settled || Math.abs(phi) > Math.PI / 2 || Math.abs(Math.sin(phi)) < 1e-12) return null;
    var C2 = Math.sqrt(1 - e2 * Math.sin(phi) * Math.sin(phi)) * Math.tan(phi);
    var arg = x * C2 / a;
    if (arg > 1 || arg < -1) return null;
    return [(Math.asin(arg) / Math.sin(phi) + lam0) * 180 / Math.PI, phi * 180 / Math.PI];
  }

  function geocentric(latDeg, lonDeg, a, e2) {
    var lat = latDeg * Math.PI / 180;
    var lon = lonDeg * Math.PI / 180;
    var s = Math.sin(lat);
    var c = Math.cos(lat);
    var n = a / Math.sqrt(1 - e2 * s * s);
    return [n * c * Math.cos(lon), n * c * Math.sin(lon), n * (1 - e2) * s];
  }

  function geodetic(x, y, z, a, e2) {
    var lon = Math.atan2(y, x);
    var p = Math.hypot(x, y);
    var lat = Math.atan2(z, p * (1 - e2));
    for (var i = 0; i < 8; i++) {
      var s = Math.sin(lat);
      var n = a / Math.sqrt(1 - e2 * s * s);
      lat = Math.atan2(z + e2 * n * s, p);
    }
    return [lon * 180 / Math.PI, lat * 180 / Math.PI];
  }

  /* NAD27 to WGS84 for CONUS onshore, EPSG:1173. Outside that box, null. */
  function nad27ToWgs84(lon, lat) {
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    if (lat < 24.41 || lat > 49.38 || lon < -124.79 || lon > -66.91) return null;
    var f = 1 / 294.978698213898;
    var e2 = f * (2 - f);
    var xyz = geocentric(lat, lon, 6378206.4, e2);
    var fw = 1 / 298.257223563;
    var shifted = geodetic(xyz[0] - 8, xyz[1] + 160, xyz[2] + 176, 6378137, fw * (2 - fw));
    if (Math.abs(shifted[0]) > 180 || Math.abs(shifted[1]) > 84) return null;
    return shifted;
  }

  function imageOf(bytes, ifd) {
    var width = shortValue(ifd.tags[256]);
    var height = shortValue(ifd.tags[257]);
    var compression = shortValue(ifd.tags[259]);
    var tileWidth = shortValue(ifd.tags[322]);
    var tileHeight = shortValue(ifd.tags[323]);
    if (!width || !height || !tileWidth || !tileHeight) return null;
    var cols = Math.ceil(width / tileWidth);
    var rows = Math.ceil(height / tileHeight);
    var offsets = readLongs(bytes, ifd.tags[324]);
    var lengths = readLongs(bytes, ifd.tags[325]);
    if (!offsets || !lengths || offsets.length !== cols * rows || lengths.length !== offsets.length) return null;
    var tiles = [];
    var total = 0;
    for (var i = 0; i < offsets.length; i++) {
      if (lengths[i] < 4 || lengths[i] > 500000) return null;
      total += lengths[i];
      tiles.push({ offset: offsets[i], length: lengths[i] });
    }
    /* Keep the phone off the multi-megabyte full sheet. */
    if (total > 1200000) return null;
    return {
      width: width,
      height: height,
      compression: compression,
      tileWidth: tileWidth,
      tileHeight: tileHeight,
      tiles: tiles,
    };
  }

  function projectionOf(bytes, ifd) {
    var scale = readDoubles(bytes, ifd.tags[33550]);
    var tie = readDoubles(bytes, ifd.tags[33922]);
    var doubles = readDoubles(bytes, ifd.tags[34736]);
    var keys = geoKeyMap(bytes, ifd.tags[34735]);
    if (!scale || scale.length < 2 || !tie || tie.length < 6 || !keys) return null;
    if (keyNumber(keys, 1024, doubles) !== 1) return null;
    if (keyNumber(keys, 1025, doubles) !== 1) return null;
    if (keyNumber(keys, 2054, doubles) !== 9102) return null;
    if (keyNumber(keys, 3072, doubles) !== 32767) return null;
    if (keyNumber(keys, 3076, doubles) !== 9001) return null;
    var geo = keyNumber(keys, 2048, doubles);
    var method = keyNumber(keys, 3075, doubles);
    var lon0 = keyNumber(keys, 3080, doubles);
    var lat0 = keyNumber(keys, 3081, doubles);
    var falseE = keyNumber(keys, 3082, doubles);
    var falseN = keyNumber(keys, 3083, doubles);
    var k0 = keyNumber(keys, 3092, doubles);
    var semi = keyNumber(keys, 2057, doubles);
    var inv = keyNumber(keys, 2059, doubles);
    if (![lon0, lat0, falseE, falseN, k0, semi, inv, geo, method].every(Number.isFinite)) return null;
    if (k0 < 0.99 || k0 > 1.01) return null;
    if (!(scale[0] > 0) || !(scale[1] > 0)) return null;
    if (tie[0] !== 0 || tie[1] !== 0) return null;
    var kind = "";
    var datum = "";
    if (method === 1 && geo === 4326) {
      if (Math.abs(semi - 6378137) > 1) return null;
      if (Math.abs(inv - 298.257223563) > 0.001) return null;
      kind = "tm";
      datum = "wgs84";
    } else if (method === 22 && geo === 4267) {
      if (Math.abs(semi - 6378206.4) > 1) return null;
      if (Math.abs(inv - 294.978698214) > 0.001) return null;
      kind = "poly";
      datum = "nad27";
    } else {
      return null;
    }
    return {
      kind: kind,
      datum: datum,
      a: semi,
      f: 1 / inv,
      lon0: lon0,
      lat0: lat0,
      easting: falseE,
      northing: falseN,
      k0: k0,
      scaleX: scale[0],
      scaleY: scale[1],
      tieE: tie[3],
      tieN: tie[4],
    };
  }

  function cornersOf(width, height, proj) {
    var east = [
      proj.tieE,
      proj.tieE + width * proj.scaleX,
      proj.tieE + width * proj.scaleX,
      proj.tieE,
    ];
    var north = [
      proj.tieN,
      proj.tieN,
      proj.tieN - height * proj.scaleY,
      proj.tieN - height * proj.scaleY,
    ];
    var corners = [];
    for (var i = 0; i < 4; i++) {
      var point = proj.kind === "poly"
        ? inversePoly(east[i], north[i], proj)
        : inverseTm(east[i], north[i], proj);
      if (proj.datum === "nad27") point = point && nad27ToWgs84(point[0], point[1]);
      if (!point || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 84) return null;
      corners.push(point);
    }
    return corners;
  }

  /* Header bytes only. Picks the largest JPEG overview no wider than 1800 px. */
  function registration(bytes) {
    if (!bytes || bytes.length < 16 || bytes[0] !== 73 || bytes[1] !== 73 || bytes[2] !== 42 || bytes[3] !== 0) return null;
    var images = [];
    var proj = null;
    var fullWidth = 0;
    var fullHeight = 0;
    var offset = readU32(bytes, 4);
    var guard = 0;
    while (offset && guard < 12) {
      var ifd = readIfd(bytes, offset);
      if (!ifd) return null;
      if (!proj) proj = projectionOf(bytes, ifd);
      if (!fullWidth) {
        fullWidth = shortValue(ifd.tags[256]) || 0;
        fullHeight = shortValue(ifd.tags[257]) || 0;
      }
      var image = imageOf(bytes, ifd);
      if (image) images.push(image);
      offset = ifd.next;
      guard += 1;
    }
    if (!proj || !fullWidth || !fullHeight) return null;
    var corners = cornersOf(fullWidth, fullHeight, proj);
    if (!corners) return null;
    var overview = null;
    images.forEach(function (image) {
      if (image.compression !== 7) return;
      if (image.width < 300 || image.width > 1800) return;
      if (!overview || image.width > overview.width) overview = image;
    });
    if (!overview) return null;
    return { corners: corners, overview: overview };
  }

  function bilinearAt(corners, u, v) {
    var w00 = (1 - u) * (1 - v);
    var w10 = u * (1 - v);
    var w11 = u * v;
    var w01 = (1 - u) * v;
    return [
      w00 * corners[0][0] + w10 * corners[1][0] + w11 * corners[2][0] + w01 * corners[3][0],
      w00 * corners[0][1] + w10 * corners[1][1] + w11 * corners[2][1] + w01 * corners[3][1],
    ];
  }

  /* Pixel of a lon/lat on the scan. The corners are top-left, top-right, bottom-right, bottom-left. */
  function locate(corners, width, height, lon, lat) {
    if (!corners || corners.length !== 4 || !(width > 0) || !(height > 0)) return null;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
    var west = corners[0][0];
    var east = corners[1][0];
    var north = corners[0][1];
    var south = corners[3][1];
    var u = east === west ? 0.5 : (lon - west) / (east - west);
    var v = north === south ? 0.5 : (north - lat) / (north - south);
    for (var i = 0; i < 8; i++) {
      var p = bilinearAt(corners, u, v);
      var step = 1e-4;
      var pu = bilinearAt(corners, u + step, v);
      var pv = bilinearAt(corners, u, v + step);
      var ju0 = (pu[0] - p[0]) / step;
      var ju1 = (pu[1] - p[1]) / step;
      var jv0 = (pv[0] - p[0]) / step;
      var jv1 = (pv[1] - p[1]) / step;
      var det = ju0 * jv1 - ju1 * jv0;
      if (Math.abs(det) < 1e-14) return null;
      var ex = lon - p[0];
      var ey = lat - p[1];
      var su = (ex * jv1 - ey * jv0) / det;
      var sv = (ju0 * ey - ju1 * ex) / det;
      u += su;
      v += sv;
      if (Math.abs(su) < 1e-10 && Math.abs(sv) < 1e-10) break;
    }
    if (!Number.isFinite(u) || !Number.isFinite(v)) return null;
    if (u < -0.25 || u > 1.25 || v < -0.25 || v > 1.25) return null;
    var check = bilinearAt(corners, u, v);
    if (Math.abs(check[0] - lon) > 0.0002 || Math.abs(check[1] - lat) > 0.0002) return null;
    return [u * width, v * height];
  }

  /* Axis-aligned crop of a four-corner ring, plus the ground corners of that crop. */
  function windowOf(corners, width, height, ring) {
    if (!ring || ring.length !== 4) return null;
    var pts = [];
    for (var i = 0; i < 4; i++) {
      var hit = locate(corners, width, height, ring[i][0], ring[i][1]);
      if (!hit) return null;
      pts.push(hit);
    }
    var xs = pts.map(function (p) { return p[0]; });
    var ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.max(0, Math.floor(Math.min.apply(null, xs)));
    var y0 = Math.max(0, Math.floor(Math.min.apply(null, ys)));
    var x1 = Math.min(width, Math.ceil(Math.max.apply(null, xs)));
    var y1 = Math.min(height, Math.ceil(Math.max.apply(null, ys)));
    if (x1 - x0 < 8 || y1 - y0 < 8) return null;
    return {
      x: x0,
      y: y0,
      w: x1 - x0,
      h: y1 - y0,
      coordinates: [
        bilinearAt(corners, x0 / width, y0 / height),
        bilinearAt(corners, x1 / width, y0 / height),
        bilinearAt(corners, x1 / width, y1 / height),
        bilinearAt(corners, x0 / width, y1 / height),
      ],
    };
  }

  function covers(sheet, corners) {
    if (!sheet || sheet.kind !== "quad" || !corners || corners.length !== 4) return false;
    var lons = corners.map(function (point) { return point[0]; });
    var lats = corners.map(function (point) { return point[1]; });
    var west = Math.min.apply(null, lons);
    var east = Math.max.apply(null, lons);
    var south = Math.min.apply(null, lats);
    var north = Math.max.apply(null, lats);
    var span = Math.max(east - west, north - south);
    if (span < 0.02 || span > 5) return false;
    var midLon = (sheet.west + sheet.east) / 2;
    var midLat = (sheet.south + sheet.north) / 2;
    if (midLon < west || midLon > east || midLat < south || midLat > north) return false;
    var tol = 0.02;
    return sheet.west >= west - tol
      && sheet.east <= east + tol
      && sheet.south >= south - tol
      && sheet.north <= north + tol;
  }

  root.EXO = root.EXO || {};
  root.EXO.topo = {
    queryExtent: queryExtent,
    editions: editions,
    scanYearOf: scanYearOf,
    scanText: scanText,
    editionForYear: editionForYear,
    geotiffUrl: geotiffUrl,
    inverseTm: inverseTm,
    inversePoly: inversePoly,
    nad27ToWgs84: nad27ToWgs84,
    registration: registration,
    covers: covers,
    locate: locate,
    windowOf: windowOf,
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.topo;
})(typeof globalThis !== "undefined" ? globalThis : this);
