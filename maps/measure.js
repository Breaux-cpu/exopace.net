/* Route legs. Distance is the WGS84 geodesic. Azimuths are clockwise from north at the start of the latest leg. */
(function (root) {
  var A = 6378137;
  var F = 1 / 298.257223563;
  var B = A * (1 - F);

  function wrap360(deg) {
    var x = deg % 360;
    if (x < 0) x += 360;
    return x;
  }

  function wrapPi(rad) {
    var x = rad;
    while (x > Math.PI) x -= 2 * Math.PI;
    while (x < -Math.PI) x += 2 * Math.PI;
    return x;
  }

  /* Vincenty inverse. Null when the iteration does not converge. */
  function vincenty(lat1, lon1, lat2, lon2) {
    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
    if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90) return null;
    if (Math.abs(lon1) > 180 || Math.abs(lon2) > 180) return null;
    if (Math.abs(lat1 - lat2) < 1e-12 && Math.abs(lon1 - lon2) < 1e-12) {
      return { distanceM: 0, trueAz: null };
    }
    var u1 = Math.atan((1 - F) * Math.tan(lat1 * Math.PI / 180));
    var u2 = Math.atan((1 - F) * Math.tan(lat2 * Math.PI / 180));
    var L = wrapPi((lon2 - lon1) * Math.PI / 180);
    var sinU1 = Math.sin(u1);
    var cosU1 = Math.cos(u1);
    var sinU2 = Math.sin(u2);
    var cosU2 = Math.cos(u2);
    var lam = L;
    var sinSigma = 0;
    var cosSigma = 0;
    var sigma = 0;
    var sinAlpha = 0;
    var cos2Alpha = 0;
    var cos2SigmaM = 0;
    var converged = false;
    for (var i = 0; i < 80; i++) {
      var sinLam = Math.sin(lam);
      var cosLam = Math.cos(lam);
      sinSigma = Math.sqrt(
        Math.pow(cosU2 * sinLam, 2) +
        Math.pow(cosU1 * sinU2 - sinU1 * cosU2 * cosLam, 2)
      );
      if (sinSigma === 0) return { distanceM: 0, trueAz: null };
      cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosLam;
      sigma = Math.atan2(sinSigma, cosSigma);
      sinAlpha = cosU1 * cosU2 * sinLam / sinSigma;
      cos2Alpha = 1 - sinAlpha * sinAlpha;
      cos2SigmaM = cos2Alpha === 0 ? 0 : cosSigma - 2 * sinU1 * sinU2 / cos2Alpha;
      var C = F / 16 * cos2Alpha * (2 + F * (4 - 3 * cos2Alpha));
      var next = L + (1 - C) * F * sinAlpha * (
        sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM))
      );
      if (Math.abs(next - lam) < 1e-12) {
        lam = next;
        converged = true;
        break;
      }
      lam = next;
    }
    if (!converged) return null;
    var u2 = cos2Alpha * (A * A - B * B) / (B * B);
    var AA = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
    var BB = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
    var delta = BB * sinSigma * (
      cos2SigmaM + BB / 4 * (
        cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM) -
        BB / 6 * cos2SigmaM * (-3 + 4 * sinSigma * sinSigma) * (-3 + 4 * cos2SigmaM * cos2SigmaM)
      )
    );
    var distance = B * AA * (sigma - delta);
    if (!Number.isFinite(distance) || distance < 0) return null;
    var az = Math.atan2(cosU2 * Math.sin(lam), cosU1 * sinU2 - sinU1 * cosU2 * Math.cos(lam)) * 180 / Math.PI;
    return { distanceM: distance, trueAz: wrap360(az) };
  }

  /* Collar reads grid-to-true, east positive: true azimuth = grid azimuth + convergence. */
  function gridAzimuth(trueAz, convergenceDeg) {
    if (trueAz == null || !Number.isFinite(convergenceDeg)) return null;
    return wrap360(trueAz - convergenceDeg);
  }

  function magneticAzimuth(trueAz, declinationDeg) {
    if (trueAz == null || !Number.isFinite(declinationDeg)) return null;
    return wrap360(trueAz - declinationDeg);
  }

  function solve(lat1, lon1, lat2, lon2, convergenceDeg, declinationDeg) {
    var geo = vincenty(lat1, lon1, lat2, lon2);
    if (!geo) return null;
    return {
      distanceM: geo.distanceM,
      trueAz: geo.trueAz,
      backTrue: geo.trueAz == null ? null : wrap360(geo.trueAz + 180),
      gridAz: gridAzimuth(geo.trueAz, convergenceDeg),
      magAz: magneticAzimuth(geo.trueAz, declinationDeg),
    };
  }

  function azText(deg) {
    if (deg == null || !Number.isFinite(deg)) return "";
    var rounded = Math.round(wrap360(deg) * 10) / 10;
    if (rounded >= 360) rounded = 0;
    var text = rounded.toFixed(1);
    while (text.length < 5) text = "0" + text;
    return text + "°";
  }

  function totalDistance(legs) {
    var total = 0;
    for (var i = 0; i < legs.length; i++) {
      if (!legs[i] || !Number.isFinite(legs[i].distanceM)) return null;
      total += legs[i].distanceM;
    }
    return total;
  }

  /* Horizontal run is the geodesic. Rise is the elevation difference. */
  function slope(distanceM, deltaElevM) {
    if (!Number.isFinite(distanceM) || distanceM <= 0 || !Number.isFinite(deltaElevM)) return null;
    var grade = deltaElevM / distanceM;
    return {
      degrees: Math.atan(grade) * 180 / Math.PI,
      percent: grade * 100,
      pathM: Math.sqrt(distanceM * distanceM + deltaElevM * deltaElevM),
    };
  }

  function xmlText(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function gpx(points) {
    var rows = [];
    (points || []).forEach(function (point) {
      if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return;
      if (Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return;
      var line = '<trkpt lat="' + point.lat.toFixed(6) + '" lon="' + point.lon.toFixed(6) + '">';
      if (Number.isFinite(point.elev)) line += "<ele>" + point.elev.toFixed(1) + "</ele>";
      if (point.name) line += "<name>" + xmlText(point.name) + "</name>";
      rows.push(line + "</trkpt>");
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<gpx version="1.1" creator="EXOpace" xmlns="http://www.topografix.com/GPX/1/1">\n'
      + "<trk><name>EXOpace route</name><trkseg>\n"
      + rows.join("\n")
      + "\n</trkseg></trk>\n</gpx>\n";
  }

  function formatDistance(meters, units) {
    if (!Number.isFinite(meters) || meters < 0) return "";
    if (units === "imperial") {
      var miles = meters / 1609.344;
      if (miles >= 0.1) return miles.toFixed(2) + " MI";
      return Math.round(meters / 0.3048).toLocaleString("en-US") + " FT";
    }
    if (meters >= 10000) return (meters / 1000).toFixed(2) + " KM";
    return Math.round(meters).toLocaleString("en-US") + " M";
  }

  function toVec(lat, lon) {
    var phi = lat * Math.PI / 180;
    var lam = lon * Math.PI / 180;
    var c = Math.cos(phi);
    return [c * Math.cos(lam), c * Math.sin(lam), Math.sin(phi)];
  }

  function lineCoords(a, b) {
    if (!a || !b) return [];
    var start = toVec(a.lat, a.lon);
    var end = toVec(b.lat, b.lon);
    var dot = start[0] * end[0] + start[1] * end[1] + start[2] * end[2];
    if (dot > 1) dot = 1;
    if (dot < -1) dot = -1;
    var omega = Math.acos(dot);
    var steps = omega < 1e-6 ? 1 : 16;
    var raw = [];
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var v;
      if (omega < 1e-6) v = start;
      else {
        var s = Math.sin(omega);
        var w1 = Math.sin((1 - t) * omega) / s;
        var w2 = Math.sin(t * omega) / s;
        v = [w1 * start[0] + w2 * end[0], w1 * start[1] + w2 * end[1], w1 * start[2] + w2 * end[2]];
      }
      var hyp = Math.sqrt(v[0] * v[0] + v[1] * v[1]);
      raw.push([Math.atan2(v[1], v[0]) * 180 / Math.PI, Math.atan2(v[2], hyp) * 180 / Math.PI]);
    }
    var out = [[raw[0][0], raw[0][1]]];
    for (var j = 1; j < raw.length; j++) {
      var lon = raw[j][0];
      var prev = out[j - 1][0];
      while (lon - prev > 180) lon -= 360;
      while (prev - lon > 180) lon += 360;
      out.push([lon, raw[j][1]]);
    }
    return out;
  }

  function zoneNear(lon, zone) {
    if (!Number.isFinite(lon) || !Number.isFinite(zone) || zone < 1 || zone > 60) return false;
    var cm = (zone - 1) * 6 - 180 + 3;
    var d = lon - cm;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return Math.abs(d) <= 4;
  }

  /* Liang-Barsky. A segment on the boundary stays. A miss returns null. */
  function clipSegment(ax, ay, bx, by, box) {
    var dx = bx - ax;
    var dy = by - ay;
    var u1 = 0;
    var u2 = 1;
    var p = [-dx, dx, -dy, dy];
    var q = [ax - box.minX, box.maxX - ax, ay - box.minY, box.maxY - ay];
    for (var i = 0; i < 4; i++) {
      if (Math.abs(p[i]) < 1e-12) {
        if (q[i] < -1e-9) return null;
      } else {
        var t = q[i] / p[i];
        if (p[i] < 0) {
          if (t > u2) return null;
          if (t > u1) u1 = t;
        } else {
          if (t < u1) return null;
          if (t < u2) u2 = t;
        }
      }
    }
    if (u2 < u1) return null;
    return {
      a: { x: ax + u1 * dx, y: ay + u1 * dy },
      b: { x: ax + u2 * dx, y: ay + u2 * dy },
      fromStart: u1 <= 1e-9,
    };
  }

  function clipPolyline(points, box) {
    var runs = [];
    var current = null;
    for (var i = 0; i + 1 < points.length; i++) {
      var a = points[i];
      var b = points[i + 1];
      if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) {
        current = null;
        continue;
      }
      var hit = clipSegment(a.x, a.y, b.x, b.y, box);
      if (!hit) {
        current = null;
        continue;
      }
      if (!current || !hit.fromStart) {
        current = [hit.a];
        runs.push(current);
      }
      current.push(hit.b);
    }
    return runs;
  }

  /* Project the display arc into one UTM zone, then clip to the sheet rectangle.
     Samples more than 4 degrees from that zone are dropped so a long leg cannot
     chord across a page it does not cross. */
  function sheetRoute(points, zone, box, utmFn) {
    var empty = { runs: [], marks: [] };
    if (!points || points.length < 2 || !box || typeof utmFn !== "function") return empty;
    if (!Number.isFinite(box.minX) || !Number.isFinite(box.minY) || !Number.isFinite(box.maxX) || !Number.isFinite(box.maxY)) return empty;
    var line = routeLine(points);
    var projected = [];
    for (var i = 0; i < line.length; i++) {
      var lon = line[i][0];
      var lat = line[i][1];
      while (lon > 180) lon -= 360;
      while (lon < -180) lon += 360;
      if (!zoneNear(lon, zone) || lat < -80 || lat > 84) {
        projected.push(null);
        continue;
      }
      var u;
      try { u = utmFn(lat, lon, zone); }
      catch (err) { projected.push(null); continue; }
      if (!u || !Number.isFinite(u.easting) || !Number.isFinite(u.northing)) {
        projected.push(null);
        continue;
      }
      projected.push({ x: u.easting, y: u.northing });
    }
    var runs = [];
    var chunk = [];
    function flush() {
      if (chunk.length >= 2) {
        clipPolyline(chunk, box).forEach(function (run) { runs.push(run); });
      }
      chunk = [];
    }
    for (var j = 0; j < projected.length; j++) {
      if (!projected[j]) flush();
      else chunk.push(projected[j]);
    }
    flush();
    var marks = [];
    for (var k = 0; k < points.length; k++) {
      var p = points[k];
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      if (!zoneNear(p.lon, zone) || p.lat < -80 || p.lat > 84) continue;
      var placed;
      try { placed = utmFn(p.lat, p.lon, zone); }
      catch (err) { continue; }
      if (!placed || !Number.isFinite(placed.easting) || !Number.isFinite(placed.northing)) continue;
      /* 5 cm covers the UTM inverse/forward remainder on a neatline corner. */
      var edge = 0.05;
      if (placed.easting < box.minX - edge || placed.easting > box.maxX + edge || placed.northing < box.minY - edge || placed.northing > box.maxY + edge) continue;
      marks.push({ x: placed.easting, y: placed.northing, n: k + 1 });
    }
    return { runs: runs, marks: marks };
  }

  function routeLine(points) {
    if (!points || points.length < 2) return [];
    var raw = [];
    for (var i = 0; i < points.length - 1; i++) {
      var part = lineCoords(points[i], points[i + 1]);
      if (!part.length) continue;
      if (!raw.length) raw = part;
      else raw = raw.concat(part.slice(1));
    }
    if (!raw.length) return [];
    var out = [[raw[0][0], raw[0][1]]];
    for (var j = 1; j < raw.length; j++) {
      var lon = raw[j][0];
      var prev = out[j - 1][0];
      while (lon - prev > 180) lon -= 360;
      while (prev - lon > 180) lon += 360;
      out.push([lon, raw[j][1]]);
    }
    return out;
  }

  root.EXO = root.EXO || {};
  root.EXO.measure = {
    vincenty: vincenty,
    solve: solve,
    gridAzimuth: gridAzimuth,
    magneticAzimuth: magneticAzimuth,
    azText: azText,
    formatDistance: formatDistance,
    totalDistance: totalDistance,
    slope: slope,
    gpx: gpx,
    lineCoords: lineCoords,
    routeLine: routeLine,
    clipPolyline: clipPolyline,
    sheetRoute: sheetRoute,
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.measure;
})(typeof globalThis !== "undefined" ? globalThis : this);
