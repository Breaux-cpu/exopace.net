/* ATAK ground overlay. A KMZ is a zip ATAK imports as a GRG. */
(function (root) {
  var CRC = makeCrc();

  function makeCrc() {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  }

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u16(n) { return [n & 255, (n >> 8) & 255]; }
  function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }

  function zipStore(files) {
    var enc = new TextEncoder();
    var locals = [];
    var centrals = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = enc.encode(file.name);
      var data = file.bytes;
      var crc = crc32(data);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
        Array.from(name)
      );
      locals.push(new Uint8Array(local));
      locals.push(data);
      var central = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
        u16(0), u16(0), u32(0), u32(offset), Array.from(name)
      );
      centrals.push(new Uint8Array(central));
      offset += local.length + data.length;
    });
    var centralStart = offset;
    var centralSize = centrals.reduce(function (s, c) { return s + c.length; }, 0);
    var end = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralSize), u32(centralStart), u16(0)
    );
    var chunks = locals.concat(centrals, [new Uint8Array(end)]);
    var total = chunks.reduce(function (s, c) { return s + c.length; }, 0);
    var out = new Uint8Array(total);
    var at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function coord(ll) {
    return ll.lon.toFixed(6) + "," + ll.lat.toFixed(6) + ",0";
  }

  function usablePoint(point) {
    return point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
      && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
  }

  function wrapLon(lon) {
    var x = lon;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
  }

  /* Split where a normalized step would cross the date line, so the line does not span the world. */
  function lineSegments(pairs) {
    var segments = [];
    var current = [];
    function push(lon, lat) {
      var wrapped = wrapLon(lon);
      if (current.length) {
        var prev = current[current.length - 1][0];
        if (Math.abs(wrapped - prev) > 180) {
          if (current.length >= 2) segments.push(current);
          current = [];
        }
      }
      current.push([wrapped, lat]);
    }
    (pairs || []).forEach(function (pair) {
      if (!pair || !Number.isFinite(pair[0]) || !Number.isFinite(pair[1])) return;
      if (Math.abs(pair[1]) > 90) return;
      push(pair[0], pair[1]);
    });
    if (current.length >= 2) segments.push(current);
    return segments;
  }

  function routePairs(points) {
    var clean = (points || []).filter(usablePoint);
    if (clean.length < 2) return [];
    if (root.EXO.measure && root.EXO.measure.routeLine) return root.EXO.measure.routeLine(clean);
    return clean.map(function (point) { return [point.lon, point.lat]; });
  }

  function routeKml(points) {
    var clean = (points || []).filter(usablePoint);
    var segments = lineSegments(routePairs(clean));
    if (!segments.length) return "";
    var lines = segments.map(function (segment) {
      var text = segment.map(function (pair) {
        return pair[0].toFixed(6) + "," + pair[1].toFixed(6) + ",0";
      }).join(" ");
      return "<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>"
        + text + "</coordinates></LineString>";
    }).join("");
    var marks = clean.map(function (point, index) {
      var name = String(index + 1);
      try {
        if (root.EXO.mgrs && root.EXO.mgrs.format) {
          var grid = root.EXO.mgrs.format(point.lon, point.lat);
          if (grid) name = (index + 1) + " " + grid;
        }
      } catch (err) {}
      return "<Placemark><name>" + esc(name) + "</name><Point><coordinates>"
        + point.lon.toFixed(6) + "," + point.lat.toFixed(6) + ",0</coordinates></Point></Placemark>";
    }).join("");
    return "<Placemark><name>EXOpace route</name><Style><LineStyle><color>ff12349a</color><width>3</width></LineStyle></Style><MultiGeometry>"
      + lines + "</MultiGeometry></Placemark>" + marks;
  }

  function kml(sheets, route) {
    var overlays = sheets.map(function (sheet, i) {
      var file = "files/sheet-" + i + ".jpg";
      return ""
        + "<GroundOverlay><name>" + esc(sheet.name + " 1:" + sheet.scale) + "</name>"
        + "<Icon><href>" + file + "</href></Icon>"
        + "<gx:LatLonQuad><coordinates>"
        + [sheet.sw, sheet.se, sheet.ne, sheet.nw].map(coord).join(" ")
        + "</coordinates></gx:LatLonQuad></GroundOverlay>"
        + "<Placemark><name>" + esc(sheet.name) + " neatline</name><LineString><tessellate>1</tessellate><coordinates>"
        + [sheet.sw, sheet.se, sheet.ne, sheet.nw, sheet.sw].map(coord).join(" ")
        + "</coordinates></LineString></Placemark>";
    }).join("");
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
      + "<kml xmlns=\"http://www.opengis.net/kml/2.2\" xmlns:gx=\"http://www.google.com/kml/ext/2.2\">"
      + "<Document><name>EXOpace field maps</name>" + overlays + routeKml(route) + "</Document></kml>";
  }

  async function kmz(sheets, jpegs, route) {
    var enc = new TextEncoder();
    var files = [{ name: "doc.kml", bytes: enc.encode(kml(sheets, route)) }];
    for (var i = 0; i < jpegs.length; i++) {
      files.push({ name: "files/sheet-" + i + ".jpg", bytes: jpegs[i] });
    }
    return zipStore(files);
  }

  root.EXO = root.EXO || {};
  root.EXO.atak = { kmz: kmz, zipStore: zipStore, kml: kml, routeKml: routeKml, lineSegments: lineSegments };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.atak;
})(typeof globalThis !== "undefined" ? globalThis : this);
