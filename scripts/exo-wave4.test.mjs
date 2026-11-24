import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTides, parseUsgs, onRequest } from "../functions/api/hydro.js";
import { buildManifest, verifyManifest } from "./generate-sbom.mjs";

const root = new URL("..", import.meta.url);

function load(name) {
  const ctx = {
    crypto: globalThis.crypto,
    Uint8Array,
    Uint32Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    TextDecoder,
    URL,
    Math,
    JSON,
    Date,
    Promise,
    Object,
    Array,
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL("../assets/" + name, import.meta.url), "utf8"), ctx);
  return ctx.EXO;
}

function tone(bin, n = 128) {
  const iq = [];
  for (let i = 0; i < n; i++) {
    const angle = 2 * Math.PI * bin * i / n;
    iq.push(Math.cos(angle), Math.sin(angle));
  }
  return iq;
}

function am() {
  const iq = [];
  for (let i = 0; i < 128; i++) {
    const env = 1 + 0.7 * Math.cos(2 * Math.PI * 2 * i / 128);
    const angle = 2 * Math.PI * 8 * i / 128;
    iq.push(env * Math.cos(angle), env * Math.sin(angle));
  }
  return iq;
}

function fm(dev) {
  const iq = [];
  let phase = 0;
  for (let i = 0; i < 128; i++) {
    phase += 2 * Math.PI * (8 + dev * Math.sin(2 * Math.PI * 2 * i / 128)) / 128;
    iq.push(Math.cos(phase), Math.sin(phase));
  }
  return iq;
}

function fsk() {
  const iq = [];
  let phase = 0;
  for (let i = 0; i < 128; i++) {
    phase += 2 * Math.PI * (i < 64 ? 4 : 20) / 128;
    iq.push(Math.cos(phase), Math.sin(phase));
  }
  return iq;
}

function psk() {
  const iq = [];
  for (let i = 0; i < 128; i++) {
    const flip = Math.floor(i / 32) % 2 === 0 ? 1 : -1;
    const angle = 2 * Math.PI * 6 * i / 128;
    iq.push(flip * Math.cos(angle), flip * Math.sin(angle));
  }
  return iq;
}

function ofdm() {
  const symN = 32;
  const bins = [];
  for (let k = 0; k < symN; k++) bins.push([k % 2 === 0 ? 1 : 0, 0]);
  const symbol = [];
  for (let t = 0; t < symN; t++) {
    let re = 0;
    let im = 0;
    for (let k = 0; k < symN; k++) {
      const angle = 2 * Math.PI * k * t / symN;
      re += bins[k][0] * Math.cos(angle) - bins[k][1] * Math.sin(angle);
      im += bins[k][0] * Math.sin(angle) + bins[k][1] * Math.cos(angle);
    }
    symbol.push([re, im]);
  }
  const frame = symbol.slice(symN - 8).concat(symbol);
  const iq = [];
  while (iq.length < 256) {
    for (const sample of frame) iq.push(sample[0], sample[1]);
  }
  return iq.slice(0, 256);
}

function noise() {
  const iq = [];
  let seed = 12345;
  for (let i = 0; i < 256; i++) {
    seed = (1103515245 * seed + 12345) % 2147483647;
    iq.push((seed / 2147483647) * 2 - 1);
  }
  return iq;
}

