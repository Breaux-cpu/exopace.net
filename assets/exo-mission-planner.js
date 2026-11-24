/* Search routes from an operator polygon. Missing DEM stays FLAT. */
(function (root) {
  var CRC_EXTRA = 38;

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function ring(poly) {
    if (!poly || poly.length < 3) return [];
    var pts = [];
    for (var i = 0; i < poly.length; i++) {
      if (!poly[i] || !finite(poly[i].lat) || !finite(poly[i].lon)) return [];
      pts.push({ lat: poly[i].lat, lon: poly[i].lon });
    }
    return pts;
  }

  function offset(lat, lon, headingDeg, distM) {
    var rad = Math.PI / 180;
    var d = distM / 6378137;
    var br = headingDeg * rad;
    var lat1 = lat * rad;
    var lon1 = lon * rad;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(br));
    var lon2 = lon1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: lat2 / rad, lon: lon2 / rad };
  }

  function lawnmower(poly, spacingM) {
    var pts = ring(poly);
    if (!pts.length || !finite(spacingM) || spacingM <= 0) return [];
    var minLat = pts[0].lat;
    var maxLat = pts[0].lat;
    for (var i = 1; i < pts.length; i++) {
      if (pts[i].lat < minLat) minLat = pts[i].lat;
      if (pts[i].lat > maxLat) maxLat = pts[i].lat;
    }
    var dLat = spacingM / 111320;
    var rows = [];
    var flip = false;
    for (var lat = minLat + dLat / 2; lat < maxLat; lat += dLat) {
      var xs = [];
      for (var e = 0; e < pts.length; e++) {
        var a = pts[e];
        var b = pts[(e + 1) % pts.length];
        if ((a.lat <= lat && b.lat > lat) || (b.lat <= lat && a.lat > lat)) {
          var t = (lat - a.lat) / (b.lat - a.lat);
          xs.push(a.lon + t * (b.lon - a.lon));
        }
      }
      xs.sort(function (p, q) { return p - q; });
      for (var s = 0; s + 1 < xs.length; s += 2) {
        var seg = [{ lat: lat, lon: xs[s] }, { lat: lat, lon: xs[s + 1] }];
        if (flip) seg.reverse();
        rows.push(seg[0], seg[1]);
        flip = !flip;
      }
    }
    return rows;
  }

  function square(center, spacingM, legs) {
    if (!center || !finite(center.lat) || !finite(center.lon) || !finite(spacingM) || spacingM <= 0) return [];
    var turns = finite(legs) && legs > 0 ? Math.min(12, legs) : 4;
    var headings = [90, 0, 270, 180];
    var lat = center.lat;
    var lon = center.lon;
    var points = [{ lat: lat, lon: lon }];
    var span = 1;
    for (var i = 0; i < turns; i++) {
      var moved = offset(lat, lon, headings[i % 4], spacingM * span);
      points.push(moved);
      lat = moved.lat;
      lon = moved.lon;
      if (i % 2 === 1) span++;
    }
    return points;
  }

  function clamp(points, dem, aglM) {
    var clearance = finite(aglM) ? aglM : 0;
    var rows = dem || [];
    return points.map(function (point) {
      var hit = null;
      for (var i = 0; i < rows.length; i++) {
        if (!rows[i] || !finite(rows[i].elev) || !finite(rows[i].lat) || !finite(rows[i].lon)) continue;
        if (Math.abs(rows[i].lat - point.lat) < 1e-6 && Math.abs(rows[i].lon - point.lon) < 1e-6) hit = rows[i];
      }
      if (!hit) return { lat: point.lat, lon: point.lon, altM: null, terrain: "FLAT" };
      return { lat: point.lat, lon: point.lon, altM: hit.elev + clearance, terrain: "DEM" };
    });
  }

  function plan(input) {
    if (!input) return { status: "NO POLYGON", points: [] };
    var raw = input.mode === "square" ? square(input.center, input.spacingM, input.legs) : lawnmower(input.polygon, input.spacingM);
    if (!raw.length) return { status: "NO POLYGON", points: [] };
    return { status: "ROUTE", points: clamp(raw, input.dem || [], input.aglM) };
  }

  function crcAccumulate(data, crc) {
    var tmp = (data ^ (crc & 0xff)) & 0xff;
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  }

  function crc(bytes) {
    var value = 0xffff;
    for (var i = 0; i < bytes.length; i++) value = crcAccumulate(bytes[i], value);
    return crcAccumulate(CRC_EXTRA, value);
  }

  function f32(n) {
    var buf = new ArrayBuffer(4);
    var view = new DataView(buf);
    view.setFloat32(0, finite(n) ? n : 0, true);
    return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
  }

  function i32(n) {
    var buf = new ArrayBuffer(4);
    var view = new DataView(buf);
    view.setInt32(0, n | 0, true);
    return [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)];
  }

  function u16(n) {
    return [n & 255, (n >> 8) & 255];
  }

  function missionItem(point, seq) {
    if (!point || !finite(point.lat) || !finite(point.lon)) return null;
    var terrain = point.terrain === "DEM" && finite(point.altM);
    var payload = []
      .concat(f32(0), f32(0), f32(0), f32(0))
      .concat(i32(Math.round(point.lat * 1e7)), i32(Math.round(point.lon * 1e7)), f32(terrain ? point.altM : 0))
      .concat(u16(seq), u16(16), [terrain ? 10 : 0, 0, 1, 0]);
    var head = [0xfd, payload.length, 0, 0, seq & 255, 1, 1, 73, 0, 0];
    var body = head.concat(payload);
    var sum = crc(body.slice(1));
    body.push(sum & 255, (sum >> 8) & 255);
    return Uint8Array.from(body);
  }

  function missionItems(points) {
    if (!points || !points.length) return null;
    var frames = [];
    for (var i = 0; i < points.length; i++) {
      var frame = missionItem(points[i], i);
      if (!frame) return null;
      frames.push(frame);
    }
    return frames;
  }

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) {
      c ^= bytes[i];
      for (var k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function le(n, size) {
    var out = [];
    for (var i = 0; i < size; i++) out.push((n >>> (8 * i)) & 255);
    return out;
  }

  function kmz(points) {
    if (!points || !points.length || typeof TextEncoder === "undefined") return null;
    var coords = points.map(function (point) {
      return point.lon.toFixed(6) + "," + point.lat.toFixed(6) + "," + (finite(point.altM) ? point.altM.toFixed(1) : "0");
    }).join(" ");
    var kml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document><Placemark><name>SEARCH</name><LineString><coordinates>"
      + coords + "</coordinates></LineString></Placemark></Document></kml>";
    var name = new TextEncoder().encode("doc.kml");
    var data = new TextEncoder().encode(kml);
    var crcSum = crc32(data);
    var local = [].concat(le(0x04034b50, 4), le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(crcSum, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), Array.from(name));
    var central = [].concat(le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(crcSum, 4), le(data.length, 4), le(data.length, 4), le(name.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), Array.from(name));
    var end = [].concat(le(0x06054b50, 4), le(0, 2), le(0, 2), le(1, 2), le(1, 2), le(central.length, 4), le(local.length + data.length, 4), le(0, 2));
    var out = new Uint8Array(local.length + data.length + central.length + end.length);
    out.set(local, 0);
    out.set(data, local.length);
    out.set(central, local.length + data.length);
    out.set(end, local.length + data.length + central.length);
    return out;
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-planner");
      if (host) host.textContent = "NO POLYGON";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.missionPlanner = {
    lawnmower: lawnmower,
    square: square,
    clamp: clamp,
    plan: plan,
    missionItem: missionItem,
    missionItems: missionItems,
    kmz: kmz,
    mount: mount,
  };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
