/*
 * EXOpace RF scan — web port of RF Sentinel detection signatures.
 * Copyright © 2026 CIS-C0 (original RF Sentinel, https://github.com/CIS-C0/RFSentinel)
 * Copyright © 2026 EXOpace contributors (this web port)
 *
 * This file is free software: you can redistribute it and/or modify it under
 * the terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later
 * version. See sentinel/rf/LICENSE.
 *
 * Signature values follow RF Sentinel's SignatureEngine / HackerWatch / OUI
 * presets. Provenance is cited on each hit.
 */

const ACAB = "all-cameras-are-beacons signature reference (Apache-2.0)";
const SIG = "Bluetooth SIG assigned numbers";
const IEEE = "IEEE registry";
const ASTM = "ASTM F3411 Remote ID (opendroneid-core-c, Apache-2.0)";
const SIGNALSWEEP = "SignalSweep research (GPL-3.0; facts only, no code)";
const FLIPDEFLOCK = "FlipDeFlock (GPL-3.0) probe IE fingerprints";
const AXON_FLEET_GUIDE = "Axon Fleet 2/3 network and Cradlepoint configuration guides (axon.com)";
const SRC_HACK = "SquachWatch DETECTIONS.md; Bluetooth SIG / IEEE registries";

export const APPLE_FIND_MY_LABEL = "Apple Find My tracker away from its owner (AirTag or compatible)";
const DULT_LABEL = "Location tracker away from its owner";

export const CATEGORIES = {
  BODY_CAM: { title: "Body camera / Axon equipment", tag: "BODY CAM", defaultEnabled: true },
  ALPR: { title: "License-plate / traffic enforcement camera", tag: "ALPR", defaultEnabled: true },
  AUDIO_SENSOR: { title: "Audio / gunshot sensor (Flock Raven, ShotSpotter)", tag: "AUDIO", defaultEnabled: true },
  PUBLIC_SAFETY: { title: "Public-safety vendor gear (Motorola, i-PRO...)", tag: "PUBLIC SAFETY", defaultEnabled: true },
  MOBILE_PRINTER: { title: "Mobile printers (Zebra, Brother)", tag: "PRINTER", defaultEnabled: true },
  DRONE: { title: "Drone (Remote ID / drone maker)", tag: "DRONE", defaultEnabled: true },
  TRACKER: { title: "Item tracker away from its owner", tag: "TRACKER", defaultEnabled: true },
  GLASSES: { title: "Smart / recording glasses", tag: "GLASSES", defaultEnabled: true },
  NETWORK_CAMERA: { title: "Network / home security camera", tag: "CAMERA", defaultEnabled: false },
  CELL_ANOMALY: { title: "Fake cell tower signs (IMSI catcher)", tag: "CELL", defaultEnabled: true },
  GNSS: { title: "GPS / satellite jamming or spoofing signs", tag: "GNSS", defaultEnabled: true },
  RADIO: { title: "Two-way radio transmitting nearby (needs an RTL-SDR)", tag: "RADIO", defaultEnabled: true },
  AIRCRAFT: { title: "Police / government aircraft overhead", tag: "AIRCRAFT", defaultEnabled: false },
  POLICE_REPORT: { title: "Waze reports", tag: "WAZE", defaultEnabled: false },
  OTHER_CAMERA: { title: "Action & hidden cameras", tag: "CAMERA+", defaultEnabled: false },
  SKIMMER: { title: "Card skimmers (gas pumps, ATMs)", tag: "SKIMMER", defaultEnabled: true },
  HACKER: { title: "Hacking tools (Flipper Zero, Pineapple, ...)", tag: "HACKER", defaultEnabled: false },
  V2X: { title: "Emergency vehicles over V2X radio", tag: "V2X", defaultEnabled: true },
  CUSTOM: { title: "Your watchlist", tag: "WATCHLIST", defaultEnabled: true },
};

export const VERY_WEAK_MAX = 10;
export const TIER = { WEAK: 0, MEDIUM: 50, STRONG: 80 };

export function tierOf(confidence) {
  if (confidence >= TIER.STRONG) return "strong";
  if (confidence >= TIER.MEDIUM) return "probable";
  return "weak";
}

export function isAlertable(hit, threshold = TIER.MEDIUM) {
  return hit && hit.confidence > VERY_WEAK_MAX && hit.confidence >= threshold;
}

const CID = {
  APPLE: 0x004c,
  TASER: 0x034d,
  MOTOROLA: 0x04ec,
  XUNTONG: 0x09c8,
  LUXOTTICA: 0x0d53,
  SNAPCHAT: 0x03c2,
  VUZIX: 0x060c,
  META: 0x01ab,
  META_TECH: 0x058e,
  ZEBRA: 0x01f1,
  BROTHER: 0x0755,
  DRAEGER: 0x04bc,
  STRYKER: 0x0a5f,
  FLIPPER: 0x0e29,
  ARASHI: 0x10d7,
  GOPRO: 0x02f2,
};

const UUID = {
  AXON: { 0xfc81: "Axon Enterprise", 0xfe6b: "TASER International", 0xfe6c: "TASER International" },
  MOTOROLA: new Set([0xfd8e, 0xfe04]),
  RAVEN: { 0x3100: "GPS", 0x3101: "GPS", 0x3102: "GPS", 0x3200: "power", 0x3300: "network", 0x3400: "upload", 0x3500: "error" },
  FLOCK_GATT: "e8ccbb38-9532-46a8-9fe5-1814df172e6f",
  FLOCK_GATT_2: "20c944c1-add2-42d7-a638-967ee9a26ff6",
  TILE: 0xfeed,
  TILE_2: 0xfeec,
  REMOTE_ID: 0xfffa,
  SMARTTAG: 0xfd5a,
  SMARTTAG_SETUP: 0xfd59,
  DULT: 0xfcb2,
  CHIPOLO: 0xfe33,
  GOOGLE_FMDN: 0xfeaa,
  SPECTACLES: 0xfe45,
  META: new Set([0xfeb7, 0xfeb8]),
  ZEBRA: new Set([0xfe79, 0xfd66]),
  FORTIN: new Set([0xfde1, 0xfdca]),
  DRAEGER: 0xfcda,
  STRYKER: 0xfc6e,
  ZOLL: new Set([0xfe22, 0xfe23]),
  HEYCYAN: "7905fff0-b5ce-4e99-a40f-4b1e122d00d0",
  PTT_CODA: "2320ae58-8394-4652-95f7-0a872ac0958f",
  IDO: 0x0af0,
  SPP: 0x1101,
  FLIPPER: new Set([0x3081, 0x3082, 0x3083]),
  ARASHI: 0xfc30,
  GOPRO: new Set([0xfea5, 0xfea6]),
};

const BASE_UUID = "-0000-1000-8000-00805f9b34fb";

