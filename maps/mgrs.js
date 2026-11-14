/* WGS84 UTM / MGRS. Polar UPS (south of 80S, north of 84N) is refused. */
(function (root) {
  var A = 6378137;
  var F = 1 / 298.257223563;
  var E2 = F * (2 - F);
  var EP2 = E2 / (1 - E2);
  var K0 = 0.9996;
  var BANDS = "CDEFGHJKLMNPQRSTUVWX";

  function zoneFor(lat, lon) {
    var zone = Math.floor((lon + 180) / 6) + 1;
    if (zone > 60) zone = 60;
    if (zone < 1) zone = 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
    if (lat >= 72 && lat < 84) {
      if (lon >= 0 && lon < 9) zone = 31;
      else if (lon >= 9 && lon < 21) zone = 33;
      else if (lon >= 21 && lon < 33) zone = 35;
      else if (lon >= 33 && lon < 42) zone = 37;
    }
    return zone;
  }

  function centralMeridian(zone) {
    return (zone - 1) * 6 - 180 + 3;
  }

  function bandLetter(lat) {
    if (lat < -80 || lat >= 84) return "";
    if (lat >= 72) return "X";
    return BANDS[Math.floor((lat + 80) / 8)];
  }

  function bandRange(letter) {
    var i = BANDS.indexOf(letter);
    if (i < 0) throw new Error("bad latitude band");
    var min = -80 + i * 8;
    var max = letter === "X" ? 84 : min + 8;
    return { min: min, max: max };
  }

  function utm(latDeg, lonDeg, forceZone) {
    if (latDeg < -80 || latDeg > 84) {
      throw new Error("polar UPS is not on these sheets");
    }
    var zone = forceZone || zoneFor(latDeg, lonDeg);
    var lat = latDeg * Math.PI / 180;
    var lon = lonDeg * Math.PI / 180;
    var lon0 = centralMeridian(zone) * Math.PI / 180;
    var sinL = Math.sin(lat);
    var cosL = Math.cos(lat);
    var tanL = Math.tan(lat);
    var N = A / Math.sqrt(1 - E2 * sinL * sinL);
    var T = tanL * tanL;
    var C = EP2 * cosL * cosL;
    var AA = (lon - lon0) * cosL;
    var e4 = E2 * E2;
    var e6 = e4 * E2;
    var M = A * (
      (1 - E2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * lat
      - (3 * E2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * lat)
      + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * lat)
      - (35 * e6 / 3072) * Math.sin(6 * lat)
    );
    var easting = K0 * N * (
      AA
      + (1 - T + C) * AA * AA * AA / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * AA * AA * AA * AA * AA / 120
    ) + 500000;
    var northing = K0 * (
      M + N * tanL * (
        AA * AA / 2
        + (5 - T + 9 * C + 4 * C * C) * AA * AA * AA * AA / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * Math.pow(AA, 6) / 720
      )
    );
    var hemi = "N";
    if (latDeg < 0) {
      northing += 10000000;
      hemi = "S";
    }
    return {
      zone: zone,
      hemi: hemi,
      easting: easting,
      northing: northing,
      band: bandLetter(latDeg),
    };
  }

  function utmInverse(zone, hemi, easting, northing) {
    var e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
    var x = easting - 500000;
    var y = northing;
    if (hemi === "S") y -= 10000000;
    var lon0 = centralMeridian(zone) * Math.PI / 180;
    var M = y / K0;
    var mu = M / (A * (1 - E2 / 4 - 3 * E2 * E2 / 64 - 5 * E2 * E2 * E2 / 256));
    var phi1 = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu)
      + (1097 * Math.pow(e1, 4) / 512) * Math.sin(8 * mu);
    var sinP = Math.sin(phi1);
    var cosP = Math.cos(phi1);
    var tanP = Math.tan(phi1);
    var C1 = EP2 * cosP * cosP;
    var T1 = tanP * tanP;
    var N1 = A / Math.sqrt(1 - E2 * sinP * sinP);
    var R1 = A * (1 - E2) / Math.pow(1 - E2 * sinP * sinP, 1.5);
    var D = x / (N1 * K0);
    var lat = phi1 - (N1 * tanP / R1) * (
      D * D / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );
    var lon = lon0 + (
      D
      - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / cosP;
    return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
  }

  function colLetters(zone) {
    return ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"][(zone - 1) % 3];
  }

  function rowLetters(zone) {
    return zone % 2 === 1 ? "ABCDEFGHJKLMNPQRSTUV" : "FGHJKLMNPQRSTUVABCDE";
  }

  function squareLetters(u) {
    var col = colLetters(u.zone)[Math.floor(u.easting / 100000) - 1];
    var row = rowLetters(u.zone)[Math.floor(u.northing / 100000) % 20];
    if (!col || !row) throw new Error("outside the 100 km letter grid");
    return col + row;
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) s = "0" + s;
    return s;
  }

  /* digits 0..5. 5 is 1 m. Truncates toward the southwest corner. */
  function forward(lon, lat, digits) {
    if (digits == null) digits = 5;
    var u = utm(lat, lon);
    var letters = squareLetters(u);
    var head = String(u.zone) + u.band + letters;
    if (digits === 0) return head;
    var div = Math.pow(10, 5 - digits);
    var e = Math.floor((u.easting % 100000) / div);
    var n = Math.floor((u.northing % 100000) / div);
    return head + pad(e, digits) + pad(n, digits);
  }

  function format(lon, lat) {
    var raw = forward(lon, lat, 5);
    var m = raw.match(/^(\d{1,2})([C-X])([A-Z]{2})(\d{5})(\d{5})$/);
    if (!m) return raw;
    return m[1] + m[2] + " " + m[3] + " " + m[4] + " " + m[5];
  }

  function squareOrigin(zone, band, col, row) {
    var cols = colLetters(zone);
    var rows = rowLetters(zone);
    var ci = cols.indexOf(col);
    var ri = rows.indexOf(row);
    if (ci < 0 || ri < 0) throw new Error("bad 100 km square");
    var easting = (ci + 1) * 100000;
    var range = bandRange(band);
    var minN = utm(Math.min(range.max - 0.0001, range.min + 0.01), centralMeridian(zone), zone).northing;
    /* Southern bands sit on the 10,000 km false northing. Step the 2,000 km cycle. */
    var northing = ri * 100000;
    var guard = 0;
    while (northing + 100000 <= minN && guard < 12) {
      northing += 2000000;
      guard += 1;
    }
    guard = 0;
    while (northing > minN + 2000000 && guard < 12) {
      northing -= 2000000;
      guard += 1;
    }
    return { easting: easting, northing: northing };
  }

  function toLatLon(text) {
    var s = String(text || "").replace(/\s+/g, "").toUpperCase();
    if (!s) throw new Error("blank MGRS");
    var m = s.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z]{2})(\d*)$/);
    if (!m) throw new Error("bad MGRS");
    if (m[4].length % 2) throw new Error("bad MGRS");
    var zone = Number(m[1]);
    var band = m[2];
    var digits = m[4].length / 2;
    var scale = Math.pow(10, 5 - digits);
    var ePart = digits ? Number(m[4].slice(0, digits)) : 0;
    var nPart = digits ? Number(m[4].slice(digits)) : 0;
    var eOff = digits ? ePart * scale + scale / 2 : 50000;
    var nOff = digits ? nPart * scale + scale / 2 : 50000;
    var origin = squareOrigin(zone, band, m[3][0], m[3][1]);
    var hemi = band >= "N" ? "N" : "S";
    return utmInverse(zone, hemi, origin.easting + eOff, origin.northing + nOff);
  }

  /* Grid convergence in degrees. East is positive. This is grid-to-true, not magnetic. */
  function convergence(latDeg, lonDeg, zone) {
    var z = zone || zoneFor(latDeg, lonDeg);
    var lon0 = centralMeridian(z);
    var lat = latDeg * Math.PI / 180;
    var dlon = (lonDeg - lon0) * Math.PI / 180;
    return Math.atan(Math.tan(dlon) * Math.sin(lat)) * 180 / Math.PI;
  }

  root.EXO = root.EXO || {};
  root.EXO.mgrs = {
    utm: utm,
    utmInverse: utmInverse,
    zoneFor: zoneFor,
    forward: forward,
    format: format,
    toLatLon: toLatLon,
    convergence: convergence,
    bandLetter: bandLetter,
  };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.mgrs;
})(typeof globalThis !== "undefined" ? globalThis : this);