function kmz(kml) {
  const name = new TextEncoder().encode("doc.kml");
  const data = new TextEncoder().encode(kml);
  const bytes = new Uint8Array(30 + name.length + data.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(8, 0, true);
  view.setUint32(18, data.length, true);
  view.setUint32(22, data.length, true);
  view.setUint16(26, name.length, true);
  bytes.set(name, 30);
  bytes.set(data, 30 + name.length);
  return bytes;
}

test("swarm assigns sectors and warns only on real 3D separation", () => {
  const swarm = load("exo-swarm.js").swarm;
  assert.equal(swarm.orchestrate([], []).status, "NO VEHICLES");
  assert.equal(swarm.orchestrate(null, null).traffic.length, 0);
  const picture = swarm.orchestrate([
    { sysid: 1, lat: 35.01, lon: -89.9, altM: 100 },
    { sysid: 2, lat: 35, lon: -90, altM: 100 },
    { sysid: 1, lat: 35.02, lon: -89.89, altM: 110 },
  ], []);
  assert.equal(picture.vehicles.length, 2);
  assert.equal(picture.sectors.find((row) => row.sysid === 1).sector, "NE");
  assert.equal(picture.sectors.find((row) => row.sysid === 2).sector, "SW");
  const close = swarm.orchestrate([
    { sysid: 1, lat: 35, lon: -90, altM: 10 },
    { sysid: 2, lat: 35, lon: -90.0001, altM: 10 },
  ], [], { separationM: 50 });
  assert.equal(close.conflicts.length, 1);
  const flat = swarm.orchestrate([
    { sysid: 1, lat: 35, lon: -90, altM: 10 },
    { sysid: 2, lat: 35, lon: -90, altM: null },
  ], []);
  assert.equal(flat.conflicts.length, 0);
  const clear = swarm.orchestrate([{ sysid: 1, lat: 35, lon: -90, altM: 100 }], []);
  assert.equal(clear.traffic.length, 0);
  const traffic = swarm.orchestrate(
    [{ sysid: 1, lat: 35, lon: -90, altM: 100 }],
    [{ icao: "abc", lat: 35.0001, lon: -90 }, { icao: "bad" }],
    { avoidM: 500 },
  );
  assert.equal(traffic.traffic.length, 1);
  assert.equal(traffic.traffic[0].icao, "abc");
});

test("viewshed shadows a point behind a nearer ridge", () => {
  const viewshed = load("exo-viewshed.js").viewshed;
  assert.equal(viewshed.cover(null, []).status, "NO OBSERVER");
  assert.equal(viewshed.cover({ lat: 35, lon: -90, elevM: 1 }, []).status, "NO DEM");
  assert.equal(viewshed.cover({ lat: 35, lon: -90, elevM: 1 }, [{ bearingDeg: 0, points: [{ distanceM: 10, elevM: null }] }]).status, "FLAT");
  const covered = viewshed.cover({ lat: 35, lon: -90, elevM: 0, aglM: 2 }, [{
    bearingDeg: 0,
    points: [
      { distanceM: 100, elevM: 10 },
      { distanceM: 200, elevM: 50 },
      { distanceM: 300, elevM: 12 },
    ],
  }]);
  assert.equal(covered.status, "COVERAGE");
  const optical = covered.polygons.filter((row) => row.band === "optical");
  assert.equal(optical.find((row) => row.distanceM === 200).kind, "visible");
  assert.equal(optical.find((row) => row.distanceM === 300).kind, "shadow");
  assert.equal(covered.polygons.some((row) => row.band === "vhf"), true);
});

test("link qos sends a snapshot once and drains SOS first", () => {
  const qos = load("exo-link-qos.js").linkQos;
  const first = qos.delta(null, { lat: 35.5, lon: -90 });
  assert.equal(first.status, "SNAPSHOT");
  assert.equal(qos.delta(first.fields, { lat: 35.5, lon: -90 }).status, "QUIET");
  const moved = qos.delta(first.fields, { lat: 35.5, lon: -89 });
  assert.equal(moved.status, "DELTA");
  assert.equal(moved.fields.lon, -89);
  assert.equal(Object.prototype.hasOwnProperty.call(moved.fields, "lat"), false);
  const packed = qos.unpack(qos.pack({ lat: 35.5 }, "SOS"));
  assert.equal(packed.priority, "SOS");
  assert.ok(Math.abs(packed.fields.lat - 35.5) < 1e-5);
  const queued = qos.enqueue(qos.enqueue([], { priority: "BULK", id: 1 }), { priority: "SOS", id: 2 });
  assert.equal(qos.drain(queued).id, 2);
  assert.equal(qos.drain([]), null);
});

test("hydro parsers keep only finite USGS and NOAA values", async () => {
  const gauges = parseUsgs({
    value: {
      timeSeries: [
        {
          sourceInfo: { siteCode: [{ value: "07031650" }], geoLocation: { geogLocation: { latitude: 35.1, longitude: -90.2 } } },
          variable: { variableCode: [{ value: "00065" }] },
          values: [{ value: [{ value: "12.4" }] }],
        },
        {
          sourceInfo: { siteCode: [{ value: "07031650" }], geoLocation: { geogLocation: { latitude: 35.1, longitude: -90.2 } } },
          variable: { variableCode: [{ value: "00060" }] },
          values: [{ value: [{ value: "Ice" }] }],
        },
      ],
    },
  });
  assert.equal(gauges.length, 1);
  assert.equal(gauges[0].stageFt, 12.4);
  assert.equal(gauges[0].flowCfs, null);
  assert.equal(parseUsgs({ value: {} }).length, 0);
  const tides = parseTides({ metadata: { id: "8651370", lat: "36", lon: "-75" }, data: [{ t: "2026-11-24 00:00", v: "1.2" }, { v: "" }] });
  assert.equal(tides.length, 1);
  assert.equal(tides[0].levelM, 1.2);
  assert.equal(parseTides({ error: { message: "none" } }).length, 0);
  const res = await onRequest({ request: new Request("https://exopace.net/api/hydro") });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, "NO SITE");
  assert.equal(body.gauges.length, 0);
});