export function uuid16(n) {
  return `0000${Number(n).toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;
}

export function shortOf(uuid) {
  if (uuid == null) return null;
  if (typeof uuid === "number") return uuid & 0xffff;
  const u = String(uuid).toLowerCase();
  const m = new RegExp(`^0000([0-9a-f]{4})${BASE_UUID}$`).exec(u);
  return m ? parseInt(m[1], 16) : null;
}

function normUuid(u) {
  return String(u || "").toLowerCase();
}

function reverseUuid(u) {
  const hex = normUuid(u).replace(/-/g, "");
  if (hex.length !== 32) return u;
  const bytes = hex.match(/../g).reverse().join("");
  return `${bytes.slice(0, 8)}-${bytes.slice(8, 12)}-${bytes.slice(12, 16)}-${bytes.slice(16, 20)}-${bytes.slice(20)}`;
}

const HEYCYAN_REVERSED = reverseUuid(UUID.HEYCYAN);

function hit(category, label, confidence, evidence, source) {
  return {
    category,
    label,
    confidence,
    evidence,
    source,
    tier: tierOf(confidence),
    listOnly: confidence <= VERY_WEAK_MAX,
  };
}

function asBytes(value) {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value);
  return null;
}

function mapToObject(input, keyFn) {
  const out = {};
  if (!input) return out;
  if (input instanceof Map) {
    for (const [k, v] of input) out[keyFn ? keyFn(k) : k] = v;
    return out;
  }
  if (typeof input === "object") {
    for (const [k, v] of Object.entries(input)) out[keyFn ? keyFn(k) : k] = v;
  }
  return out;
}

export function normalizeHex(mac) {
  if (!mac) return "";
  return String(mac).replace(/[^0-9a-f]/gi, "").toUpperCase();
}

export function fmtPrefix(hex) {
  return String(hex || "").toUpperCase().replace(/[^0-9A-F]/g, "").match(/.{1,2}/g)?.join(":") || "";
}

export function isLocallyAdministered(mac) {
  const hex = normalizeHex(mac);
  if (hex.length < 2) return false;
  return (parseInt(hex.slice(0, 2), 16) & 0x02) !== 0;
}

function findSub(bytes, needle) {
  if (!bytes || bytes.length < needle.length) return false;
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

export function containsAscii(bytes, text) {
  const buf = asBytes(bytes);
  if (!buf || !text) return false;
  const fwd = [...text].map((c) => c.charCodeAt(0) & 0xff);
  return findSub(buf, fwd) || findSub(buf, [...fwd].reverse());
}

function u8(bytes, i) {
  const buf = asBytes(bytes);
  return buf && i < buf.length ? buf[i] : 0;
}

function hasTnSerial(data) {
  const d = asBytes(data);
  if (!d) return false;
  for (let i = 0; i < d.length - 2; i++) {
    if (d[i] === 0x54 && d[i + 1] === 0x4e && d[i + 2] >= 0x30 && d[i + 2] <= 0x39) return true;
  }
  return false;
}

function table(entries) {
  return Object.entries(entries)
    .map(([prefix, vendor]) => [prefix.replace(/[^0-9A-F]/gi, "").toUpperCase(), vendor])
    .sort((a, b) => b[0].length - a[0].length);
}

function matchTable(rows, mac) {
  const hex = normalizeHex(mac);
  if (!hex) return null;
  for (const [prefix, vendor] of rows) {
    if (hex.startsWith(prefix)) return { prefix, vendor };
  }
  return null;
}

const ALPR_MAKER_PREFIXES = table({
  "00044C": "Jenoptik", "48E3C3": "Jenoptik", "00E06A": "Kapsch", "0040DE": "Elsag (Leonardo)",
  "70B3D51C0": "Elsag (Leonardo)", "70B3D5520": "Selex ES (Elsag)", "70B3D5F50": "Selex ES (Elsag)",
  "00173D": "Neology", "00307E": "Redflex", "947BBE": "Ubicquia",
});

const EMS_PREFIXES = table({ "40BD9E": "Physio-Control (LIFEPAK)", "000DD1": "Stryker" });

const DRONE_PREFIXES = table(Object.assign(
  Object.fromEntries(["60601F", "34D262", "481CB9", "E47A2C", "58B858", "04A85A", "8C5823", "0C9AE6", "882985", "4C43F6"].map((p) => [p, "DJI"])),
  Object.fromEntries(["9C5A8A", "EC72F7", "3491F0"].map((p) => [p, "DJI Baiwang (DJI subsidiary)"])),
  Object.fromEntries(["00121C", "00267E", "9003B7", "903AE6", "A0143D"].map((p) => [p, "Parrot"])),
  {
    "381D14": "Skydio", "EC5BCDE": "Autel Robotics", "E0B6F58": "Yuneec",
    "EC715E": "Freefly Systems", "B030C8": "Teal Drones", "001AF9": "AeroVironment",
    "8C1F64B07": "AeroVironment", "34B5F32": "Inspired Flight", "AC86D17": "Quantum Systems",
    "8C1F640F1": "ideaForge", "8C1F64A2D": "ACSL", "74B80F": "Zipline",
    "24A10D7": "Cyon Drones", "B44D43A": "UAV Navigation", "14DD48": "Shield AI",
    "E8B470C": "Anduril Industries", "98AAFC7": "Hubsan", "6CDFFBE": "FIMI (Xiaomi drones)",
    "04714B1": "uAvionix (drone Remote ID module)", "546F71": "uAvionix (drone Remote ID module)",
  },
));

const CAMERA_PREFIXES = table(Object.assign(
  Object.fromEntries(["A41162", "FC9C98", "486264"].map((p) => [p, "Arlo"])),
  Object.fromEntries(["3CA070", "70AD43", "741348", "74AB93", "C819D8", "F074C1"].map((p) => [p, "Blink (Amazon)"])),
  { CC47BD: "Rhombus" },
  Object.fromEntries(["B4A382", "4419B6", "54C415", "2857BE", "C056E3", "4CBD8F", "1868CB", "C42F90"].map((p) => [p, "Hikvision"])),
  Object.fromEntries(["E0508B", "3CEF8C", "4C11BF", "A0BD1D", "9002A9"].map((p) => [p, "Dahua"])),
  Object.fromEntries(["00408C", "ACCC8E", "B8A44F", "E82725"].map((p) => [p, "Axis"])),
  Object.fromEntries(["000918", "44B423", "E43022"].map((p) => [p, "Hanwha Vision (Wisenet)"])),
  {
    E0A700: "Verkada", "701AD5": "Avigilon Alta",
  },
  Object.fromEntries(["001BD8", "00407F"].map((p) => [p, "FLIR"])),
  Object.fromEntries(["0010BE", "001281"].map((p) => [p, "March Networks"])),
  { "0013E2": "GeoVision", "0003C5": "Mobotix", "001C27": "Sunell" },
  Object.fromEntries(["000131", "000463", "50FACB9"].map((p) => [p, "Bosch Security"])),
  Object.fromEntries(["000322", "6C27C83"].map((p) => [p, "IDIS"])),
  Object.fromEntries(["48EA63", "6CF17E", "88263F", "C47905"].map((p) => [p, "Uniview"])),
  { "0002D1": "Vivotek", "9C8ECD": "Amcrest", EC71DB: "Reolink" },
  Object.fromEntries(["2CAA8E", "D03F27"].map((p) => [p, "Wyze"])),
  { "0018AE": "TVT", E8ABFA: "Reecam" },
  Object.fromEntries(["187F88", "242BD6", "343EA4", "54E019", "5C475E", "649A63", "90486C", "9C7613", "AC9FC3", "C4DBAD", "CC3BFB"].map((p) => [p, "Ring (Amazon)"])),
  {
    "38F25D": "Ezviz", "14BA88": "Uniview", "3446632": "Amcrest", "A4DA222": "Wyze",
    "0C0EC14": "Swann", "542B57": "Night Owl", D0C193: "SkyBell", B0B3537: "WUUK",
  },
));

const OTHER_CAMERA_PREFIXES = {
  "044169": "GoPro camera", "045747": "GoPro camera", "2474F7": "GoPro camera", "AC04AA": "GoPro camera",
  D43260: "GoPro camera", D4D919: "GoPro camera", D89685: "GoPro camera", F4DD9E: "GoPro camera",
  F05582: "Insta360 camera", "201F55": "DJI Osmo camera", "5870C6": "YI camera",
};

const FLOCK_MODULE_PREFIXES = new Set([
  "70C94E", "3C9180", "D8F3BC", "803049", "B83532", "145AFC", "744CA1", "083A88", "9C2F9D", "C03532",
  "940853", "E4AAEA", "F46ADD", "F8A2D6", "24B2B9", "00F48D", "D03957", "E8D0FC", "E04F43", "B81EA4",
  "700894", "588E81", "EC1BBD", "3C71BF", "5800E3", "9035EA", "5C93A2", "646E69", "4827EA", "A4CF12", "826BF2",
  "14B5CD", "040D84", "1C34F1", "385B44", "943469", "B4E3F9", "F082C0", "E00AF6",
]);
const FLOCK_DOUBTFUL_PREFIXES = new Set(["A4CF12", "F8A2D6", "826BF2"]);
const FLOCK_PROBE_PREFIXES = new Set([...FLOCK_MODULE_PREFIXES].filter((p) => !new Set(["F8A2D6", "A4CF12", "3C71BF", "826BF2"]).has(p)));
const FLOCK_PROBE_SHAPES = { [0x42d75cd1]: "seen on a Flock camera's 70:C9:4E module", [0xd0bbec4c]: "seen on Flock 24:B2:B9 and 70:08:94 modules" };

const RE = {
  penguin: /^Penguin-\d+$/,
  fsHex: /^FS-[0-9A-Fa-f]+$/,
  penguinNumeric: /^\d{8,12}$/,
  zebraSerial: /^[A-Z0-9]{2}[A-Z]{3}\d{9}$/,
  ainaPtt: /^ASB[0-9A-F]{6}$/,
  brotherMobile: /^(rj|pj)-?\d{3,4}/i,
  metaHeadset: /quest|oculus/i,
  idoWatch: /^ID[A-Z]?\d{2,4}[A-Z]?$/,
  invoxia: /^LWT\d{3}_/i,
  axonBodySsid: /^AB([234])-/i,
  axonFleetSsid: /^axon[-_ ]?\d{1,6}[-_ ]?5g$/i,
  vehicleNumber5g: /^\d{2,6}[-_ ]5g$/,
  cradlepoint: /^(ibr\d{3,4}[a-z]{0,4}|r1900|r2100)-[0-9a-f]{3}(-5g)?$/i,
  flockProductSsid: /^(flock|falcon|sparrow|raven|penguin)[_-]/i,
  flockNameWifi: /flockos|flocksafety|pigvision|fs ext battery/i,
  heycyanName: /heycyan|nilox/i,
  rayban: /ray-?ban/i,
  djiHandheld: /^(dji ?)?(osmo|om ?\d|rs ?\d|ronin|mic\b|mic ?(mini|\d))/i,
  skimmerName: /^(HC-0[356]|RN42|BT04-A)\b/i,
};

const PTT_Z_NAMES = new Set(["PTT-Z", "PTT-AZ", "PTT-Z01"]);
const EMERGENCY_WORDS = new Set(["police", "pd", "sheriff", "trooper", "patrol", "k9"]);
const OUI_FLIPPER = "0CFA22";
const HAK5_LA = new Set(["02C0CA", "021337"]);
const STM32WB = new Set(["80E126", "80E127"]);

const HIDDEN_CAMERA_SSIDS = [
  { ssid: /^MV\d{8}$/, app: "V380", confidence: 75, source: "V380 setup guide; SpyGearGadgets setup notes" },
  { ssid: /^DGK-[A-Z0-9]{6}-[A-Z0-9]{5}$/i, app: "LookCam Pro", confidence: 80, source: "V380 setup guide; SpyGearGadgets setup notes" },
  { ssid: /^AI_[A-Z0-9]{6,12}$/i, app: "TinyCam Pro", confidence: 60, source: "V380 setup guide; SpyGearGadgets setup notes" },
  { ssid: /^AI[A-Z0-9]{12}$/, app: "HDSmartIPC", confidence: 55, source: "V380 setup guide; SpyGearGadgets setup notes" },
  { ssid: /^IPC[-_][A-Z0-9]{4,12}$/i, app: "generic IP camera", confidence: 50, source: "Wardrive Go hidden-camera list (facts only)" },
];

const ACTION_CAMERA_NAMES = [
  [/osmo ?(action|pocket|360|nano)/i, "DJI Osmo camera"],
  [/^(hero\d{1,2}\b|gp\d{8}$)/i, "GoPro camera"],
  [/^(sjcam|sj\d{1,2}(pro|air|c)?\b|sj\d{4})/i, "SJCAM camera"],
  [/akaso/i, "AKASO camera"],
  [/^(ydxj_|yi[ _-]?(4k|lite|action|discovery))/i, "YI action camera"],
  [/^virb/i, "Garmin VIRB camera"],
  [/^theta/i, "Ricoh THETA 360 camera"],
  [/pixpro/i, "Kodak PIXPRO camera"],
  [/(hdr-as|fdr-x)\d/i, "Sony action camera"],
  [/apeman|campark|crosstour|victure|dragon ?touch/i, "Action camera"],
];

function manufacturerData(advert) {
  const raw = mapToObject(advert.manufacturerData, (k) => String(typeof k === "number" ? k : parseInt(k, 10) || k));
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const id = Number(k);
    if (Number.isFinite(id)) out[id] = asBytes(v);
  }
  return out;
}

function serviceData(advert) {
  const raw = mapToObject(advert.serviceData, (k) => normUuid(k));
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[normUuid(k)] = asBytes(v);
  return out;
}

function allShorts(advert, sdata) {
  const shorts = new Set();
  for (const u of advert.serviceUuids || []) {
    const s = shortOf(u);
    if (s != null) shorts.add(s);
  }
  for (const u of Object.keys(sdata || {})) {
    const s = shortOf(u);
    if (s != null) shorts.add(s);
  }
  return shorts;
}

function uuidSet(advert, sdata) {
  const set = new Set((advert.serviceUuids || []).map(normUuid));
  for (const u of Object.keys(sdata || {})) set.add(normUuid(u));
  return set;
}

function isTaserIdSquatter(advert, name, shorts, mfg) {
  const payload = mfg[CID.TASER];
  if (!payload) return false;
  const own = normalizeHex(advert.mac).match(/../g)?.map((h) => parseInt(h, 16));
  if (!own || own.length !== 6 || payload.length < 6) return false;
  const repeats = own.every((b, i) => payload[i] === b);
  return repeats && (shorts.has(UUID.IDO) || RE.idoWatch.test(name));
}

function isBleRemoteId(data) {
  const d = asBytes(data);
  return !!(d && d.length >= 2 + 25 && d[0] === 0x0d);
}

function droneByPrefix(advert) {
  if (advert.randomBle || isLocallyAdministered(advert.mac)) return null;
  const name = (advert.name || "").trim();
  if (name && RE.djiHandheld.test(name)) return null;
  const found = matchTable(DRONE_PREFIXES, advert.mac);
  if (!found) return null;
  return hit("DRONE", `${found.vendor} equipment (drone or controller)`, 60,
    `Address in ${found.vendor}'s registered block ${fmtPrefix(found.prefix)}; no Remote ID decoded`,
    `${IEEE}; ${ACAB}`);
}

