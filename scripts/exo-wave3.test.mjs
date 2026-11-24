import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

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

function toneIq() {
  const iq = [];
  for (let p = 0; p < 8; p++) {
    const re = Math.cos((2 * Math.PI * p) / 8);
    const im = Math.sin((2 * Math.PI * p) / 8);
    for (let t = 0; t < 8; t++) iq.push(re, im);
  }
  return iq;
}

function mix(freqs, n = 1024, rate = 8000) {
  const out = new Array(n).fill(0);
  for (const freq of freqs) {
    for (let i = 0; i < n; i++) out[i] += Math.sin((2 * Math.PI * freq * i) / rate);
  }
  return out;
}

test("passive radar stays dark without IQ and reports a real doppler bin", () => {
  const radar = load("exo-passive-radar.js").passiveRadar;
  assert.equal(radar.analyze([]).status, "NO SAMPLES");
  assert.equal(radar.analyze(null).cells.length, 0);
  assert.equal(radar.analyze([0, 0, 0, 0]).status, "BASELINE_CALIBRATING");
  assert.equal(radar.analyze(new Array(64).fill(1)).status, "BASELINE_CALIBRATING");
  assert.equal(radar.linkStatus(false, 1, 8), "NO USB DEVICE");
  assert.equal(radar.linkStatus(true, 0, 8), "NO USB DEVICE");
  assert.equal(radar.linkStatus(true, 1, 0), "BASELINE_CALIBRATING");
  assert.equal(radar.spawn(toneIq(), ""), null);
  const hit = radar.analyze(toneIq());
  assert.equal(hit.status, "RETURN");
  assert.ok(hit.cells.length > 0);
  assert.ok(hit.cells.every((cell) => cell.doppler === 1));
});

test("mission planner clamps to DEM and exports a real mission item", () => {
  const plan = load("exo-mission-planner.js").missionPlanner;
  assert.equal(plan.plan(null).status, "NO POLYGON");
  assert.equal(plan.kmz([]), null);
  const box = [
    { lat: 35, lon: -90 },
    { lat: 35, lon: -89.9 },
    { lat: 35.02, lon: -89.9 },
    { lat: 35.02, lon: -90 },
  ];
  const route = plan.plan({ polygon: box, spacingM: 500 });
  assert.equal(route.status, "ROUTE");
  assert.ok(route.points.length >= 4);
  assert.ok(route.points.every((p) => p.terrain === "FLAT" && p.altM === null));
  assert.ok(route.points.every((p) => p.lat > 35 && p.lat < 35.02 && p.lon >= -90 && p.lon <= -89.9));
  const square = plan.square({ lat: 35, lon: -90 }, 100, 4);
  assert.equal(square[0].lat, 35);
  assert.ok(square[1].lon > square[0].lon);
  const clamped = plan.clamp([square[0]], [{ lat: 35, lon: -90, elev: 120 }], 50);
  assert.equal(clamped[0].terrain, "DEM");
  assert.equal(clamped[0].altM, 170);
  const flat = plan.clamp([square[0]], [{ lat: 35, lon: -90, elev: null }], 50);
  assert.equal(flat[0].terrain, "FLAT");
  const frames = plan.missionItems(clamped);
  assert.equal(frames[0][0], 0xfd);
  assert.equal(frames[0][7], 73);
  const view = new DataView(frames[0].buffer);
  assert.equal(view.getInt32(26, true) / 1e7, 35);
  assert.equal(frames[0][42], 10);
  const stored = plan.kmz(route.points);
  assert.equal(stored[0], 0x50);
  assert.equal(stored[1], 0x4b);
  assert.ok(new TextDecoder().decode(stored).includes("-90.000000,35."));
});

test("acoustic comb needs harmonics and silence stays quiet", () => {
  const acoustic = load("exo-acoustic-intel.js").acoustic;
  assert.equal(acoustic.classify([], 8000).status, "NO SAMPLES");
  assert.equal(acoustic.classify(mix([200], 100), 8000).status, "BASELINE_CALIBRATING");
  assert.equal(acoustic.classify(new Array(1024).fill(0), 8000).events.length, 0);
  assert.equal(acoustic.classify(mix([200]), 8000).status, "NO ROTOR");
  const hit = acoustic.classify(mix([200, 400, 600]), 8000, "2026-11-24T18:00:00Z");
  assert.equal(hit.status, "ROTOR");
  assert.equal(hit.events[0].hz, 200);
  assert.equal(hit.events[0].at, "2026-11-24T18:00:00Z");
  assert.equal(acoustic.classify(mix([200, 400, 600]), 8000).events[0].at, null);
});

test("custody chain verifies and a changed body mismatches", async () => {
  const book = load("exo-custody.js").custody;
  const known = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc"))))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  assert.equal(await book.sha256("abc"), known);
  assert.equal((await book.verify([])).status, "EMPTY");
  const first = await book.append([], { time: "2026-11-24T00:00:00Z", kind: "rf", body: { hz: 162550000, band: "fm" } });
  assert.equal(first.length, 1);
  const second = await book.append(first, { time: "2026-11-24T00:01:00Z", kind: "rf", body: { hz: 145800000 } });
  assert.equal(second[1].prev, second[0].hash);
  const intact = await book.verify(second);
  assert.equal(intact.status, "VERIFIED INTACT");
  assert.equal(intact.root.length, 64);
  const tampered = second.map((row) => ({ ...row, body: { ...row.body } }));
  tampered[0] = { ...tampered[0], body: { hz: 1, band: "fm" } };
  assert.equal((await book.verify(tampered)).status, "HASH MISMATCH");
  assert.equal(await book.append(second, { kind: "rf", body: { hz: 1 } }), null);
});

