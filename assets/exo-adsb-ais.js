/* Mode S and AIS from samples that pass CRC. Empty input is not a track. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function crc24(bytes, bits) {
    var crc = 0;
    for (var i = 0; i < bits; i++) {
      var bit = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
      crc = ((crc << 1) | bit) & 0xffffff;
      if (crc & 0x800000) crc = (crc ^ 0xfff409) & 0xffffff;
    }
    return crc;
  }

  function appendCrc(data) {
    var frame = data.slice(0, 11).concat([0, 0, 0]);
    var sum = crc24(frame, 112);
    frame[11] = (sum >> 16) & 255;
    frame[12] = (sum >> 8) & 255;
    frame[13] = sum & 255;
    return frame;
  }

  function modeS(bytes) {
    if (!bytes || bytes.length < 14) return null;
    var frame = bytes.slice(0, 14);
    if (crc24(frame, 112) !== 0) return null;
    var df = frame[0] >> 3;
    var icao = ((frame[1] << 16) | (frame[2] << 8) | frame[3]).toString(16).toUpperCase().padStart(6, "0");
    return { df: df, icao: icao };
  }

  function cprNL(lat) {
    var a = Math.abs(lat);
    var edges = [10.4704713, 14.82817437, 18.18626357, 21.02939493, 23.54504487, 25.82924707, 27.9389871, 29.91135686, 31.77209708, 33.53993436, 35.22899598, 36.85025108, 38.41241892, 39.92256684, 41.38651832, 42.80914012, 44.19454951, 45.54626723, 46.86733252, 48.16039128, 49.42776439, 50.67150166, 51.89342469, 53.09516153, 54.27817472, 55.44378444, 56.59318756, 57.72747354, 58.84763776, 59.95459277, 61.04917774, 62.13216659, 63.20427479, 64.26616523, 65.3184531, 66.36171008, 67.39646774, 68.42322022, 69.44242631, 70.45451075, 71.45986473, 72.45884545, 73.45177442, 74.43893416, 75.42056257, 76.39684391, 77.36789461, 78.33374083, 79.29428225, 80.24923213, 81.19801349, 82.13956981, 83.07199445, 83.99173563, 84.89166191, 85.75541621, 86.53536998, 87];
    for (var i = 0; i < edges.length; i++) if (a < edges[i]) return 59 - i;
    return 1;
  }

  function cprMod(a, b) {
    return a - b * Math.floor(a / b);
  }

  function cprEncode(lat, lon, odd) {
    if (!finite(lat) || !finite(lon)) return null;
    var dlat = odd ? 360 / 59 : 360 / 60;
    var yz = Math.floor(cprMod(lat, dlat) / dlat * 131072 + 0.5) & 131071;
    var nl = cprNL(lat) - (odd ? 1 : 0);
    if (nl < 1) nl = 1;
    var dlon = 360 / nl;
    var xz = Math.floor(cprMod(lon, dlon) / dlon * 131072 + 0.5) & 131071;
    return { lat: yz, lon: xz };
  }

  function cprDecode(evenLat, evenLon, oddLat, oddLon) {
    if (![evenLat, evenLon, oddLat, oddLon].every(finite)) return null;
    var lat0 = evenLat / 131072;
    var lat1 = oddLat / 131072;
    var j = Math.floor(59 * lat0 - 60 * lat1 + 0.5);
    var rlatEven = (360 / 60) * (cprMod(j, 60) + lat0);
    var rlatOdd = (360 / 59) * (cprMod(j, 59) + lat1);
    if (rlatEven >= 270) rlatEven -= 360;
    if (rlatOdd >= 270) rlatOdd -= 360;
    if (cprNL(rlatEven) !== cprNL(rlatOdd)) return null;
    var lat = rlatEven;
    var nl = cprNL(lat);
    if (nl < 1) return null;
    var dlon = 360 / nl;
    var m = Math.floor(evenLon / 131072 * (nl - 1) - oddLon / 131072 * nl + 0.5);
    var lon = dlon * (cprMod(m, nl) + evenLon / 131072);
    if (lon >= 180) lon -= 360;
    if (!finite(lat) || !finite(lon)) return null;
    return { lat: lat, lon: lon };
  }

  function preamble(magnitudes) {
    if (!magnitudes || magnitudes.length < 16) return null;
    var pat = [1, 0, 1, 0, 0, 0, 0, 1, 0, 1];
    var best = -1;
    var at = -1;
    var last = magnitudes.length - pat.length;
    for (var s = 0; s <= last; s++) {
      var acc = 0;
      for (var i = 0; i < pat.length; i++) acc += (pat[i] ? magnitudes[s + i] : 1 - magnitudes[s + i]);
      if (acc > best) {
        best = acc;
        at = s;
      }
    }
    if (best < 8) return null;
    return { at: at, score: best };
  }

  function crc16(bits) {
    var crc = 0xffff;
    for (var i = 0; i < bits.length; i++) {
      var mix = ((crc >> 15) ^ (bits[i] ? 1 : 0)) & 1;
      crc = (crc << 1) & 0xffff;
      if (mix) crc ^= 0x1021;
    }
    return crc;
  }

  function bitsOf(value, width) {
    var out = [];
    for (var i = width - 1; i >= 0; i--) out.push((value >> i) & 1);
    return out;
  }

  function signed(bits) {
    if (!bits.length) return null;
    var n = 0;
    for (var i = 0; i < bits.length; i++) n = (n << 1) | (bits[i] ? 1 : 0);
    var sign = 1 << (bits.length - 1);
    if (n & sign) n -= 1 << bits.length;
    return n;
  }

  function aisPosition(bits) {
    if (!bits || bits.length < 168) return null;
    var body = bits.slice(0, bits.length - 16);
    var expect = signed(bits.slice(bits.length - 16)) & 0xffff;
    if ((crc16(body) & 0xffff) !== expect) return null;
    var type = signed(body.slice(0, 6));
    if (type !== 1 && type !== 2 && type !== 3) return null;
    var mmsi = signed(body.slice(8, 38));
    var lon = signed(body.slice(61, 89)) / 600000;
    var lat = signed(body.slice(89, 116)) / 600000;
    if (!finite(lat) || !finite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    if (mmsi == null || mmsi <= 0) return null;
    return { mmsi: String(mmsi), lat: lat, lon: lon };
  }

  function aisFrame(mmsi, lat, lon) {
    var bits = [];
    bits.push.apply(bits, bitsOf(1, 6));
    bits.push.apply(bits, bitsOf(0, 2));
    bits.push.apply(bits, bitsOf(mmsi, 30));
    while (bits.length < 61) bits.push(0);
    var lonRaw = Math.round(lon * 600000);
    var latRaw = Math.round(lat * 600000);
    bits.push.apply(bits, bitsOf(lonRaw & 0xfffffff, 28));
    bits.push.apply(bits, bitsOf(latRaw & 0x7ffffff, 27));
    while (bits.length < 168 - 16) bits.push(0);
    var crc = crc16(bits);
    bits.push.apply(bits, bitsOf(crc, 16));
    return bits;
  }

  function gmskBits(iq, sampleRate, symbolRate) {
    if (!iq || iq.length < 8 || !finite(sampleRate) || !finite(symbolRate) || symbolRate <= 0) return null;
    var energy = 0;
    for (var i = 0; i < iq.length; i++) {
      if (!finite(iq[i])) return null;
      energy += iq[i] * iq[i];
    }
    if (energy <= 0) return null;
    var sps = Math.max(1, Math.round(sampleRate / symbolRate));
    var prev = Math.atan2(iq[1], iq[0]);
    var bits = [];
    for (var n = sps * 2; n + 1 < iq.length; n += sps * 2) {
      var phase = Math.atan2(iq[n + 1], iq[n]);
      var d = phase - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      prev = phase;
      bits.push(d >= 0 ? 1 : 0);
    }
    return bits.length ? bits : null;
  }

  function tracksFrom(magnitudes, aisBits) {
    var air = [];
    var sea = [];
    if (magnitudes && magnitudes.length && preamble(magnitudes) && magnitudes.message) {
      var hit = modeS(magnitudes.message);
      if (hit) air.push(hit);
    }
    var vessel = aisPosition(aisBits);
    if (vessel) sea.push(vessel);
    return { air: air, sea: sea };
  }

  function linkStatus(usbPresent, deviceCount) {
    if (!usbPresent || !deviceCount) return "NO USB DEVICE";
    return "OFFLINE";
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var host = documentRef.getElementById("exo-tracks");
    if (!host) return;
    var usb = typeof navigator !== "undefined" && navigator.usb;
    if (!usb || typeof usb.getDevices !== "function") {
      host.textContent = "NO USB DEVICE";
      return;
    }
    usb.getDevices().then(function (list) {
      host.textContent = linkStatus(true, list ? list.length : 0);
    }).catch(function () {
      host.textContent = "NO USB DEVICE";
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.adsb = {
    crc24: crc24,
    appendCrc: appendCrc,
    modeS: modeS,
    cprEncode: cprEncode,
    cprDecode: cprDecode,
    preamble: preamble,
    aisFrame: aisFrame,
    aisPosition: aisPosition,
    gmskBits: gmskBits,
    tracksFrom: tracksFrom,
    linkStatus: linkStatus,
    mount: mount,
  };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