function axonPairingSsid(ssid) {
  if (RE.axonFleetSsid.test(ssid)) return null;
  const m = RE.axonBodySsid.exec(ssid);
  if (m) {
    const gen = m[1];
    return hit("BODY_CAM", `Axon Body ${gen} camera (pairing network)`, 80,
      `WiFi network "${ssid}": Axon Body ${gen} cameras open an "AB${gen}-" network while pairing`,
      `Axon admin documentation; ${SIGNALSWEEP}`);
  }
  if (ssid.toLowerCase().startsWith("axon-")) {
    return hit("BODY_CAM", "Axon device hotspot (body camera or in-car)", 75,
      `WiFi network "${ssid}": the "AXON-" hotspot Axon devices open`,
      `Axon admin documentation; ${SIGNALSWEEP}`);
  }
  return null;
}

function namesPolice(ssid) {
  const parts = ssid.toLowerCase().split(/[^a-z0-9]+/);
  return parts.some((w) => EMERGENCY_WORDS.has(w) || w.split(/(?<=[a-z])(?=[0-9])|(?<=[0-9])(?=[a-z])/).some((p) => EMERGENCY_WORDS.has(p)));
}

function policeVehicleSsid(ssid) {
  if (RE.axonFleetSsid.test(ssid)) {
    return hit("PUBLIC_SAFETY", "Police car network - Axon Fleet in-car video", 80,
      `WiFi network "${ssid}" follows Axon's Fleet naming ("Axon12-5g")`, AXON_FLEET_GUIDE);
  }
  if (RE.vehicleNumber5g.test(ssid)) {
    return hit("PUBLIC_SAFETY", "Possible police car network (vehicle number + -5g)", 45,
      `WiFi network "${ssid}" matches Axon's vehicle-number + "-5g" examples`, AXON_FLEET_GUIDE);
  }
  if (RE.cradlepoint.test(ssid)) {
    return hit("PUBLIC_SAFETY", "Cradlepoint vehicle router (default name)", 40,
      `WiFi network "${ssid}" is a Cradlepoint default. Police cars, but also ambulances, buses, utility fleets and traffic-signal cabinets`,
      `Cradlepoint default SSID (product label); ${IEEE}`);
  }
  if (namesPolice(ssid)) {
    return hit("PUBLIC_SAFETY", "Police network name", 45,
      `WiFi network "${ssid}" names a police service. Stronger on a Cradlepoint or Sierra Wireless router`,
      "Network-name keywords, after Wardrive Go's emergency-router filter");
  }
  return null;
}