test("astro nav needs an observer and a summer noon faces south", () => {
  const astro = load("exo-astro-nav.js").astro;
  assert.equal(astro.sun("nope", 35, -90), null);
  assert.equal(astro.moon("2026-06-21T18:00:00Z", 91, -90), null);
  const sun = astro.sun("2026-06-21T18:00:00Z", 35.34, -90);
  assert.ok(sun.az > 150 && sun.az < 210);
  assert.ok(sun.el > 60 && sun.el < 90);
  const moon = astro.moon("2026-06-21T18:00:00Z", 35.34, -90);
  assert.ok(Number.isFinite(moon.az) && Number.isFinite(moon.el));
  assert.ok(Math.abs(moon.az - sun.az) > 1 || Math.abs(moon.el - sun.el) > 1);
  assert.equal(astro.compare(null, sun.az).status, "NO HEADING");
  assert.equal(astro.compare(sun.az, sun.az).delta, 0);
});

test("rotator frames GS-232B and refuses a drive past stow", () => {
  const rot = load("exo-rotator.js").rotator;
  const point = rot.command(180, 45);
  assert.equal(point.gs232, "W180 045\r");
  assert.equal(point.easycomm, "AZ180.0 EL45.0\n");
  assert.equal(rot.command(180, 95).status, "LIMIT");
  assert.equal(rot.command(180, 95).gs232, null);
  assert.equal(rot.track(null).status, "NO TRACK");
  assert.equal(rot.track({ az: 10, el: -1 }).status, "LIMIT");
  assert.equal(rot.linkStatus(0), "NO USB DEVICE");
});

test("brief answers only with text that is already in the vault", () => {
  const brief = load("exo-brief-ai.js").brief;
  assert.equal(brief.retrieve("iss", []).status, "NO VAULT");
  assert.equal(brief.accelerator(), "NO WEBGPU");
  const docs = [{ id: "tle", title: "stations", text: "ISS NORAD 25544 is in the local catalog." }];
  const miss = brief.retrieve("vessel", docs);
  assert.equal(miss.status, "NO MATCH");
  assert.equal(miss.hits.length, 0);
  const hit = brief.retrieve("ISS catalog", docs);
  assert.equal(hit.status, "BRIEF");
  assert.ok(docs[0].text.includes(hit.hits[0].text));
});

test("rf guard does not alarm before a baseline", () => {
  const guard = load("exo-rf-guard.js").rfGuard;
  assert.equal(guard.assess([], [-90]).alarm, null);
  assert.equal(guard.assess(new Array(16).fill(-70), null).status, "BASELINE_CALIBRATING");
  const quiet = guard.assess(new Array(16).fill(-90), new Array(16).fill(-92));
  assert.equal(quiet.status, "QUIET");
  assert.equal(quiet.alarm, null);
  const hot = guard.assess(new Array(16).fill(-70), new Array(16).fill(-95));
  assert.equal(hot.status, "ANOMALY");
  assert.equal(hot.alarm, "NOISE FLOOR");
  assert.equal(guard.linkStatus(true, 0, 20), "NO USB DEVICE");
});

test("federation relay carries ciphertext and names no peer by itself", () => {
  const sync = load("exo-nostr-sync.js").nostr;
  assert.equal(sync.pack("room", { lat: 35, passphrase: "secret" }), null);
  const packet = sync.pack("room", { cipher: "aabb", iv: "cc", salt: "dd", lat: 35, passphrase: "secret", text: "35,-90" });
  assert.equal(packet.cipher, "aabb");
  assert.equal(packet.stored, false);
  assert.equal(Object.hasOwn(packet, "lat"), false);
  assert.equal(Object.hasOwn(packet, "passphrase"), false);
  assert.equal(sync.pack("peer", { cipher: "aabb" }), null);
  assert.equal(sync.peers([]).status, "STANDBY");
  assert.equal(sync.peers([{ id: "" }, { id: "field-1" }]).peers.length, 1);
  const compose = readFileSync(new URL("../deploy/field-box/federation/docker-compose.yml", import.meta.url), "utf8");
  const relay = readFileSync(new URL("../deploy/field-box/federation/relay.py", import.meta.url), "utf8");
  assert.match(compose, /EXOPACE_ALLOW_DEMO:\s*"false"/);
  assert.equal(compose.includes("EXOPACE_BRIDGE_TOKEN"), false);
  assert.match(relay, /stored": False/);
  const radio = readFileSync(new URL("../radio/index.html", import.meta.url), "utf8");
  assert.match(radio, /src="\.\.\/assets\/exo-passive-radar\.js"/);
  assert.equal(radio.includes('src="/assets/'), false);
  assert.equal(radio.includes('href="/assets/'), false);
});