test("modulation labels require a clear match", () => {
  const amc = load("exo-amc.js").amc;
  assert.equal(amc.classify([]).status, "NO SAMPLES");
  assert.equal(amc.classify([0, 0, 0, 0]).status, "BASELINE_CALIBRATING");
  assert.equal(amc.classify(new Array(128).fill(0)).status, "BASELINE_CALIBRATING");
  assert.equal(amc.classify(tone(8)).status, "CW");
  assert.equal(amc.classify(am()).status, "AM");
  assert.equal(amc.classify(fm(1)).status, "NFM");
  assert.equal(amc.classify(fm(18)).status, "WFM");
  assert.equal(amc.classify(fsk()).status, "FSK");
  assert.equal(amc.classify(psk()).status, "PSK");
  assert.equal(amc.classify(ofdm()).status, "OFDM");
  assert.equal(amc.classify(noise()).status, "UNKNOWN");
  assert.equal(amc.spawn([]), null);
  assert.equal(amc.spawn(tone(8)), null);
  assert.equal(amc.workerSource().includes("spectral kurtosis"), true);
  assert.equal(amc.linkStatus(false, 1), "NO USB DEVICE");
});

test("replay stays locked until a sandbox clock steps an imported archive", () => {
  const exo = load("exo-replay-sandbox.js");
  const replay = exo.replay;
  const live = { events: [{ t: 1000, kind: "MARK", lat: 35, lon: -90 }], feeds: "live" };
  assert.equal(replay.load(live, { sandbox: false }).status, "LOCKED");
  assert.equal(live.feeds, "live");
  assert.equal(live.events.length, 1);
  assert.equal(exo.bus, undefined);
  const ready = replay.load(live, { sandbox: true });
  live.events.push({ t: 5, kind: "MARK" });
  assert.equal(ready.events.length, 1);
  assert.equal(replay.step(ready).status, "NO CLOCK");
  assert.equal(replay.step(ready, 500).events.length, 0);
  assert.equal(replay.step(ready, 1000).events.length, 1);
  assert.equal(replay.load("{", { sandbox: true }).status, "NO ARCHIVE");
  const packed = kmz("<kml><coordinates>-90.0,35.0,10 -89.9,35.1,10</coordinates></kml>");
  const track = replay.load(packed, { sandbox: true });
  assert.equal(track.status, "READY");
  assert.equal(track.events.length, 2);
  assert.equal(replay.step(track, 0).events.length, 1);
});

test("voice packets round-trip short bursts without opening a microphone", () => {
  const voice = load("exo-voice-codec2.js").voice;
  assert.equal(voice.encode([]).status, "NO AUDIO");
  assert.equal(voice.encode(new Array(20).fill(0)).status, "BASELINE_CALIBRATING");
  const ramp = [];
  for (let i = 0; i < 80; i++) ramp.push(i * 10);
  const packet = voice.encode(ramp);
  assert.equal(packet.status, "PACKET");
  const back = voice.decode(packet.frames[0]);
  assert.equal(back.length, ramp.length);
  assert.ok(back.every((sample, index) => sample === ramp[index]));
  const source = voice.workletSource();
  assert.equal(source.includes("AudioWorkletProcessor"), true);
  assert.equal(source.includes("getUserMedia"), false);
});