function classifyBle(advert) {
  const hits = [];
  const name = (advert.name || "").trim();
  const mfg = manufacturerData(advert);
  const sdata = serviceData(advert);
  const shorts = allShorts(advert, sdata);
  const uuids = uuidSet(advert, sdata);
  const payloads = [...Object.values(sdata), ...Object.values(mfg)].filter(Boolean);

  if (payloads.some((p) => containsAscii(p, "BWCDEVICE")) || containsAscii(advert.rawBytes, "BWCDEVICE")) {
    hits.push(hit("BODY_CAM", "Axon body camera", 90,
      'Advert payload carries Axon\'s "BWCDEVICE" tag (works even with a randomized address)',
      `${ACAB} - field-validated against visually confirmed cameras`));
  }
  if (mfg[CID.TASER] && !isTaserIdSquatter(advert, name, shorts, mfg)) {
    hits.push(hit("BODY_CAM", "Axon / TASER equipment (type unknown)", 60,
      "Manufacturer data from company ID 0x034D (TASER International)",
      `${SIG}; ID spans body cams, holster sensors, TASER handles and batteries`));
  }
  for (const [u, label] of Object.entries(UUID.AXON)) {
    if (shorts.has(Number(u))) {
      hits.push(hit("BODY_CAM", "Axon / TASER equipment (type unknown)", 60,
        `Service UUID 0x${Number(u).toString(16).toUpperCase().padStart(4, "0")} (${label})`, SIG));
      break;
    }
  }
  if (name.toLowerCase().includes("bodyworn remote")) {
    hits.push(hit("BODY_CAM", "Utility BodyWorn camera remote", 80,
      'Advertised name contains "BodyWorn Remote"', `${ACAB} (nite-oui-collection capture)`));
  }

  if (mfg[CID.MOTOROLA] || [...UUID.MOTOROLA].some((u) => shorts.has(u))) {
    hits.push(hit("PUBLIC_SAFETY", "Motorola Solutions equipment (radio, camera or accessory)", 45,
      "Motorola Solutions company ID 0x04EC or service UUID 0xFD8E/0xFE04",
      `${SIG}; the same IDs are used by retail, school and venue two-way radios`));
  }
  let ptt = null;
  if ([...uuids].some((u) => u === UUID.PTT_CODA)) ptt = "Coda / Blu-PTT service UUID 2320ae58-...";
  else if (RE.ainaPtt.test(name)) ptt = `AINA PTT Smart Button name "${name}" (ASB + 6 characters)`;
  else if (PTT_Z_NAMES.has(name)) ptt = `push-to-talk button name "${name}"`;
  if (ptt) {
    hits.push(hit("PUBLIC_SAFETY", "Push-to-talk button (phone radio app)", 30,
      `${ptt} - pairs with phone PTT apps such as ESChat, used by police and EMS but also security guards, schools and transport crews. A connected button may stay quiet`,
      "Fieldwatch catalog (OffGridPete, MIT)"));
  }

  for (const u of UUID.ZEBRA) {
    if (shorts.has(u)) {
      hits.push(RE.zebraSerial.test(name)
        ? hit("MOBILE_PRINTER", "Zebra mobile printer (e-ticket printer in patrol cars)", 50,
          `Service UUID 0x${u.toString(16).toUpperCase().padStart(4, "0")} (Zebra) and a factory serial-number name "${name}" - an unrenamed fleet printer. Also used by parking officers, couriers and field technicians`,
          `${SIG}; Zebra Link-OS BLE app note (default friendly name = serial); field capture`)
        : hit("MOBILE_PRINTER", "Zebra printer", 30,
          `Service UUID 0x${u.toString(16).toUpperCase().padStart(4, "0")} (Zebra Technologies) - common in warehouses, stores and deliveries`, SIG));
      break;
    }
  }
  if (mfg[CID.ZEBRA] && ![...UUID.ZEBRA].some((u) => shorts.has(u))) {
    hits.push(hit("MOBILE_PRINTER", "Zebra device (mobile printer or handheld)", 25,
      "Zebra Technologies company ID 0x01F1 - mobile printers (incl. e-ticket printers) but also store scanners and handhelds", SIG));
  }
  if (mfg[CID.BROTHER]) {
    hits.push(RE.brotherMobile.test(name)
      ? hit("MOBILE_PRINTER", "Brother mobile printer (RuggedJet / PocketJet)", 35,
        `Brother Industries company ID 0x0755 and a mobile-printer model name "${name}" - in-car printers for tickets and reports, but also utility, delivery and field-service vans`, SIG)
      : hit("MOBILE_PRINTER", "Brother printer", 20,
        "Brother Industries company ID 0x0755 - RuggedJet / PocketJet in-car printers, but mostly home and office printers", SIG));
  }
  if ([...UUID.FORTIN].some((u) => shorts.has(u))) {
    hits.push(hit("PUBLIC_SAFETY", "Fortin vehicle interface module", 20,
      "Fortin Electronic Systems service UUID 0xFDE1/0xFDCA - interface modules used when upfitting police vehicles, but also remote starters in many ordinary cars", SIG));
  }
  if (mfg[CID.DRAEGER] || shorts.has(UUID.DRAEGER)) {
    hits.push(hit("PUBLIC_SAFETY", "Dräger device (breath / drug screening or medical)", 35,
      "Draegerwerk company ID 0x04BC or service UUID 0xFCDA - Dräger makes the roadside breath (Alcotest) and drug (DrugTest) screening devices police use, and hospital and gas-detection gear", SIG));
  }
  if ([...UUID.ZOLL].some((u) => shorts.has(u))) {
    hits.push(hit("PUBLIC_SAFETY", "ZOLL medical device (ambulance defibrillator / monitor)", 40,
      "Zoll Medical service UUID 0xFE22/0xFE23 - ZOLL X Series and AED monitors in ambulances, but also hospital gear and the LifeVest a heart patient can wear",
      `${SIG}; Wardrive Go's EMS list (facts only)`));
  }
  if (mfg[CID.STRYKER] || shorts.has(UUID.STRYKER)) {
    hits.push(hit("PUBLIC_SAFETY", "Stryker medical device (LIFEPAK defibrillator, ambulance stretcher)", 35,
      "Stryker company ID 0x0A5F or service UUID 0xFC6E - LIFEPAK monitors and powered stretchers in ambulances, and plenty of hospital equipment",
      `${SIG}; Wardrive Go's EMS list (facts only)`));
  }

  const xuntong = !!mfg[CID.XUNTONG];
  if (name.toLowerCase().includes("fs ext battery")) {
    hits.push(hit("ALPR", "Flock Safety camera battery", 80, 'Advertised name "FS Ext Battery"', `${ACAB} (ryanohoro research)`));
  } else if (RE.penguin.test(name)) {
    hits.push(hit("ALPR", "Flock Safety device", xuntong ? 80 : 70,
      `Name pattern "Penguin-<digits>"${xuntong ? " plus XUNTONG module ID 0x09C8" : ""}`, `${ACAB} (ryanohoro research)`));
  } else if (RE.fsHex.test(name)) {
    hits.push(hit("ALPR", "Flock Safety device", xuntong ? 80 : 70,
      `Name pattern "FS-<hex>"${xuntong ? " plus XUNTONG module ID 0x09C8" : " (generic white-label prefix - verify)"}`,
      `${ACAB} (field capture 2026-06)`));
  } else if (xuntong && RE.penguinNumeric.test(name)) {
    hits.push(hit("ALPR", "Flock Safety device", 80,
      `Numeric name "${name}" plus XUNTONG module ID 0x09C8 (newer Penguin firmware)`,
      `${ACAB} (flock-detection research)`));
  } else if (xuntong && hasTnSerial(mfg[CID.XUNTONG])) {
    hits.push(hit("ALPR", "Flock Safety device", 80,
      'XUNTONG module ID 0x09C8 with a "TN<digits>" serial in its data (Flock Penguin battery)',
      `${SIGNALSWEEP}; oui-spy notes`));
  } else if (name.toLowerCase().startsWith("flock")) {
    hits.push(hit("ALPR", "Possible Flock Safety device", 55,
      'Advertised name starts with "Flock" (brand string - verify)', ACAB));
  } else if (name.toLowerCase().includes("pigvision")) {
    hits.push(hit("ALPR", "Possible Flock Safety device", 55,
      `Advertised name "${name}" (Pigvision: Flock camera name - verify)`, `${ACAB} (flock-detection research)`));
  } else if (xuntong) {
    hits.push(hit("ALPR", "XUNTONG Bluetooth module (used in Flock hardware)", 45,
      "Company ID 0x09C8 - shared silicon, also in other products", `${SIG}; ${ACAB}`));
  }
  if (uuids.has(UUID.FLOCK_GATT)) {
    hits.push(hit("ALPR", "Flock Safety device", 80,
      "Flock accessory service UUID e8ccbb38-... (from Flock camera firmware)", "Flock-You research; SquachWatch"));
  } else if (uuids.has(UUID.FLOCK_GATT_2)) {
    hits.push(hit("ALPR", "Flock Safety device", 80,
      "Flock accessory service UUID 20c944c1-... (from Flock camera firmware)", `Flock-You research; ${SIGNALSWEEP}`));
  }

  const ravenFound = Object.keys(UUID.RAVEN).map(Number).filter((u) => shorts.has(u));
  if (ravenFound.length) {
    hits.push(hit("AUDIO_SENSOR", "Flock Raven audio / gunshot sensor", 80,
      "Raven service UUIDs: " + ravenFound.map((u) => `0x${u.toString(16).toUpperCase().padStart(4, "0")} (${UUID.RAVEN[u]})`).join(", "),
      `${ACAB} (field capture)`));
  }

  const rid = sdata[uuid16(UUID.REMOTE_ID)];
  if (rid && isBleRemoteId(rid)) {
    hits.push(hit("DRONE", "Drone broadcasting Remote ID", 95,
      "ASTM F3411 Remote ID message on service UUID 0xFFFA", ASTM));
  }
  const drone = droneByPrefix(advert);
  if (drone) hits.push(drone);

  const apple = mfg[CID.APPLE];
  if (apple && apple.length >= 2 && u8(apple, 0) === 0x12 && u8(apple, 1) === 0x19) {
    hits.push(hit("TRACKER", APPLE_FIND_MY_LABEL, 70,
      "Apple Find My offline-finding frame (type 0x12, length 0x19 = separated state)",
      `${ACAB}; arXiv 2501.17452`));
  }
  const fmdn = sdata[uuid16(UUID.GOOGLE_FMDN)];
  if (fmdn && fmdn.length && u8(fmdn, 0) === 0x41) {
    hits.push(hit("TRACKER", "Google Find Hub tracker away from its owner", 70,
      "Find Hub Network frame 0x41 (separated state) on UUID 0xFEAA",
      `Google Find Hub Network Accessory Spec; ${ACAB}`));
  }
  const dult = sdata[uuid16(UUID.DULT)];
  if (dult && dult.length >= 2 && (u8(dult, 1) & 1) === 0) {
    hits.push(hit("TRACKER", DULT_LABEL, 70,
      "Unwanted-tracker standard frame on UUID 0xFCB2, near-owner bit clear (separated state)",
      "IETF draft-ietf-dult-accessory-protocol-01"));
  }
  const smartTag = sdata[uuid16(UUID.SMARTTAG)];
  if (smartTag && smartTag.length) {
    hits.push(hit("TRACKER", "Samsung SmartTag", 55, "Service data on UUID 0xFD5A (Samsung)", `${SIG}; arXiv 2501.17452`));
  } else if (sdata[uuid16(UUID.SMARTTAG_SETUP)]?.length) {
    hits.push(hit("TRACKER", "Samsung SmartTag (not set up yet)", 40,
      "Service data on UUID 0xFD59 (Samsung): a tag still being set up, usually next to its owner",
      `${SIG}; arXiv 2210.14702; ${SIGNALSWEEP}`));
  }
  const tile = sdata[uuid16(UUID.TILE)] || sdata[uuid16(UUID.TILE_2)];
  if (tile && tile.length) {
    hits.push(hit("TRACKER", "Tile tracker", 55, "Service data on UUID 0xFEED / 0xFEEC (Tile, Inc.)", SIG));
  }
  if (sdata[uuid16(UUID.CHIPOLO)] || [...(advert.serviceUuids || [])].map(normUuid).includes(uuid16(UUID.CHIPOLO))) {
    hits.push(hit("TRACKER", "Chipolo tracker", 55, "Service UUID 0xFE33 (CHIPOLO d.o.o.)", `${SIG}; AirGuard (SEEMOO, Apache-2.0)`));
  }
  if (RE.invoxia.test(name)) {
    hits.push(hit("TRACKER", "Invoxia GPS tracker", 55,
      `Advertised name "${name}" (Invoxia LWT100 GPS tracker; names can be changed - verify)`,
      "Tester field capture 2026-11-22"));
  }

  if ([...uuids].some((u) => u === UUID.HEYCYAN || u === HEYCYAN_REVERSED)) {
    hits.push(hit("GLASSES", "Camera smart glasses (HeyCyan SDK, e.g. Nilox Smart AI Glasses)", 68,
      "HeyCyan glasses SDK service UUID (full 128-bit match)", `${ACAB} (yj_nearbyglasses)`));
  } else if (RE.heycyanName.test(name)) {
    hits.push(hit("GLASSES", "Camera smart glasses (HeyCyan SDK, e.g. Nilox Smart AI Glasses)", 55,
      `Advertised name "${name}" (HeyCyan / Nilox; names can be changed - verify)`, "yj_nearbyglasses name tokens"));
  }
  if (!mfg[CID.LUXOTTICA] && RE.rayban.test(name)) {
    hits.push(hit("GLASSES", "Ray-Ban Meta smart glasses", 55,
      `Advertised name "${name}" (names can be changed - verify)`, "yj_nearbyglasses name tokens"));
  }
  if (mfg[CID.LUXOTTICA]) {
    hits.push(hit("GLASSES", "Ray-Ban Meta smart glasses", 70, "Company ID 0x0D53 (Luxottica)", SIG));
  }
  if (mfg[CID.SNAPCHAT] || shorts.has(UUID.SPECTACLES)) {
    hits.push(hit("GLASSES", "Snap Spectacles camera glasses", 70, "Snapchat company ID 0x03C2 or service UUID 0xFE45", SIG));
  }
  if (mfg[CID.VUZIX]) {
    hits.push(hit("GLASSES", "Vuzix camera AR glasses", 70, "Company ID 0x060C (Vuzix)", SIG));
  }
  if (mfg[CID.META_TECH] && containsAscii(mfg[CID.META_TECH], "META_RB_GLASS")) {
    hits.push(hit("GLASSES", "Ray-Ban / Oakley Meta smart glasses", 72,
      "Meta manufacturer data carries the META_RB_GLASS token", ACAB));
  }
  if ((mfg[CID.META] || [...UUID.META].some((u) => shorts.has(u))) && !RE.metaHeadset.test(name)) {
    hits.push(hit("GLASSES", "Meta hardware - possibly Ray-Ban Meta glasses", 45,
      "Meta Platforms company ID 0x01AB or UUID 0xFEB7/0xFEB8 (also used by Quest headsets)",
      `${SIG}; ${ACAB} field capture 2026-07-31`));
  }
  return hits;
}

