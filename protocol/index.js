/**
 * EXOpace JSON wire protocol — canonical for MOC ↔ Radio ↔ Heltec V4.
 * Preserve existing types. Extend, never break.
 *
 * Existing: hello, cfg, chat, hist, ack, gps, telem, nodes, sys, setcfg
 * New:      sos, way, track, rf, presence, time
 *
 * This ESM file is the source of truth. radio/protocol.js is the browser IIFE
 * (no bundler). Keep constants and type names identical. The shipped MOC
 * bundle inlined an earlier copy — do not invent a second protocol.
 */
export const PROTOCOL_VER = "3.0";
export const BLE = {
  namePrefix: "EXOpace",
  service: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
  rx: "6e400002-b5a3-f393-e0a9-e50e24dcca9e", // phone → node (write)
  tx: "6e400003-b5a3-f393-e0a9-e50e24dcca9e", // node → phone (notify)
};
export const WIFI = {
  ssidPrefix: "EXOpace-",
  apPassDefault: "nodelink",
  wsPath: "/ws",
  apHost: "192.168.4.1",
};

export const TYPES = [
  "hello", "cfg", "chat", "hist", "ack", "gps", "telem", "nodes", "sys", "setcfg",
  "sos", "way", "track", "rf", "presence", "time", "getcfg",
];

/** Presence half-life. Markers fade; they are not hard-deleted. */
export const PRESENCE_TAU_S = 180;
export const PRESENCE_DROP_S = 1800;

export function nowSec() {
  return Date.now() / 1000;
}

export function presenceConf(agoSec, tau = PRESENCE_TAU_S) {
  if (agoSec == null || !Number.isFinite(agoSec)) return 0;
  const a = Math.max(0, agoSec);
  return Math.exp(-a / tau);
}

export function encode(msg) {
  return JSON.stringify(msg) + "\n";
}

export function parseLine(raw) {
  const t = String(raw || "").trim();
  if (!t) return null;
  try {
    const m = JSON.parse(t);
    if (!m || typeof m.t !== "string") return null;
    return normalize(m);
  } catch {
    return null;
  }
}

export function normalize(m) {
  if (!m || !m.t) return m;
  if (m.t === "chat" && m.text == null && m.msg != null) m.text = m.msg;
  if (m.t === "gps" && !m.g && m.lat != null) {
    m.g = {
      fix: m.fix !== false && m.fix !== 0,
      lat: +m.lat, lon: +m.lon,
      alt: m.alt, spd: m.spd, hdg: m.hdg, sats: m.sats, hdop: m.hdop,
    };
  }
  if (m.t === "telem" && !m.d) m.d = m;
  if (m.t === "presence") {
    if (m.ago == null && m.ts) m.ago = Math.max(0, nowSec() - m.ts);
    if (m.conf == null) m.conf = presenceConf(m.ago ?? 0);
    m.conf = clamp01(m.conf);
  }
  return m;
}

export function makeHello({ id, name, ver = PROTOCOL_VER }) {
  return { t: "hello", id, name, ver };
}
export function makeChat({ text, to = "*", msgId, from, fromName, mine, ts }) {
  return { t: "chat", text, msg: text, to, msgId, from, fromName, mine: !!mine, ts: ts ?? Math.floor(nowSec()) };
}
export function makeSos({ id, lat, lon, msg = "SOS", ts }) {
  return { t: "sos", id, lat, lon, msg, ts: ts ?? Math.floor(nowSec()) };
}
export function makeWay({ id, name, lat, lon, kind = "meet" }) {
  return { t: "way", id, name, lat, lon, kind };
}
export function makeTrack({ id, pts }) {
  return { t: "track", id, pts };
}
export function makeRf({ id, rssi, snr, lat, lon, ts }) {
  return { t: "rf", id, rssi, snr, lat, lon, ts: ts ?? Math.floor(nowSec()) };
}
export function makePresence({ id, conf, ago, lat, lon, name }) {
  return { t: "presence", id, conf: clamp01(conf), ago, lat, lon, name };
}
export function makeTime({ mode = "live", epoch, rate = 1 }) {
  return { t: "time", mode, epoch: epoch ?? Math.floor(nowSec()), rate };
}
export function makeSetCfg(cfg) {
  return { t: "setcfg", cfg };
}

export function applyPresence(node, now = nowSec()) {
  const ago = node.last > 1e9 ? Math.max(0, now - node.last) : (node.last ?? 1e9);
  const conf = presenceConf(ago);
  return { ...node, ago, conf, quiet: ago > PRESENCE_DROP_S };
}

export const WAY_KINDS = ["meet", "hazard", "cache", "home"];
export const QUICK_TX = [
  { id: "onsta", text: "On station" },
  { id: "moving", text: "Moving" },
  { id: "relay", text: "Need relay" },
  { id: "sos", text: "SOS", sos: true },
];

function clamp01(v) {
  const n = +v;
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Station — Millington / N Memphis. Honest about being the home pad. */
export const STATION = {
  id: "MILLINGTON",
  name: "STATION",
  lat: 35.346,
  lon: -89.836,
  alt: 80,
};

export const MEMPHIS = { lat: 35.1495, lon: -90.049 };

export function demoMesh(t = nowSec()) {
  const { lat, lon } = MEMPHIS;
  return {
    me: {
      id: "7b52f8e3",
      name: "BASECAMP",
      lat, lon, alt: 312, spd: 4.2, hdg: 40, sats: 9, fix: 1,
    },
    cfg: {
      name: "BASECAMP", freq: "915.0", sf: 9, txp: 17, pass: "nodelink",
      key: "", keySet: false, gpsRx: 38, gpsTx: 39, gpsPwr: 34, gpsInt: 30,
    },
    peers: [
      { id: "a1b2c3d4", name: "RIG-1", rssi: -72, snr: 9.1, batt: 88, dlat: 0.018, dlon: 0.022 },
      { id: "77e0f912", name: "TRK-2", rssi: -101, snr: 6.4, batt: 64, dlat: -0.028, dlon: 0.031 },
      { id: "c0ffee01", name: "OP-3", rssi: -88, snr: 7.8, batt: 71, dlat: 0.012, dlon: -0.019 },
      { id: "5e1f00aa", name: "RELAY-N", rssi: -118, snr: 2.1, batt: 41, dlat: 0.055, dlon: -0.008 },
    ].map((p, i) => ({
      ...p, lat: lat + p.dlat, lon: lon + p.dlon, last: t - i * 22, ago: i * 22,
    })),
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

export const DEMO_QUICK = ["Copy that.", "Battery good out here.", "Signal strong on the ridge.", "Heading back at 1700."];
