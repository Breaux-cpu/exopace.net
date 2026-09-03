/* EXOpace protocol — browser IIFE (Radio PWA, no bundler).
   Keep in lockstep with protocol/index.js. */
(function (g) {
  const PROTOCOL_VER = "3.0";
  const BLE = {
    namePrefix: "EXOpace",
    service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
    rx: "6e400002-b5a3-f393-e0a9-e50e24dcca9e",
    tx: "6e400003-b5a3-f393-e0a9-e50e24dcca9e",
  };
  const WIFI = { ssidPrefix: "EXOpace-", apPassDefault: "nodelink", wsPath: "/ws", apHost: "192.168.4.1" };
  const TYPES = [
    "hello", "cfg", "chat", "hist", "ack", "gps", "telem", "nodes", "sys", "setcfg",
    "sos", "way", "track", "rf", "presence", "time", "getcfg",
  ];
  const PRESENCE_TAU_S = 180;
  const PRESENCE_DROP_S = 1800;
  const STATION = { id: "MILLINGTON", name: "STATION", lat: 35.346, lon: -89.836, alt: 80 };
  const MEMPHIS = { lat: 35.1495, lon: -90.049 };
  const WAY_KINDS = ["meet", "hazard", "cache", "home"];
  const QUICK_TX = [
    { id: "onsta", text: "On station" },
    { id: "moving", text: "Moving" },
    { id: "relay", text: "Need relay" },
    { id: "sos", text: "SOS", sos: true },
  ];
  function nowSec() { return Date.now() / 1000; }
  function clamp01(v) { const n = +v; return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
  function presenceConf(ago, tau) {
    if (ago == null || !Number.isFinite(ago)) return 0;
    return Math.exp(-Math.max(0, ago) / (tau || PRESENCE_TAU_S));
  }
  function encode(msg) { return JSON.stringify(msg) + "\n"; }
  function parseLine(raw) {
    const t = String(raw || "").trim();
    if (!t) return null;
    try { const m = JSON.parse(t); return m && typeof m.t === "string" ? normalize(m) : null; }
    catch (e) { return null; }
  }
  function normalize(m) {
    if (!m || !m.t) return m;
    if (m.t === "chat" && m.text == null && m.msg != null) m.text = m.msg;
    if (m.t === "gps" && !m.g && m.lat != null) {
      m.g = { fix: m.fix !== false && m.fix !== 0, lat: +m.lat, lon: +m.lon, alt: m.alt, spd: m.spd, hdg: m.hdg, sats: m.sats, hdop: m.hdop };
    }
    if (m.t === "telem" && !m.d) m.d = m;
    if (m.t === "presence") {
      if (m.ago == null && m.ts) m.ago = Math.max(0, nowSec() - m.ts);
      if (m.conf == null) m.conf = presenceConf(m.ago || 0);
      m.conf = clamp01(m.conf);
    }
    return m;
  }
  function applyPresence(node, now) {
    now = now || nowSec();
    const ago = node.last > 1e9 ? Math.max(0, now - node.last) : (node.last == null ? 1e9 : node.last);
    const conf = presenceConf(ago);
    return Object.assign({}, node, { ago, conf, quiet: ago > PRESENCE_DROP_S });
  }
  function demoMesh(t) {
    t = t || nowSec();
    const lat = MEMPHIS.lat, lon = MEMPHIS.lon;
    return {
      me: { id: "7b52f8e3", name: "BASECAMP", lat, lon, alt: 312, spd: 4.2, hdg: 40, sats: 9, fix: 1 },
      cfg: { name: "BASECAMP", freq: "915.0", sf: 9, txp: 17, pass: "nodelink", key: "", keySet: false, gpsRx: 38, gpsTx: 39, gpsPwr: 34, gpsInt: 30 },
      peers: [
        { id: "a1b2c3d4", name: "RIG-1", rssi: -72, snr: 9.1, batt: 88, dlat: 0.018, dlon: 0.022 },
        { id: "77e0f912", name: "TRK-2", rssi: -101, snr: 6.4, batt: 64, dlat: -0.028, dlon: 0.031 },
        { id: "c0ffee01", name: "OP-3", rssi: -88, snr: 7.8, batt: 71, dlat: 0.012, dlon: -0.019 },
        { id: "5e1f00aa", name: "RELAY-N", rssi: -118, snr: 2.1, batt: 41, dlat: 0.055, dlon: -0.008 },
      ].map(function (p, i) {
        return Object.assign({}, p, { lat: lat + p.dlat, lon: lon + p.dlon, last: t - i * 22, ago: i * 22 });
      }),
      ways: [
        { id: "w-home", name: "PAD", lat: STATION.lat, lon: STATION.lon, kind: "home" },
        { id: "w-meet", name: "RV-B", lat: 35.162, lon: -90.021, kind: "meet" },
        { id: "w-haz", name: "WASH", lat: 35.138, lon: -90.072, kind: "hazard" },
      ],
      chats: [
        { t: "chat", from: "a1b2c3d4", fromName: "RIG-1", text: "North line is clear. Moving to site B.", ts: Math.floor(t) - 40, rssi: -72, snr: 9.5 },
      ],
    };
  }
  const DEMO_QUICK = ["Copy that.", "Battery good out here.", "Signal strong on the ridge.", "Heading back at 1700."];
  g.ExoProto = {
    PROTOCOL_VER, BLE, WIFI, TYPES, PRESENCE_TAU_S, PRESENCE_DROP_S, STATION, MEMPHIS,
    WAY_KINDS, QUICK_TX, nowSec, presenceConf, encode, parseLine, normalize,
    applyPresence, demoMesh, DEMO_QUICK,
    makeHello: function (o) { return { t: "hello", id: o.id, name: o.name, ver: o.ver || PROTOCOL_VER }; },
    makeChat: function (o) { return { t: "chat", text: o.text, msg: o.text, to: o.to == null ? "*" : o.to, msgId: o.msgId, from: o.from, fromName: o.fromName, mine: !!o.mine, ts: o.ts != null ? o.ts : Math.floor(nowSec()) }; },
    makeSos: function (o) { return { t: "sos", id: o.id, lat: o.lat, lon: o.lon, msg: o.msg || "SOS", ts: o.ts || Math.floor(nowSec()) }; },
    makeWay: function (o) { return { t: "way", id: o.id, name: o.name, lat: o.lat, lon: o.lon, kind: o.kind || "meet" }; },
    makeTrack: function (o) { return { t: "track", id: o.id, pts: o.pts }; },
    makeRf: function (o) { return { t: "rf", id: o.id, rssi: o.rssi, snr: o.snr, lat: o.lat, lon: o.lon, ts: o.ts || Math.floor(nowSec()) }; },
    makePresence: function (o) { return { t: "presence", id: o.id, conf: clamp01(o.conf), ago: o.ago, lat: o.lat, lon: o.lon, name: o.name }; },
    makeTime: function (o) { return { t: "time", mode: (o && o.mode) || "live", epoch: (o && o.epoch) || Math.floor(nowSec()), rate: (o && o.rate) != null ? o.rate : 1 }; },
    makeSetCfg: function (cfg) { return { t: "setcfg", cfg: cfg }; },
  };
})(window);
