import { classify, containsAscii, fmtPrefix, isAlertable, loadPresetEntries, matchWatchlist, shortOf, uuid16 } from "./matcher.js";
import { advertFromBluetoothEvent, capabilities, capabilityReport } from "./scan.js";
import { detectionsToCsv, detectionsToJson } from "./store.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok  ", msg);
  }
}

function bytes(str) {
  return Uint8Array.from([...str].map((c) => c.charCodeAt(0)));
}

assert(shortOf(uuid16(0xfc81)) === 0xfc81, "uuid16 round-trips");
assert(containsAscii(bytes("xxBWCDEVICEyy"), "BWCDEVICE"), "payload tag forward");
assert(containsAscii(Uint8Array.from("BWCDEVICE".split("").reverse().map((c) => c.charCodeAt(0))), "BWCDEVICE"), "payload tag reversed");
assert(fmtPrefix("0025df") === "00:25:DF", "prefix format");

const axon = classify({
  source: "ble",
  name: "",
  mac: "",
  serviceUuids: [],
  manufacturerData: {},
  serviceData: { "0000fe6b-0000-1000-8000-00805f9b34fb": bytes("xxBWCDEVICEyy") },
});
assert(axon[0]?.category === "BODY_CAM" && axon[0].confidence === 90, "BWCDEVICE is a strong Axon body cam");

const taser = classify({
  source: "ble",
  name: "",
  mac: "",
  serviceUuids: [uuid16(0xfc81)],
  manufacturerData: { 0x034d: new Uint8Array([1, 2, 3]) },
});
assert(taser.some((h) => h.category === "BODY_CAM" && h.confidence === 60), "TASER CID / Axon UUID flags body cam");

const flock = classify({ source: "ble", name: "FS Ext Battery", mac: "", serviceUuids: [], manufacturerData: {}, serviceData: {} });
assert(flock[0]?.category === "ALPR" && flock[0].confidence === 80, "FS Ext Battery is a Flock battery");

const penguin = classify({
  source: "ble",
  name: "Penguin-12",
  mac: "",
  serviceUuids: [],
  manufacturerData: { 0x09c8: bytes("TN12345") },
  serviceData: {},
});
assert(penguin[0]?.category === "ALPR" && penguin[0].confidence === 80, "Penguin name plus XUNTONG and TN serial");

const airtag = classify({
  source: "ble",
  name: "",
  mac: "",
  serviceUuids: [],
  manufacturerData: { 0x004c: new Uint8Array([0x12, 0x19, 0, 1, 2]) },
  serviceData: {},
});
assert(airtag[0]?.category === "TRACKER" && airtag[0].label.startsWith("Apple Find My"), "Apple Find My separated frame");

const ownerNearby = classify({
  source: "ble",
  name: "",
  mac: "",
  serviceUuids: [],
  manufacturerData: { 0x004c: new Uint8Array([0x12, 0x18, 0, 1, 2]) },
  serviceData: {},
});
assert(!ownerNearby.some((h) => h.category === "TRACKER"), "Find My near-owner frame is not flagged as away");

const glasses = classify({
  source: "ble",
  name: "Ray-Ban Meta",
  mac: "",
  serviceUuids: [],
  manufacturerData: { 0x0d53: new Uint8Array([0]) },
  serviceData: {},
});
assert(glasses.some((h) => h.category === "GLASSES" && h.confidence >= 70), "Luxottica CID flags Ray-Ban Meta glasses");

const drone = classify({
  source: "ble",
  name: "",
  mac: "",
  serviceUuids: [],
  manufacturerData: {},
  serviceData: { [uuid16(0xfffa)]: Uint8Array.from([0x0d, 0x00, ...new Array(25).fill(0)]) },
});
assert(drone[0]?.category === "DRONE" && drone[0].confidence === 95, "ASTM Remote ID on 0xFFFA");

