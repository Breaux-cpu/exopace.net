/* MAVLink v2 frames. A failed CRC or a GPS fix below 2D is not a position. */
(function (root) {
  var EXTRA = { 0: 50, 1: 124, 24: 24, 30: 39, 33: 104, 147: 154 };

  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function crcAccumulate(data, crc) {
    var tmp = (data ^ (crc & 0xff)) & 0xff;
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  }

  function crc(bytes, extra) {
    var value = 0xffff;
    for (var i = 0; i < bytes.length; i++) value = crcAccumulate(bytes[i], value);
    if (finite(extra)) value = crcAccumulate(extra, value);
    return value;
  }

  function u32(bytes, at) {
    return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
  }

  function i32(bytes, at) {
    var value = u32(bytes, at);
    return value > 0x7fffffff ? value - 0x100000000 : value;
  }

  function i16(bytes, at) {
    var value = bytes[at] | (bytes[at + 1] << 8);
    return value > 0x7fff ? value - 0x10000 : value;
  }

  function f32(bytes, at) {
    var buf = new ArrayBuffer(4);
    var view = new DataView(buf);
    view.setUint8(0, bytes[at]);
    view.setUint8(1, bytes[at + 1]);
    view.setUint8(2, bytes[at + 2]);
    view.setUint8(3, bytes[at + 3]);
    return view.getFloat32(0, true);
  }

  function parse(bytes) {
    if (!bytes || bytes.length < 12 || bytes[0] !== 0xfd) return null;
    var len = bytes[1];
    var msgid = bytes[7] | (bytes[8] << 8) | (bytes[9] << 16);
    if (bytes.length < 12 + len) return null;
    var extra = EXTRA[msgid];
    if (extra == null) return null;
    var covered = Array.from(bytes.slice(1, 10 + len));
    var expect = bytes[10 + len] | (bytes[11 + len] << 8);
    if (crc(covered, extra) !== expect) return null;
    var payload = bytes.slice(10, 10 + len);
    var frame = { msgid: msgid, sysid: bytes[5], compid: bytes[6], seq: bytes[4] };
    if (msgid === 33 && payload.length >= 22) {
      frame.lat = i32(payload, 4) / 1e7;
      frame.lon = i32(payload, 8) / 1e7;
      frame.altM = i32(payload, 12) / 1000;
      var hdg = payload[20] | (payload[21] << 8);
      frame.headingDeg = hdg === 65535 ? null : hdg / 100;
    }
    if (msgid === 24 && payload.length >= 30) {
      var fix = payload[8];
      frame.fix = fix;
      if (fix >= 2) {
        frame.lat = i32(payload, 9) / 1e7;
        frame.lon = i32(payload, 13) / 1e7;
        frame.altM = i32(payload, 17) / 1000;
      }
    }
    if (msgid === 30 && payload.length >= 28) {
      frame.roll = f32(payload, 4);
      frame.pitch = f32(payload, 8);
      frame.yaw = f32(payload, 12);
    }
    if (msgid === 147 && payload.length >= 10) {
      frame.batteryPct = payload[8] === 255 ? null : payload[8];
    }
    if (msgid === 0) frame.heartbeat = true;
    return frame;
  }

  function pack(msgid, payload) {
    var extra = EXTRA[msgid];
    if (extra == null) return null;
    var head = [0xfd, payload.length, 0, 0, 0, 1, 1, msgid & 255, (msgid >> 8) & 255, (msgid >> 16) & 255];
    var body = head.concat(payload);
    var sum = crc(body.slice(1), extra);
    body.push(sum & 255, (sum >> 8) & 255);
    return Uint8Array.from(body);
  }

  function footprint(frame, hfovDeg) {
    if (!frame || !finite(frame.lat) || !finite(frame.lon) || !finite(frame.altM) || !finite(frame.yaw) || !finite(hfovDeg)) return null;
    if (frame.altM <= 0 || hfovDeg <= 0 || hfovDeg >= 180) return null;
    var ground = 2 * frame.altM * Math.tan(hfovDeg * Math.PI / 360);
    return { lat: frame.lat, lon: frame.lon, headingDeg: frame.yaw, widthM: ground };
  }

  function linkStatus(portCount) {
    var serial = typeof navigator !== "undefined" && navigator.serial;
    var ble = typeof navigator !== "undefined" && navigator.bluetooth;
    if ((!serial && !ble) || !portCount) return "NO USB DEVICE";
    return "STANDBY";
  }

  function paint(documentRef, text) {
    ["exo-mav", "exo-mav-mission"].forEach(function (id) {
      var node = documentRef.getElementById(id);
      if (node) node.textContent = text;
    });
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef) return;
    var nav = typeof navigator !== "undefined" ? navigator : null;
    var serial = nav && nav.serial;
    var ble = nav && nav.bluetooth;
    if ((!serial || typeof serial.getPorts !== "function") && (!ble || typeof ble.getDevices !== "function")) {
      paint(documentRef, "NO USB DEVICE");
      return;
    }
    var jobs = [];
    if (serial && typeof serial.getPorts === "function") {
      jobs.push(serial.getPorts().then(function (list) { return list ? list.length : 0; }).catch(function () { return 0; }));
    }
    if (ble && typeof ble.getDevices === "function") {
      jobs.push(ble.getDevices().then(function (list) { return list ? list.length : 0; }).catch(function () { return 0; }));
    }
    Promise.all(jobs).then(function (counts) {
      var total = counts.reduce(function (sum, count) { return sum + count; }, 0);
      paint(documentRef, linkStatus(total));
    }).catch(function () {
      paint(documentRef, "NO USB DEVICE");
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.mavlink = { crc: crc, parse: parse, pack: pack, footprint: footprint, linkStatus: linkStatus, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
