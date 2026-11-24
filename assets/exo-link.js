/* Fresnel / FSPL link budget, twilight, coordinate copy, ATAK export, and an AES-GCM vault. */
(function (root) {
  var BANDS = [
    { id: "lora915", label: "915 MHz LoRa", hz: 915e6 },
    { id: "ism2400", label: "2.4 GHz", hz: 2.4e9 },
    { id: "vhf", label: "VHF 146.52", hz: 146.52e6 },
    { id: "uhf", label: "UHF 445.0", hz: 445e6 },
  ];
  var armed = "";
  var points = [
    { name: "A", lat: null, lon: null, antM: 2 },
    { name: "B", lat: null, lon: null, antM: 10 },
  ];
  var last = null;
  var host = null;
  var skyEl = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function css() {
    if (document.getElementById("exo-link-css")) return;
    var style = document.createElement("style");
    style.id = "exo-link-css";
    style.textContent = ""
      + ".exo-link,.exo-link *{box-sizing:border-box}"
      + ".exo-link{max-width:100%;min-width:0;color:#e7f4ef;font-family:\"IBM Plex Sans\",system-ui,sans-serif}"
      + ".exo-link__panel{background:rgba(4,7,13,.72);border:1px solid rgba(126,224,255,.28);border-radius:16px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:12px;margin-top:8px}"
      + ".exo-link h3{margin:0 0 8px;font:600 11px/1.2 \"IBM Plex Mono\",ui-monospace,monospace;letter-spacing:.14em;color:#FFB84D}"
      + ".exo-link__row{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}"
      + ".exo-link input,.exo-link select,.exo-link button{min-height:44px;max-width:100%;min-width:0;background:#04070D;color:#7EE0FF;border:1px solid rgba(126,224,255,.4);border-radius:10px;padding:0 8px;font:13px \"IBM Plex Mono\",ui-monospace,monospace}"
      + ".exo-link input{flex:1 1 88px;color:#e7f4ef}"
      + ".exo-link button{cursor:pointer;letter-spacing:.04em}"
      + ".exo-link button.is-on{color:#FFB84D;border-color:#FFB84D}"
      + ".exo-link canvas{width:100%;max-width:100%;height:auto;display:block;margin-top:8px;background:#04070D;border:1px solid rgba(126,224,255,.28);border-radius:12px}"
      + ".exo-link__num{font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\" 1;color:#7EE0FF;font-family:\"IBM Plex Mono\",ui-monospace,monospace;font-size:12px;line-height:1.45;overflow-wrap:anywhere}"
      + ".exo-link__note{color:#9eb0aa;font-size:12px;margin:6px 0 0}";
    document.head.appendChild(style);
  }

  function haversine(a, b) {
    var r = 6371000;
    var p1 = a.lat * Math.PI / 180;
    var p2 = b.lat * Math.PI / 180;
    var dp = (b.lat - a.lat) * Math.PI / 180;
    var dl = (b.lon - a.lon) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function fresnel(d1, d2, hz) {
    var total = d1 + d2;
    if (total <= 0 || hz <= 0) return 0;
    var lambda = 299792458 / hz;
    return Math.sqrt(lambda * d1 * d2 / total);
  }

  function fspl(distanceM, hz) {
    if (distanceM <= 0 || hz <= 0) return 0;
    return 20 * Math.log10(distanceM / 1000) + 20 * Math.log10(hz / 1e6) + 32.44;
  }

  function bulge(d1, d2) {
    return (d1 * d2) / (2 * 6371000 * 4 / 3);
  }

  function bandById(id) {
    for (var i = 0; i < BANDS.length; i++) if (BANDS[i].id === id) return BANDS[i];
    return BANDS[0];
  }

  function plusCode(lat, lon) {
    var alphabet = "23456789CFGHJMPQRVWX";
    var latitude = Math.max(-90, Math.min(90, lat));
    var longitude = ((lon + 180) % 360 + 360) % 360 - 180;
    if (latitude >= 90) latitude = 89.999999;
    var latV = latitude + 90;
    var lonV = longitude + 180;
    var code = "";
    var latRes = 20;
    var lonRes = 20;
    for (var i = 0; i < 5; i++) {
      var latDigit = Math.min(19, Math.floor(latV / latRes));
      var lonDigit = Math.min(19, Math.floor(lonV / lonRes));
      code += alphabet.charAt(latDigit) + alphabet.charAt(lonDigit);
      latV -= latDigit * latRes;
      lonV -= lonDigit * lonRes;
      latRes /= 20;
      lonRes /= 20;
    }
    return code.slice(0, 8) + "+" + code.slice(8);
  }

  function dms(value, pos, neg) {
    var sign = value < 0 ? neg : pos;
    var abs = Math.abs(value);
    var deg = Math.floor(abs);
    var minutesFloat = (abs - deg) * 60;
    var min = Math.floor(minutesFloat);
    var sec = ((minutesFloat - min) * 60).toFixed(1);
    if (Number(sec) < 10) sec = "0" + sec;
    return deg + "°" + String(min).padStart(2, "0") + "'" + sec + '"' + sign;
  }

  function formats(lat, lon) {
    var mgrs = "—";
    if (root.EXO && root.EXO.mgrs) {
      try { mgrs = root.EXO.mgrs.format(lon, lat); } catch (err) { mgrs = "POLAR"; }
    }
    return {
      mgrs: mgrs,
      dd: lat.toFixed(5) + ", " + lon.toFixed(5),
      dms: dms(lat, "N", "S") + " " + dms(lon, "E", "W"),
      plus: (root.EXO && root.EXO.field && root.EXO.field.plusCode) ? root.EXO.field.plusCode(lat, lon) : plusCode(lat, lon),
    };
  }

  function sunElevation(lat, lon, when) {
    if (root.EXO && root.EXO.field && root.EXO.field.sunElevation) return root.EXO.field.sunElevation(lat, lon, when);
    var rad = Math.PI / 180;
    var jd = when.getTime() / 86400000 + 2440587.5;
    var d = jd - 2451545;
    var g = (357.529 + 0.98560028 * d) * rad;
    var q = (280.459 + 0.98564736 * d) * rad;
    var L = q + 1.915 * rad * Math.sin(g) + 0.020 * rad * Math.sin(2 * g);
    var e = (23.439 - 0.00000036 * d) * rad;
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    if (gmst < 0) gmst += 360;
    var ha = (gmst + lon) * rad - Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
    var latr = lat * rad;
    return Math.asin(Math.sin(latr) * Math.sin(dec) + Math.cos(latr) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
  }

  function moonElevation(lat, lon, when) {
    if (root.EXO && root.EXO.field && root.EXO.field.moonElevation) return root.EXO.field.moonElevation(lat, lon, when);
    var rad = Math.PI / 180;
    var d = when.getTime() / 86400000 + 2440587.5 - 2451545;
    var N = (125.1228 - 0.0529538083 * d) * rad;
    var i = 5.1454 * rad;
    var w = (318.0634 + 0.1643573223 * d) * rad;
    var e = 0.0549;
    var M = (115.3654 + 13.0649929509 * d) * rad;
    var E = M + e * Math.sin(M) * (1 + e * Math.cos(M));
    var xv = Math.cos(E) - e;
    var yv = Math.sqrt(1 - e * e) * Math.sin(E);
    var v = Math.atan2(yv, xv);
    var xh = Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i);
    var yh = Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i);
    var zh = Math.sin(v + w) * Math.sin(i);
    var lonecl = Math.atan2(yh, xh);
    var latecl = Math.atan2(zh, Math.hypot(xh, yh));
    var eps = (23.439291 - 0.0130042 * (d / 36525)) * rad;
    var ra = Math.atan2(Math.sin(lonecl) * Math.cos(eps) - Math.tan(latecl) * Math.sin(eps), Math.cos(lonecl));
    var dec = Math.asin(Math.sin(latecl) * Math.cos(eps) + Math.cos(latecl) * Math.sin(eps) * Math.sin(lonecl));
    var gmst = (280.46061837 + 360.98564736629 * d) % 360;
    if (gmst < 0) gmst += 360;
    var ha = (gmst + lon) * rad - ra;
    var latr = lat * rad;
    return Math.asin(Math.sin(latr) * Math.sin(dec) + Math.cos(latr) * Math.cos(dec) * Math.cos(ha)) * 180 / Math.PI;
  }

  function lightName(elev) {
    if (elev > 6) return "DAY";
    if (elev >= 0) return "GOLDEN HOUR";
    if (elev >= -6) return "CIVIL TWILIGHT";
    if (elev >= -12) return "NAUTICAL TWILIGHT";
    if (elev >= -18) return "ASTRONOMICAL TWILIGHT";
    return "NIGHT";
  }

  function paintSky() {
    if (!skyEl) return;
    var point = points[0].lat != null ? points[0] : null;
    if (!point) {
      var fix = readFix();
      if (fix) point = fix;
    }
    if (!point || point.lat == null) { skyEl.textContent = "SUN — · MOON —"; return; }
    var now = new Date();
    var sun = sunElevation(point.lat, point.lon, now);
    var moon = moonElevation(point.lat, point.lon, now);
    skyEl.textContent = "SUN " + sun.toFixed(0) + "° " + lightName(sun) + " · MOON " + moon.toFixed(0) + "°";
  }

  function readFix() {
    var el = document.getElementById("posLL");
    if (!el || el.hidden) return null;
    var match = (el.textContent || "").match(/(-?\d+\.\d+)\s*\/\s*(-?\d+\.\d+)/);
    if (!match) return null;
    return { lat: Number(match[1]), lon: Number(match[2]) };
  }

  function setStatus(text) {
    var el = host && host.querySelector("[data-status]");
    if (el) el.textContent = text;
  }

  function readInputs() {
    ["A", "B"].forEach(function (name, index) {
      var lat = Number(host.querySelector('[data-lat="' + name + '"]').value);
      var lon = Number(host.querySelector('[data-lon="' + name + '"]').value);
      var ant = Number(host.querySelector('[data-ant="' + name + '"]').value);
      points[index].lat = Number.isFinite(lat) ? lat : null;
      points[index].lon = Number.isFinite(lon) ? lon : null;
      points[index].antM = Number.isFinite(ant) ? ant : points[index].antM;
    });
  }

  function writeInputs() {
    points.forEach(function (point) {
      var lat = host.querySelector('[data-lat="' + point.name + '"]');
      var lon = host.querySelector('[data-lon="' + point.name + '"]');
      var ant = host.querySelector('[data-ant="' + point.name + '"]');
      if (point.lat != null) lat.value = point.lat.toFixed(5);
      if (point.lon != null) lon.value = point.lon.toFixed(5);
      ant.value = String(point.antM);
    });
    host.querySelectorAll("[data-arm]").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-arm") === armed);
    });
  }

  function takeClick(lat, lon) {
    if (!armed || !host) return false;
    var index = armed === "B" ? 1 : 0;
    points[index].lat = lat;
    points[index].lon = lon;
    armed = armed === "A" ? "B" : "";
    writeInputs();
    paintSky();
    setStatus(armed ? "NEXT CLICK SETS B" : "POINTS SET");
    return true;
  }

  function buildProfile(samples, hz) {
    var a = points[0];
    var b = points[1];
    var end = samples[samples.length - 1];
    var distance = end.dM || haversine(a, b);
    var worst = Infinity;
    var blocked = false;
    var rows = samples.map(function (sample) {
      var d1 = sample.dM;
      var d2 = Math.max(0, distance - d1);
      var t = distance ? d1 / distance : 0;
      var ground = (sample.elev == null ? 0 : sample.elev);
      var ray = (samples[0].elev || 0) + a.antM + (((samples[samples.length - 1].elev || 0) + b.antM) - ((samples[0].elev || 0) + a.antM)) * t - bulge(d1, d2);
      var f1 = fresnel(d1, d2, hz);
      var clear = ray - f1 - ground;
      if (clear < worst) worst = clear;
      if (ground > ray) blocked = true;
      return { dM: d1, ground: ground, ray: ray, f1: f1, clear: clear };
    });
    return {
      distanceM: distance,
      fspl: fspl(distance, hz),
      worstM: worst,
      blocked: blocked || worst < 0,
      rows: rows,
      hz: hz,
    };
  }

  function draw(profile) {
    var canvas = host.querySelector("canvas");
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    ctx.fillStyle = "#04070D";
    ctx.fillRect(0, 0, w, h);
    if (!profile || !profile.rows.length) return;
    var rows = profile.rows;
    var min = Infinity;
    var max = -Infinity;
    rows.forEach(function (row) {
      min = Math.min(min, row.ground, row.ray - row.f1);
      max = Math.max(max, row.ground, row.ray + row.f1);
    });
    if (max - min < 20) { min -= 10; max += 10; }
    function x(d) { return 12 + (w - 24) * (rows[rows.length - 1].dM ? d / rows[rows.length - 1].dM : 0); }
    function y(v) { return 12 + (h - 24) * (1 - (v - min) / (max - min)); }
    ctx.beginPath();
    rows.forEach(function (row, i) {
      var px = x(row.dM);
      var py = y(row.ray + row.f1);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    for (var i = rows.length - 1; i >= 0; i--) ctx.lineTo(x(rows[i].dM), y(rows[i].ray - rows[i].f1));
    ctx.closePath();
    ctx.fillStyle = "rgba(126,224,255,0.16)";
    ctx.fill();
    ctx.beginPath();
    rows.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(x(row.dM), y(row.ground));
      else ctx.lineTo(x(row.dM), y(row.ground));
    });
    ctx.lineTo(x(rows[rows.length - 1].dM), h - 8);
    ctx.lineTo(x(0), h - 8);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,184,77,0.35)";
    ctx.fill();
    ctx.beginPath();
    rows.forEach(function (row, i) {
      if (i === 0) ctx.moveTo(x(row.dM), y(row.ray));
      else ctx.lineTo(x(row.dM), y(row.ray));
    });
    ctx.strokeStyle = "#7EE0FF";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function profile() {
    readInputs();
    if (points[0].lat == null || points[1].lat == null) { setStatus("NEED TWO POINTS"); return Promise.resolve(null); }
    var band = bandById(host.querySelector("[data-band]").value);
    var n = 48;
    var url = "/api/elevation?a=" + points[0].lat.toFixed(5) + "," + points[0].lon.toFixed(5)
      + "&b=" + points[1].lat.toFixed(5) + "," + points[1].lon.toFixed(5) + "&n=" + n;
    return fetch(url).then(function (res) { return res.json(); }).catch(function () { return { ok: false }; }).then(function (body) {
      var samples = body && body.ok && body.samples && body.samples.length > 1 ? body.samples : null;
      if (!samples) {
        var distance = haversine(points[0], points[1]);
        samples = [];
        for (var i = 0; i < n; i++) {
          var t = i / (n - 1);
          samples.push({
            lat: points[0].lat + (points[1].lat - points[0].lat) * t,
            lon: points[0].lon + (points[1].lon - points[0].lon) * t,
            elev: 0,
            dM: distance * t,
          });
        }
        setStatus("ELEVATION UNAVAILABLE — FLAT PROFILE");
      }
      last = buildProfile(samples, band.hz);
      last.band = band;
      last.samples = samples;
      draw(last);
      var km = last.distanceM / 1000;
      setStatus((last.blocked ? "FRESNEL BLOCKED" : "FRESNEL CLEAR")
        + " · " + km.toFixed(2) + " km · FSPL " + last.fspl.toFixed(1) + " dB · CLEARANCE " + last.worstM.toFixed(1) + " m");
      paintSky();
      paintCopy();
      return last;
    });
  }

  function paintCopy() {
    var box = host.querySelector("[data-copy]");
    if (!box) return;
    var point = points[0].lat != null ? points[0] : points[1];
    if (!point || point.lat == null) { box.textContent = "NO FIX"; return; }
    var pack = formats(point.lat, point.lon);
    box.textContent = pack.mgrs + " · " + pack.dd;
  }

  function copy(kind) {
    readInputs();
    var point = points[0].lat != null ? points[0] : null;
    if (!point) { setStatus("NO FIX"); return; }
    var pack = formats(point.lat, point.lon);
    var text = pack[kind];
    if (!text || text === "POLAR" || text === "—") { setStatus(kind === "mgrs" ? "POLAR" : "NO FIX"); return; }
    var done = function () { setStatus("COPIED " + kind.toUpperCase()); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done).catch(done);
    else done();
  }

  function geojson() {
    readInputs();
    var features = [];
    points.forEach(function (point) {
      if (point.lat == null) return;
      features.push({ type: "Feature", properties: { name: point.name, antM: point.antM }, geometry: { type: "Point", coordinates: [point.lon, point.lat] } });
    });
    if (points[0].lat != null && points[1].lat != null) {
      features.push({
        type: "Feature",
        properties: { name: "LINK", band: host.querySelector("[data-band]").value },
        geometry: { type: "LineString", coordinates: [[points[0].lon, points[0].lat], [points[1].lon, points[1].lat]] },
      });
    }
    return { type: "FeatureCollection", features: features };
  }

  function crc32(bytes) {
    var table = crc32.table;
    if (!table) {
      table = new Uint32Array(256);
      for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
      }
      crc32.table = table;
    }
    var sum = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) sum = table[(sum ^ bytes[i]) & 0xff] ^ (sum >>> 8);
    return (sum ^ 0xffffffff) >>> 0;
  }

  function zipStore(files) {
    var enc = new TextEncoder();
    function u16(n) { return [n & 255, (n >> 8) & 255]; }
    function u32(n) { return [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]; }
    var locals = [];
    var centrals = [];
    var offset = 0;
    files.forEach(function (file) {
      var name = enc.encode(file.name);
      var data = file.bytes;
      var crc = crc32(data);
      var local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), Array.from(name));
      locals.push(new Uint8Array(local), data);
      var central = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), Array.from(name));
      centrals.push(new Uint8Array(central));
      offset += local.length + data.length;
    });
    var centralSize = centrals.reduce(function (sum, part) { return sum + part.length; }, 0);
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(centralSize), u32(offset), u16(0)));
    var chunks = locals.concat(centrals, [end]);
    var total = chunks.reduce(function (sum, part) { return sum + part.length; }, 0);
    var out = new Uint8Array(total);
    var at = 0;
    chunks.forEach(function (part) { out.set(part, at); at += part.length; });
    return out;
  }

  function kml() {
    var bits = ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>EXOpace link</name>'];
    points.forEach(function (point) {
      if (point.lat == null) return;
      bits.push("<Placemark><name>" + point.name + "</name><Point><coordinates>" + point.lon.toFixed(6) + "," + point.lat.toFixed(6) + ",0</coordinates></Point></Placemark>");
    });
    if (points[0].lat != null && points[1].lat != null) {
      bits.push("<Placemark><name>LINK</name><LineString><tessellate>1</tessellate><coordinates>"
        + points[0].lon.toFixed(6) + "," + points[0].lat.toFixed(6) + ",0 "
        + points[1].lon.toFixed(6) + "," + points[1].lat.toFixed(6) + ",0</coordinates></LineString></Placemark>");
    }
    bits.push("</Document></kml>");
    return bits.join("");
  }

  function download(bytes, name, type) {
    var blob = new Blob([bytes], { type: type });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1200);
  }

  function b64(bytes) {
    var text = "";
    bytes.forEach(function (b) { text += String.fromCharCode(b); });
    return btoa(text);
  }

  function unb64(text) {
    var raw = atob(text);
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function vaultKey(passphrase, salt) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]).then(function (key) {
      return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 120000, hash: "SHA-256" },
        key,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );
    });
  }

  function vaultDb() {
    return new Promise(function (resolve) {
      if (!root.indexedDB) { resolve(null); return; }
      var req = root.indexedDB.open("exopace-vault", 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains("snap")) req.result.createObjectStore("snap", { keyPath: "id" });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }

  function vaultAll() {
    return vaultDb().then(function (d) {
      if (!d) return [];
      return new Promise(function (resolve) {
        var req = d.transaction("snap").objectStore("snap").getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      });
    });
  }

  function vaultPut(row) {
    return vaultDb().then(function (d) {
      if (!d) return;
      return new Promise(function (resolve) {
        var req = d.transaction("snap", "readwrite").objectStore("snap").put(row);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { resolve(); };
      });
    });
  }

  function saveSnap() {
    readInputs();
    var name = host.querySelector("[data-vault-name]").value.trim() || "MISSION";
    var pass = host.querySelector("[data-vault-pass]").value;
    if (!pass) { setStatus("NEED A PASSPHRASE"); return; }
    var payload = {
      at: new Date().toISOString(),
      points: points,
      band: host.querySelector("[data-band]").value,
      profile: last ? { distanceM: last.distanceM, fspl: last.fspl, worstM: last.worstM, blocked: last.blocked } : null,
      formats: points[0].lat != null ? formats(points[0].lat, points[0].lon) : null,
    };
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    vaultKey(pass, salt).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
    }).then(function (cipher) {
      return vaultPut({ id: name, name: name, at: Date.now(), salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(cipher)) });
    }).then(function () {
      host.querySelector("[data-vault-pass]").value = "";
      setStatus("SNAPSHOT SEALED");
      listSnaps();
    }).catch(function () { setStatus("VAULT FAILED"); });
  }

  function openSnap(row) {
    var pass = host.querySelector("[data-vault-pass]").value;
    if (!pass) { setStatus("NEED A PASSPHRASE"); return; }
    vaultKey(pass, unb64(row.salt)).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(row.iv) }, key, unb64(row.ct));
    }).then(function (plain) {
      var payload = JSON.parse(new TextDecoder().decode(plain));
      if (payload.points) points = payload.points;
      if (payload.band) host.querySelector("[data-band]").value = payload.band;
      writeInputs();
      paintSky();
      paintCopy();
      setStatus("SNAPSHOT OPEN");
    }).catch(function () { setStatus("PASSPHRASE REJECTED"); });
  }

  function listSnaps() {
    var box = host.querySelector("[data-vault-list]");
    if (!box) return;
    vaultAll().then(function (rows) {
      box.innerHTML = rows.length ? rows.map(function (row) {
        return '<div class="exo-link__row"><span class="exo-link__num">' + esc(row.name) + "</span>"
          + '<button type="button" data-open="' + esc(row.id) + '">OPEN</button></div>';
      }).join("") : '<p class="exo-link__note">No sealed snapshots on this device.</p>';
      box.querySelectorAll("[data-open]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var row = rows.filter(function (item) { return item.id === btn.getAttribute("data-open"); })[0];
          if (row) openSnap(row);
        });
      });
    });
  }

  function shell() {
    host.innerHTML = ''
      + '<div class="exo-link"><div class="exo-link__panel">'
      + "<h3>LINK BUDGET</h3>"
      + '<div class="exo-link__row"><button type="button" data-arm="A">SET A</button><button type="button" data-arm="B">SET B</button><button type="button" data-act="fix">USE FIX</button></div>'
      + '<div class="exo-link__row"><input data-lat="A" inputmode="decimal" placeholder="A lat" aria-label="Point A latitude"><input data-lon="A" inputmode="decimal" placeholder="A lon" aria-label="Point A longitude"><input data-ant="A" inputmode="decimal" value="2" aria-label="Antenna A meters"></div>'
      + '<div class="exo-link__row"><input data-lat="B" inputmode="decimal" placeholder="B lat" aria-label="Point B latitude"><input data-lon="B" inputmode="decimal" placeholder="B lon" aria-label="Point B longitude"><input data-ant="B" inputmode="decimal" value="10" aria-label="Antenna B meters"></div>'
      + '<div class="exo-link__row"><select data-band aria-label="Band">' + BANDS.map(function (band) {
        return '<option value="' + band.id + '">' + band.label + "</option>";
      }).join("") + '</select><button type="button" data-act="profile">PROFILE</button></div>'
      + '<canvas width="640" height="180"></canvas>'
      + '<p class="exo-link__num" data-status>TWO POINTS, THEN PROFILE.</p>'
      + '<p class="exo-link__num" data-sky-inline></p>'
      + '<p class="exo-link__num" data-copy>NO FIX</p>'
      + '<div class="exo-link__row">'
      + '<button type="button" data-copykind="mgrs">MGRS</button>'
      + '<button type="button" data-copykind="dd">DD</button>'
      + '<button type="button" data-copykind="dms">DMS</button>'
      + '<button type="button" data-copykind="plus">PLUS</button>'
      + '<button type="button" data-act="geo">GEOJSON</button>'
      + '<button type="button" data-act="kmz">KMZ</button>'
      + "</div>"
      + "<h3 style=\"margin-top:14px\">VAULT</h3>"
      + '<div class="exo-link__row"><input data-vault-name placeholder="Snapshot name" aria-label="Snapshot name"><input data-vault-pass type="password" placeholder="Passphrase" aria-label="Vault passphrase"></div>'
      + '<div class="exo-link__row"><button type="button" data-act="save">SEAL SNAPSHOT</button></div>'
      + '<div data-vault-list></div>'
      + "</div></div>";
    if (!skyEl) skyEl = host.querySelector("[data-sky-inline]");
    host.addEventListener("click", onClick);
  }

  function onClick(event) {
    var btn = event.target.closest("button");
    if (!btn || !host.contains(btn)) return;
    var arm = btn.getAttribute("data-arm");
    if (arm) { armed = armed === arm ? "" : arm; writeInputs(); setStatus(armed ? "NEXT CLICK SETS " + armed : "CLICK ARM OFF"); return; }
    var kind = btn.getAttribute("data-copykind");
    if (kind) { copy(kind); return; }
    var act = btn.getAttribute("data-act");
    if (act === "profile") profile();
    else if (act === "fix") {
      var fix = readFix();
      if (!fix) { setStatus("NO FIX"); return; }
      points[0].lat = fix.lat;
      points[0].lon = fix.lon;
      writeInputs();
      paintSky();
      paintCopy();
    } else if (act === "geo") {
      download(new TextEncoder().encode(JSON.stringify(geojson())), "exopace-link.geojson", "application/geo+json");
      setStatus("GEOJSON");
    } else if (act === "kmz") {
      readInputs();
      download(zipStore([{ name: "doc.kml", bytes: new TextEncoder().encode(kml()) }]), "exopace-link.kmz", "application/vnd.google-earth.kmz");
      setStatus("KMZ");
    } else if (act === "save") saveSnap();
  }

  function mount(el, sky) {
    host = el;
    skyEl = sky || document.getElementById("exo-sky") || null;
    css();
    shell();
    listSnaps();
    paintSky();
    setInterval(paintSky, 30000);
  }

  function boot() {
    var el = document.getElementById("exo-link");
    if (el && !el.dataset.exoLink) {
      el.dataset.exoLink = "1";
      mount(el, document.getElementById("exo-sky"));
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  root.EXO = root.EXO || {};
  var prior = root.EXO.link || {};
  root.EXO.link = {
    takeClick: takeClick,
    capture: prior.capture || function () { return false; },
    arm: prior.arm,
    fresnel: fresnel,
    fspl: fspl,
    bulge: bulge,
    buildProfile: buildProfile,
    formats: formats,
    plusCode: plusCode,
    sunElevation: sunElevation,
    moonElevation: moonElevation,
    lightName: lightName,
    zipStore: zipStore,
    vaultKey: vaultKey,
    b64: b64,
    unb64: unb64,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