function classifyWifi(advert) {
  const hits = [];
  const ssid = (advert.name || "").trim();
  const module = normalizeHex(advert.mac).slice(0, 6);
  const wifi = advert.wifi || {};

  if (ssid.toLowerCase().startsWith("flock-")) {
    hits.push(hit("ALPR", "Flock Safety camera", 88,
      `WiFi network "${ssid}" (Flock- prefix: the vendor names its own AP)`,
      `${ACAB} (ryanohoro, GainSec research)`));
  } else if (RE.flockNameWifi.test(ssid) || RE.penguin.test(ssid)) {
    hits.push(hit("ALPR", "Possible Flock Safety device", 60,
      `WiFi network "${ssid}" (Flock product name - verify)`, `${ACAB} (flock-detection / flock-you research)`));
  }

  if (wifi.client !== true && FLOCK_DOUBTFUL_PREFIXES.has(module)) {
    if (!ssid || (RE.flockProductSsid.test(ssid) && !ssid.toLowerCase().startsWith("flock-"))) {
      hits.push(hit("ALPR", "Very weak Flock signature", VERY_WEAK_MAX,
        `${ssid ? `WiFi network "${ssid}"` : "Hidden WiFi network"} on ${fmtPrefix(module)}, a doubtful community-listed Flock module prefix also found in ordinary devices. Listed only, never alerted`,
        `${ACAB} (flock-you list); ${SIGNALSWEEP}`));
    }
  } else if (wifi.client !== true && FLOCK_MODULE_PREFIXES.has(module)) {
    if (RE.flockProductSsid.test(ssid) && !ssid.toLowerCase().startsWith("flock-")) {
      hits.push(hit("ALPR", "Flock Safety camera", 85,
        `WiFi network "${ssid}" (Flock product name) on a WiFi module Flock cameras use (${fmtPrefix(module)})`,
        `${ACAB} (flock-you / MILLIE research)`));
    } else if (!ssid) {
      hits.push(hit("ALPR", "Possible Flock camera (hidden network)", 35,
        `Hidden WiFi network on a module Flock cameras use (${fmtPrefix(module)}); the same chips are in many ordinary devices - verify`,
        `${ACAB} (flock-you / MILLIE research)`));
    }
  }

  if (wifi.client && wifi.wildcardProbe && !isLocallyAdministered(advert.mac) && FLOCK_PROBE_PREFIXES.has(module)) {
    hits.push(wifi.flockProbeIe
      ? hit("ALPR", "Flock Safety camera (probe request)", 75,
        `Wildcard probe requests from a WiFi module Flock cameras use (${fmtPrefix(module)}), carrying the Wi-Fi Alliance element 50:6F:9A:16 03 01 03 Flock cameras send. Ordinary devices with the same chip can match - verify`,
        `${SIGNALSWEEP}; DeFlock / flock-you research`)
      : hit("ALPR", "Possible Flock camera (probe request)", 60,
        `Wildcard probe requests from a WiFi module Flock cameras use (${fmtPrefix(module)}). In field tests this caught 11 of 12 cameras with 2 false alarms; ordinary devices with the same chip can match - verify`,
        `${SIGNALSWEEP}; DeFlock / flock-you research`));
  }
  const shape = wifi.probeSkeleton;
  if (wifi.client && shape != null && FLOCK_PROBE_SHAPES[shape]) {
    const onModule = !isLocallyAdministered(advert.mac) && FLOCK_PROBE_PREFIXES.has(module);
    hits.push(hit("ALPR", "Possible Flock camera (probe shape)", onModule ? 50 : 35,
      `Its probe requests are built exactly like a Flock camera's (shape ${Number(shape).toString(16).padStart(8, "0")}, ${FLOCK_PROBE_SHAPES[shape]})${onModule ? ` on a module Flock cameras use (${fmtPrefix(module)})` : ""}. One report so far, and other devices can share a shape - verify`,
      FLIPDEFLOCK));
  }

  if (wifi.client !== true) {
    const axon = axonPairingSsid(ssid);
    if (axon) hits.push(axon);
  }
  if (ssid.startsWith("ARLO_VMB_") || ssid.startsWith("NTGR_VMB_")) {
    hits.push(hit("NETWORK_CAMERA", "Arlo camera base station", 88,
      `WiFi network "${ssid}" (Arlo base-station SSID)`, `${ACAB} (field capture)`));
  }
  if (wifi.client !== true) {
    const vehicle = policeVehicleSsid(ssid);
    if (vehicle) hits.push(vehicle);
  }
  if (!isLocallyAdministered(advert.mac) && normalizeHex(advert.mac)) {
    const cam = matchTable(CAMERA_PREFIXES, advert.mac);
    if (cam) {
      hits.push(hit("NETWORK_CAMERA", `${cam.vendor} camera, hub or recorder`, 65,
        `WiFi address in ${cam.vendor}'s registered block ${fmtPrefix(cam.prefix)}`, `${IEEE}; ${ACAB}`));
    }
    const alpr = matchTable(ALPR_MAKER_PREFIXES, advert.mac);
    if (alpr) {
      hits.push(hit("ALPR", `${alpr.vendor} traffic / plate-camera hardware`, 60,
        `WiFi address in ${alpr.vendor}'s registered block ${fmtPrefix(alpr.prefix)} - enforcement-camera maker, verify`,
        `${IEEE}; ${ACAB} (alpr_candidates)`));
    }
    const ems = matchTable(EMS_PREFIXES, advert.mac);
    if (ems) {
      hits.push(hit("PUBLIC_SAFETY", `${ems.vendor} medical device (ambulance defibrillator / monitor)`, 45,
        `WiFi address in ${ems.vendor}'s registered block ${fmtPrefix(ems.prefix)} - LIFEPAK monitors send their data over WiFi from ambulances; hospitals use them too`,
        `${IEEE}; Wardrive Go's EMS list (facts only)`));
    }
  }
  if (wifi.client !== true && ssid.toLowerCase().startsWith("expresslrs")) {
    hits.push(hit("DRONE", "ExpressLRS radio link in setup mode (FPV drone)", 50,
      `WiFi network "${ssid}": an ExpressLRS transmitter, receiver or backpack opens it for setup. The link used in flight doesn't show up`,
      "Fieldwatch catalog (OffGridPete, MIT); ExpressLRS docs"));
  }
  const drone = droneByPrefix(advert);
  if (drone) hits.push(drone);
  return hits;
}

