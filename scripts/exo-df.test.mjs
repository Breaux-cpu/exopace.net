import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const ctx = {};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInNewContext(readFileSync(new URL("../assets/exo-df.js", import.meta.url), "utf8"), ctx);
vm.runInNewContext(readFileSync(new URL("../assets/exo-rf-db.js", import.meta.url), "utf8"), ctx);

test("magnetic declination east of north rotates a bearing", function () {
  assert.equal(ctx.EXO.df.trueBearing(10, 5), 15);
  assert.equal(ctx.EXO.df.trueBearing(355, 10), 5);
});

test("two true bearings cross once", function () {
  const hit = ctx.EXO.df.lob([
    { lat: 35.0, lon: -90.0, bearingTrue: 90 },
    { lat: 35.2, lon: -89.7, bearingTrue: 180 },
  ]);
  assert.ok(hit);
  assert.ok(Math.abs(hit.lat - 35.0) < 0.3);
  assert.ok(Math.abs(hit.lon - -89.7) < 0.4);
});

test("one station is not a fix", function () {
  assert.equal(ctx.EXO.df.lob([{ lat: 35, lon: -90, bearingTrue: 10 }]), null);
  assert.equal(ctx.EXO.df.rssi([{ lat: 35, lon: -90, rssi: -40 }]), null);
});

test("allocation lookup names NOAA weather and a LoRa channel", function () {
  const wx = ctx.EXO.rfdb.lookup(162550000);
  assert.equal(wx.band.name, "NOAA weather");
  const lora = ctx.EXO.rfdb.lookup(902300000);
  assert.equal(lora.lora.channel, 0);
});
