import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const py = spawnSync("python", ["scripts/sdr-bridge/exo_sdr_bridge.py", "--self-test"], { encoding: "utf8" });
const report = JSON.parse(py.stdout);

test("fft frame starts with 0x01 and little-endian float32", function () {
  assert.equal(py.status, 0);
  const bytes = Buffer.from(report.fft, "hex");
  assert.equal(bytes[0], 0x01);
  assert.equal(bytes.readFloatLE(1), 0);
  assert.equal(bytes.readFloatLE(5), -12.5);
});

test("audio and status frames use their type bytes", function () {
  assert.equal(Buffer.from(report.audio, "hex")[0], 0x02);
  const status = Buffer.from(report.status, "hex");
  assert.equal(status[0], 0x03);
  assert.match(status.subarray(1).toString("utf8"), /162550000/);
});

test("missing bearer is rejected", function () {
  assert.equal(report.unauthorized, 401);
  assert.equal(report.authorized, 401);
});

test("browser parser reads the same frames and stays offline without a socket", function () {
  const src = readFileSync(new URL("../assets/exo-sdr-client.js", import.meta.url), "utf8");
  const ctx = { document: undefined, WebSocket: function () { throw new Error("no socket"); } };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  const fft = Uint8Array.from(Buffer.from(report.fft, "hex")).buffer;
  const frame = ctx.EXO.sdr.parseFrame(fft);
  assert.equal(frame.kind, "fft");
  assert.equal(frame.bins[1], -12.5);
  assert.match(ctx.EXO.sdr.status(), /BRIDGE OFFLINE/);
});
