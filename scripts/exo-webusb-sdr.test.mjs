import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const iq = require("../assets/exo-iq-dsp.js");
const serial = require("../assets/exo-webserial.js");

test("a full-scale complex tone lands on one FFT bin near 0 dBFS", function () {
  const n = 64;
  const bin = 5;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const phase = (2 * Math.PI * bin * i) / n;
    re[i] = Math.cos(phase);
    im[i] = Math.sin(phase);
  }
  iq.fftRadix2(re, im);
  const power = iq.powerDbfs(re, im);
  let peak = 0;
  for (let i = 1; i < n; i++) if (power[i] > power[peak]) peak = i;
  assert.equal(peak, bin);
  assert.ok(power[bin] > -0.05, "tone is full scale, got " + power[bin]);
  assert.ok(power[0] < -40, "DC stays down, got " + power[0]);
});

test("unsigned IQ bytes center on zero", function () {
  const pair = iq.unsignedToIq(Uint8Array.of(255, 0, 128, 128));
  assert.ok(Math.abs(pair.i[0] - 1) < 0.01);
  assert.ok(Math.abs(pair.q[0] + 1) < 0.01);
  assert.ok(Math.abs(pair.i[1]) < 0.01);
});

test("FM discriminator holds a constant phase step", function () {
  const step = 0.2;
  const n = 64;
  const i = new Float32Array(n);
  const q = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    i[k] = Math.cos(step * k);
    q[k] = Math.sin(step * k);
  }
  const out = iq.demodFm(i, q, {});
  for (let k = 2; k < n; k++) assert.ok(Math.abs(out[k] - step) < 1e-6, "sample " + k + " is " + out[k]);
});

test("Web Serial framing keeps split JSON lines and a bare object", function () {
  const state = { buf: "" };
  assert.deepEqual(serial.pushLines(state, '{"t":"tra'), []);
  assert.deepEqual(serial.pushLines(state, 'ck"}\n{"t":"sos"}\r\n'), ['{"t":"track"}', '{"t":"sos"}']);
  assert.deepEqual(serial.pushLines(state, '{"t":"way","lat":1}'), ['{"t":"way","lat":1}']);
  assert.equal(state.buf, "");
  assert.equal(serial.BAUD, 115200);
});