function otherCameras(advert, name, prefix) {
  const reg = "IEEE / Bluetooth SIG registries";
  const source = advert.source === "wifi" ? "wifi" : "ble";
  if (source === "ble") {
    const sdata = serviceData(advert);
    const shorts = allShorts(advert, sdata);
    const mfg = manufacturerData(advert);
    if (mfg[CID.ARASHI]) return hit("OTHER_CAMERA", "Insta360 camera", 85, "Company ID 0x10D7 (Arashi Vision, maker of Insta360)", reg);
    if (shorts.has(UUID.ARASHI)) return hit("OTHER_CAMERA", "Insta360 camera", 85, "Service UUID 0xFC30 (Arashi Vision, maker of Insta360)", reg);
    if (name.toLowerCase().includes("insta360")) return hit("OTHER_CAMERA", "Insta360 camera", 70, `Advertised name "${name}"`, reg);
    if (mfg[CID.GOPRO]) return hit("OTHER_CAMERA", "GoPro camera", 85, "Company ID 0x02F2 (GoPro, Inc.)", reg);
    if ([...UUID.GOPRO].some((u) => shorts.has(u))) return hit("OTHER_CAMERA", "GoPro camera", 85, "GoPro service UUID 0xFEA5 / 0xFEA6", reg);
    if (name.toLowerCase().startsWith("gopro")) return hit("OTHER_CAMERA", "GoPro camera", 70, `Advertised name "${name}"`, reg);
  }
  if (source === "wifi") {
    const hidden = HIDDEN_CAMERA_SSIDS.find((c) => c.ssid.test(name));
    if (hidden) {
      return hit("OTHER_CAMERA", `Hidden / spy camera (${hidden.app} type)`, hidden.confidence,
        `WiFi network "${name}": the setup hotspot of cheap ${hidden.app} WiFi cameras, often sold hidden in clocks, chargers and smoke detectors. Some are ordinary indoor cameras - check the room.`,
        hidden.source);
    }
  }
  if (name) {
    const named = ACTION_CAMERA_NAMES.find(([re]) => re.test(name));
    if (named) {
      return hit("OTHER_CAMERA", named[1], 65,
        `${source === "wifi" ? "WiFi network" : "Advertised name"} "${name}" (the camera's default name - names can be changed)`,
        "Manufacturer defaults");
    }
  }
  if (OTHER_CAMERA_PREFIXES[prefix] && !advert.randomBle && !isLocallyAdministered(advert.mac)) {
    return hit("OTHER_CAMERA", OTHER_CAMERA_PREFIXES[prefix], 75,
      `Address in the registered block ${fmtPrefix(prefix)}`, reg);
  }
  return null;
}

