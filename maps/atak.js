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

  function kml(sheets) {
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
      + "<Document><name>EXOpace field maps</name>" + overlays + "</Document></kml>";
  }

  async function kmz(sheets, jpegs) {
    var enc = new TextEncoder();
    var files = [{ name: "doc.kml", bytes: enc.encode(kml(sheets)) }];
    for (var i = 0; i < jpegs.length; i++) {
      files.push({ name: "files/sheet-" + i + ".jpg", bytes: jpegs[i] });
    }
    return zipStore(files);
  }

  root.EXO = root.EXO || {};
  root.EXO.atak = { kmz: kmz, zipStore: zipStore };
})(typeof globalThis !== "undefined" ? globalThis : this);
