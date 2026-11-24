import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function load(name) {
  const ctx = { crypto: globalThis.crypto, Uint8Array, ArrayBuffer, DataView, TextEncoder };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL("../assets/" + name, import.meta.url), "utf8"), ctx);
  return ctx.EXO;
}

const apt = load("exo-apt-decoder.js").apt;
const radio = load("exo-adsb-ais.js").adsb;
const mesh = load("exo-mesh-router.js").meshRouter;
const prop = load("exo-prop.js").prop;
const sit = load("exo-sitrep.js").sitrep;
const pip = load("exo-pip.js").pip;
const qr = load("exo-qr-beam.js").qr;
const mav = load("exo-mavlink.js").mavlink;
const pace = load("exo-throttle.js").throttle;

test("apt stays dark without samples and refuses a pass with no speed", () => {
  assert.equal(apt.decode([], 48000).status, "NO SAMPLES");
  assert.equal(apt.decode(null, 48000).status, "NO SAMPLES");
  assert.equal(apt.geoOverlay({ lat: 35, lon: -90, headingDeg: 10 }, 4), null);
  assert.equal(apt.linkStatus(false, 0), "NO USB DEVICE");
  assert.equal(apt.thermalLut(Number.NaN), null);
  const color = apt.thermalLut(0);
  assert.equal(color.length, 3);
});

test("apt syncs one constructed line and does not call the counts a temperature", () => {
  const line = new Array(2080).fill(0.1);
  for (let i = 0; i < 39; i++) line[i] = (i % 4) < 2 ? 1 : 0;
  for (let i = 86; i < 86 + 20; i++) line[i] = 0.8;
  const frame = apt.decode(line, 4160);
  assert.equal(frame.status, "SYNC");
  assert.equal(frame.calibrated, false);
  assert.equal(frame.pixels.length, 1);
  const overlay = apt.geoOverlay({ lat: 35, lon: -90, headingDeg: 0, groundSpeedMps: 2000 }, frame.lines);
  assert.equal(overlay.points.length, 1);
  assert.ok(Math.abs(overlay.points[0].lat - 35) < 1e-9);
});

test("mode s and ais reject empty input and accept a frame with a real crc", () => {
  assert.equal(radio.modeS([0, 1, 2]), null);
  assert.equal(radio.preamble([0, 0, 0, 0]), null);
  assert.equal(radio.gmskBits([], 48000, 9600), null);
  const data = [0x8d, 0xab, 0xcd, 0xef, 0, 0, 0, 0, 0, 0, 0];
  const frame = radio.appendCrc(data);
  const hit = radio.modeS(frame);
  assert.equal(hit.df, 17);
  assert.equal(hit.icao, "ABCDEF");
  const even = radio.cprEncode(35.15, -90.05, false);
  const odd = radio.cprEncode(35.15, -90.05, true);
  const back = radio.cprDecode(even.lat, even.lon, odd.lat, odd.lon);
  assert.ok(Math.abs(back.lat - 35.15) < 0.02);
  assert.ok(Math.abs(back.lon - -90.05) < 0.02);
  const bits = radio.aisFrame(366123456, 35.15, -90.05);
  const vessel = radio.aisPosition(bits);
  assert.equal(vessel.mmsi, "366123456");
  assert.ok(Math.abs(vessel.lat - 35.15) < 0.01);
  assert.equal(radio.aisPosition(bits.slice(0, 20)), null);
  const marks = [1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0];
  assert.equal(radio.preamble(marks).at, 0);
});

test("mesh drops a repeat and a spent ttl and draws no link without rssi", () => {
  const seen = new Map();
  const first = mesh.forward({ id: "a", from: "n1", to: "n2", ttl: 2, rssi: -70, snr: 8 }, seen, 10);
  assert.equal(first.ttl, 1);
  assert.equal(mesh.forward({ id: "a", from: "n1", to: "n2", ttl: 2, rssi: -70 }, seen, 11), null);
  assert.equal(mesh.forward({ id: "b", from: "n1", to: "n2", ttl: 0, rssi: -70 }, seen, 12), null);
  assert.equal(mesh.matrix([{ from: "n1", to: "n2" }]).length, 0);
  assert.equal(mesh.status([]), "STANDBY");
  assert.equal(mesh.layout(mesh.matrix([{ from: "n1", to: "n2", rssi: -40 }])).length, 2);
});

test("propagation refuses a missing foF2 and treats kp 0 as quiet", () => {
  assert.equal(prop.mufMHz(null, 20), null);
  assert.equal(prop.storm(0), "QUIET");
  assert.equal(prop.storm(6), "GEOMAGNETIC STORM");
  assert.equal(prop.storm(null), null);
  assert.equal(prop.scintillation(null), null);
  assert.equal(prop.summary({ ok: false }), "OFFLINE");
  assert.match(prop.summary({ ok: true, kp: 0, fof2: null, s4: null }), /MUF NOT MEASURED/);
  const muf = prop.mufMHz(6, 30);
  assert.ok(muf > 6);
});

test("sitrep and voice seal stay empty until there is a real note", async () => {
  assert.equal(sit.sitrep([]), "NO OBSERVATIONS");
  assert.equal(sit.entry({ mgrs: "NO FIX", text: "seen" }), null);
  const row = sit.entry({ mgrs: "16S BE 36711 14801", text: "bridge", at: 10 });
  assert.match(sit.sitrep([row]), /16S BE 36711 14801/);
  const key = new Uint8Array(32).fill(7);
  assert.equal(await sit.seal(new Uint8Array(), key), null);
  const sealed = await sit.seal(new Uint8Array([1, 2, 3, 4]), key);
  const opened = await sit.open(sealed, key);
  assert.deepEqual(Array.from(opened), [1, 2, 3, 4]);
  assert.equal(await sit.open(sealed, new Uint8Array(32).fill(1)), null);
});

test("picture in picture does not pretend a window exists", async () => {
  assert.equal(pip.supported({}), false);
  const denied = await pip.open({}, "waterfall");
  assert.equal(denied.status, "PIP UNSUPPORTED");
});

test("qr fountain round-trips bytes and drops an empty payload", () => {
  assert.equal(qr.encode(new Uint8Array()).length, 0);
  const frames = qr.encode(new TextEncoder().encode("waypoint 16S"), 2);
  const back = qr.decode(frames);
  assert.equal(new TextDecoder().decode(back), "waypoint 16S");
  assert.equal(qr.decode([]), null);
  assert.equal(qr.decode(["not a frame"]), null);
});

test("mavlink ignores a bad crc and a gps fix with no lock", () => {
  assert.equal(mav.parse([0]), null);
  const payload = new Array(30).fill(0);
  payload[8] = 0;
  const packed = mav.pack(24, payload);
  const heard = mav.parse(packed);
  assert.equal(heard.fix, 0);
  assert.equal(heard.lat, undefined);
  packed[12] ^= 0xff;
  assert.equal(mav.parse(packed), null);
  assert.equal(mav.footprint({ lat: 1, lon: 2, altM: 100, yaw: 0 }, null), null);
  assert.equal(mav.linkStatus.call({}), "NO USB DEVICE");
});

test("throttle does not invent a low battery", () => {
  assert.equal(pace.fpsFor(null).state, "NO BATTERY API");
  assert.equal(pace.fpsFor({ charging: false, level: 0 }).fps, 8);
  assert.equal(pace.fpsFor({ charging: true, level: 0.1 }).state, "CHARGING");
  assert.equal(pace.fpsFor({ charging: false, level: 0.8 }).fps, 30);
});
