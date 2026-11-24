import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function load(name) {
  const ctx = { crypto: globalThis.crypto, Uint8Array, ArrayBuffer, DataView };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL("../assets/" + name, import.meta.url), "utf8"), ctx);
  return ctx.EXO;
}

test("faults produce an honest empty result", () => {
  const apt = load("exo-apt-decoder.js").apt;
  const radio = load("exo-adsb-ais.js").adsb;
  const mesh = load("exo-mesh-router.js").meshRouter;
  const prop = load("exo-prop.js").prop;
  const sit = load("exo-sitrep.js").sitrep;
  const qr = load("exo-qr-beam.js").qr;
  const mav = load("exo-mavlink.js").mavlink;
  assert.equal(apt.decode([Number.NaN], 48000).status, "NO SAMPLES");
  assert.equal(radio.modeS([0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), null);
  assert.equal(radio.tracksFrom([], null).air.length, 0);
  assert.equal(mesh.forward({ id: "", from: "n", ttl: 3 }, new Map(), 1), null);
  assert.equal(prop.summary(undefined), "OFFLINE");
  assert.equal(sit.entry({ mgrs: "", text: "" }), null);
  assert.equal(qr.encode(null).length, 0);
  assert.equal(mav.parse(new Uint8Array([0xfd, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0])), null);
});