function hackerSignatures(advert) {
  const hits = [];
  const name = (advert.name || "").trim();
  const prefix = normalizeHex(advert.mac).slice(0, 6);
  const cam = otherCameras(advert, name, prefix);
  if (cam) hits.push(cam);
  if (advert.source !== "wifi") {
    const shorts = allShorts(advert, serviceData(advert));
    const mfg = manufacturerData(advert);
    if (RE.skimmerName.test(name)) {
      hits.push(hit("SKIMMER", "Possible card skimmer (Bluetooth module)", 70,
        `Advertised name "${name}": the default name of the cheap serial modules built into card skimmers (gas pumps, ATMs). Hobby projects use them too - check the payment terminal.`,
        SRC_HACK));
    } else if (shorts.has(UUID.SPP)) {
      hits.push(hit("SKIMMER", "Possible card skimmer (Bluetooth module)", 50,
        "Advertises the serial-port service 0x1101 used by skimmer modules - verify", SRC_HACK));
    }
    if ([...UUID.FLIPPER].some((u) => shorts.has(u))) {
      hits.push(hit("HACKER", "Flipper Zero", 90, "Flipper's own Bluetooth service UUID (one per case colour)", SRC_HACK));
    } else if (mfg[CID.FLIPPER]) {
      hits.push(hit("HACKER", "Flipper Zero", 90, "Company ID 0x0E29 (Flipper Devices Inc.)", SRC_HACK));
    } else if (prefix === OUI_FLIPPER) {
      hits.push(hit("HACKER", "Flipper Zero", 85, "Address in Flipper Devices' registered block 0C:FA:22", SRC_HACK));
    } else if (name.startsWith("Flipper ")) {
      hits.push(hit("HACKER", "Flipper Zero", 60, `Advertised name "${name}" (owners can rename it - verify)`, SRC_HACK));
    } else if (STM32WB.has(prefix)) {
      hits.push(hit("HACKER", "Possible Flipper Zero (STM32WB chip)", 30,
        `Address ${fmtPrefix(prefix)}: an STMicroelectronics STM32WB Bluetooth chip, which a Flipper Zero uses - so do other gadgets, weak`,
        "SignalSweep research (GPL-3.0; facts only)"));
    }
  } else {
    if (name.startsWith("Pineapple_")) {
      hits.push(hit("HACKER", "WiFi Pineapple", 60, `Management network "${name}" (Hak5 WiFi Pineapple)`, SRC_HACK));
    } else if (name.toLowerCase().startsWith("pwned")) {
      hits.push(hit("HACKER", "WiFi deauther", 55, `Control network "${name}" (ESP8266 / ESP32 deauther default)`, SRC_HACK));
    }
    if (HAK5_LA.has(prefix)) {
      hits.push(hit("HACKER", "Possible Hak5 device", 30,
        `Locally administered address ${fmtPrefix(prefix)} that Hak5 gear uses - anyone can set it, weak`, SRC_HACK));
    }
  }
  return hits;
}