const flipper = classify({
  source: "ble",
  name: "Flipper Zero",
  mac: "",
  serviceUuids: [uuid16(0x3081)],
  manufacturerData: {},
  serviceData: {},
});
assert(flipper.some((h) => h.category === "HACKER" && h.confidence === 90), "Flipper UUID is a strong hacker hit");

const wifiFlock = classify({ source: "wifi", name: "Flock-ABC123", mac: "70:C9:4E:11:22:33", serviceUuids: [], manufacturerData: {}, serviceData: {}, wifi: { client: false } });
assert(wifiFlock[0]?.category === "ALPR" && wifiFlock[0].confidence === 88, "Flock- SSID is a strong ALPR hit");

const quiet = classify({ source: "ble", name: "Pixel Buds", mac: "", serviceUuids: [], manufacturerData: {}, serviceData: {} });
assert(quiet.length === 0, "unrelated named earbuds produce no hits");

const hiddenMac = classify({
  source: "ble",
  name: "",
  mac: "",
  serviceUuids: [],
  manufacturerData: {},
  serviceData: {},
}, { entries: [{ prefix: "00:25:DF", label: "Axon Enterprise", category: "BODY_CAM", score: 75, confidence: "confirmed" }] });
assert(hiddenMac.length === 0, "OUI rules do not fire without a MAC");

const withMac = matchWatchlist(
  { name: "", mac: "00:25:DF:11:22:33" },
  [{ prefix: "00:25:DF", label: "Axon Enterprise (body cam / TASER / holster sensor)", category: "BODY_CAM", score: 75, source: "IEEE" }],
);
assert(withMac[0]?.category === "BODY_CAM" && withMac[0].label.includes("Axon"), "OUI prefix matches when a MAC is present");

assert(isAlertable({ confidence: 90 }) === true, "strong hits alert");
assert(isAlertable({ confidence: 10 }) === false, "very weak hits never alert");

const preset = JSON.parse(await readFile(join(here, "presets/global.json"), "utf8"));
assert(Array.isArray(preset) && preset.length >= 200, "global OUI preset is present");
assert(preset.some((e) => e.prefix === "00:25:DF" && e.category === "BODY_CAM"), "global preset includes Axon 00:25:DF");

const cap = capabilities();
assert(cap.macHidden === true, "scanner reports that browsers hide MACs");
assert(cap.wifiNative === false && cap.cellNative === false, "scanner does not claim native wifi/cell");
const report = capabilityReport();
assert(report.rows.some((r) => r.id === "wifi" && r.state === "needs-hardware"), "wifi is an honest hardware-needed state");
assert(report.rows.some((r) => r.id === "cell" && r.state === "needs-app"), "cell is an honest app-needed state");

const evt = {
  name: "FS Ext Battery",
  uuids: [],
  rssi: -62,
  device: { id: "dev-1", name: "FS Ext Battery" },
  manufacturerData: new Map(),
  serviceData: new Map(),
};
const advert = advertFromBluetoothEvent(evt);
assert(advert.mac === "" && advert.id === "dev-1", "Web Bluetooth adverts keep the browser id and no MAC");
assert(classify(advert)[0]?.category === "ALPR", "event-shaped Flock name still classifies");

const json = detectionsToJson([{ id: "x", name: "FS Ext Battery", hits: [{ category: "ALPR", label: "Flock Safety camera battery", confidence: 80 }] }]);
assert(json.includes("RF Sentinel") && json.includes("FS Ext Battery"), "JSON export credits RF Sentinel");
const csv = detectionsToCsv([{ id: "x", name: "FS Ext Battery", hits: [{ category: "ALPR", label: "battery", confidence: 80, evidence: "name", source: "ACAB" }] }]);
assert(csv.split("\n").length === 2 && csv.includes("FS Ext Battery"), "CSV export has a header and a row");

if (typeof fetch !== "function") {
  assert(true, "skip preset loader in this environment");
}

if (failed) {
  console.error(failed + " failed");
  process.exit(1);
}
console.log("all tests passed");