test("plume cone follows supplied wind and does not invent terrain", () => {
  const plume = load("exo-plume.js").plume;
  assert.equal(plume.disperse(null, { speed: 5, fromDeg: 270 }, null).status, "NO OBSERVATIONS");
  assert.equal(plume.disperse({ lat: 35, lon: -90, speed: 10, heading: 90 }, null, null).status, "NO WIND");
  assert.equal(plume.windFrom(null), null);
  assert.equal(plume.windFrom({ current: {} }), null);
  const wind = plume.windFrom({ current: { wind_speed_10m: 5, wind_direction_10m: 270 } });
  const cone = plume.disperse({ lat: 35, lon: -90, speed: 10, heading: 90 }, wind, null);
  assert.equal(cone.status, "CONE");
  assert.equal(cone.terrain, "FLAT");
  assert.equal(cone.downwindDeg, 90);
  assert.equal(cone.etaSec, 600);
  assert.equal(cone.cone.length, 3);
  assert.equal(cone.stormEtaSec, 100);
  const shaped = plume.disperse({ lat: 35, lon: -90, speed: 10, heading: 90 }, wind, { elevM: 42 });
  assert.equal(shaped.terrain, "DEM");
  assert.equal(shaped.elevM, 42);
});

test("sbom hashes owned assets and the watchdog only restarts terrawatch", () => {
  const dir = mkdtempSync(join(tmpdir(), "exo-sbom-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  mkdirSync(join(dir, "functions", "api"), { recursive: true });
  mkdirSync(join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "deploy"), { recursive: true });
  writeFileSync(join(dir, "assets", "exo-a.js"), "var a = 1;\n");
  writeFileSync(join(dir, "assets", "env.js"), "secret\n");
  writeFileSync(join(dir, "assets", "index-B5yAHF7-.js"), "bundle\n");
  writeFileSync(join(dir, "deploy", "vq-watchdog.sh"), "echo\n");
  const manifest = buildManifest(dir);
  assert.equal(manifest.files.some((row) => row.path === "assets/exo-a.js"), true);
  assert.equal(manifest.files.some((row) => row.path.endsWith("env.js")), false);
  assert.equal(manifest.files.some((row) => row.path.includes("index-B5yAHF7-")), false);
  assert.equal(verifyManifest(dir, manifest).status, "VERIFIED");
  manifest.files[0].sha256 = "00";
  assert.equal(verifyManifest(dir, manifest).status, "MISMATCH");
  assert.equal(verifyManifest(dir, { files: [{ path: "deploy/missing.sh", sha256: "ab" }] }).status, "ABSENT");
  const watchdog = readFileSync(new URL("./deploy/vq-watchdog.sh", root), "utf8");
  assert.equal(watchdog.includes("docker restart terrawatch"), true);
  assert.equal(watchdog.includes("cams-tunnel"), false);
  assert.equal(watchdog.includes("terrawatch-mongo"), false);
  assert.equal(watchdog.includes("docker rm"), false);
  const css = readFileSync(new URL("./assets/exo-modern.css", root), "utf8");
  assert.equal(css.includes("#04070d"), true);
  assert.equal(css.includes("#7ee0ff"), true);
  assert.equal(css.includes("#ffb84d"), true);
  assert.equal(/\.exo-wave-btn \{[^}]*border-radius:\s*10px/.test(css), true);
  const radio = readFileSync(new URL("./radio/index.html", root), "utf8");
  assert.equal(radio.includes('src="../assets/exo-amc.js"'), true);
  assert.equal(radio.includes('src="/assets/'), false);
  const maps = readFileSync(new URL("./maps/index.html", root), "utf8");
  assert.equal(maps.includes('id="exo-swarm">NO VEHICLES'), true);
  assert.equal(maps.includes('id="exo-viewshed">NO DEM'), true);
  assert.equal(maps.includes('id="exo-plume">NO OBSERVATIONS'), true);
  const sentinel = readFileSync(new URL("./sentinel/index.html", root), "utf8");
  assert.equal(sentinel.includes('id="exo-hydro">OFFLINE'), true);
  assert.equal(sentinel.includes('id="exo-replay">SANDBOX IDLE'), true);
  assert.equal(sentinel.includes('id="exo-pass">NO PASS'), true);
});
