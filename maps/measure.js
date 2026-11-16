/* Two-point leg. Distance is the WGS84 geodesic. Azimuths are clockwise from north at the start. */
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

  root.EXO = root.EXO || {};
  root.EXO.measure = {
    vincenty: vincenty,
    solve: solve,
    gridAzimuth: gridAzimuth,
    magneticAzimuth: magneticAzimuth,
    azText: azText,
    formatDistance: formatDistance,
    lineCoords: lineCoords,
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.measure;
})(typeof globalThis !== "undefined" ? globalThis : this);