function entryScore(entry) {
  if (Number.isFinite(entry.score)) return entry.score;
  if (entry.confidence === "custom") return 100;
  if (entry.confidence === "candidate") return 50;
  return 75;
}

function entryCategory(entry) {
  const name = String(entry.category || "").toUpperCase();
  if (CATEGORIES[name]) return name;
  return entry.confidence === "custom" ? "CUSTOM" : "PUBLIC_SAFETY";
}

function entryHit(entry, evidence) {
  return hit(entryCategory(entry), entry.label || "Watchlist entry", entryScore(entry), evidence,
    entry.confidence === "custom" ? "Your watchlist" : (entry.source || "Watchlist preset"));
}

export function normalizeWatchKey(prefix) {
  const k = String(prefix || "").trim();
  const lower = k.toLowerCase();
  const kinds = ["name:", "starts:", "vendor:", "probe:", "fp:", "adv:", "all:"];
  for (const kind of kinds) {
    if (lower.startsWith(kind)) return kind + k.slice(kind.length).trim();
  }
  return fmtPrefix(normalizeHex(k)) || k;
}

export function matchWatchlist(advert, entries) {
  if (!entries || !entries.length) return [];
  const hits = [];
  const name = (advert.name || "").trim();
  const hex = normalizeHex(advert.mac);
  const vendor = String(advert.vendor || advert.manufacturer || "");
  for (const entry of entries) {
    const key = normalizeWatchKey(entry.prefix);
    const lower = key.toLowerCase();
    if (lower.startsWith("name:")) {
      const text = key.slice(5).trim();
      if (text && name.toLowerCase().includes(text.toLowerCase())) {
        hits.push(entryHit(entry, `Advertised name "${name}" contains "${text}"`));
      }
    } else if (lower.startsWith("starts:")) {
      const text = key.slice(7).trim();
      if (text && name.toLowerCase().startsWith(text.toLowerCase())) {
        hits.push(entryHit(entry, `Advertised name / SSID "${name}" starts with "${text}"`));
      }
    } else if (lower.startsWith("vendor:")) {
      const text = key.slice(7).trim();
      if (text && vendor.toLowerCase().includes(text.toLowerCase())) {
        hits.push(entryHit(entry, `Manufacturer "${vendor}" contains "${text}"`));
      }
    } else if (lower.startsWith("probe:") || lower.startsWith("fp:") || lower.startsWith("adv:") || lower.startsWith("all:")) {
      // Probe / advert-fingerprint / combo rules need USB WiFi or ESP32 captures.
      continue;
    } else if (hex) {
      const prefix = normalizeHex(key);
      if (prefix && hex.startsWith(prefix)) {
        hits.push(entryHit(entry, `Address in watchlist prefix ${fmtPrefix(prefix)}`));
      }
    }
  }
  return hits;
}

/**
 * Classify one observation. Never invents hits: empty input yields [].
 * @param {object} advert
 * @param {{ entries?: object[] }} [options]
 */
export function classify(advert, options = {}) {
  if (!advert) return [];
  const source = advert.source === "wifi" ? "wifi" : "ble";
  const prepared = { ...advert, source };
  const hits = source === "wifi" ? classifyWifi(prepared) : classifyBle(prepared);
  hits.push(...hackerSignatures(prepared));
  hits.push(...matchWatchlist(prepared, options.entries || []));
  const seen = new Set();
  const unique = [];
  for (const row of hits.sort((a, b) => b.confidence - a.confidence)) {
    const key = `${row.category}|${row.label}|${row.confidence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

export const PRESET_NAMES = ["global", "canada", "us", "france", "uk", "portugal", "germany", "spain", "italy", "netherlands", "sweden"];
export const DEFAULT_PRESETS = ["global"];

export async function loadPresetEntries(names, baseUrl = "/sentinel/rf/presets/") {
  const wanted = names && names.length ? names : DEFAULT_PRESETS;
  const byKey = new Map();
  for (const name of PRESET_NAMES.filter((n) => wanted.includes(n))) {
    const url = `${baseUrl}${name}.json`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) continue;
    const list = await res.json();
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      if (!entry || !entry.prefix) continue;
      byKey.set(normalizeWatchKey(entry.prefix), entry);
    }
  }
  return [...byKey.values()];
}
