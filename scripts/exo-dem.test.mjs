import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../assets/exo-dem.js", import.meta.url), "utf8");
const ctx = { navigator: { onLine: false }, document: {}, caches: undefined, fetch: undefined, createImageBitmap: undefined };
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInNewContext(src, ctx);

test("terrarium decode matches the Mapzen formula", function () {
  assert.equal(ctx.EXO.dem.decodeTerrarium(128, 0, 0), 128 * 256 - 32768);
  assert.equal(ctx.EXO.dem.decodeTerrarium(128, 10, 128), 128 * 256 + 10 + 128 / 256 - 32768);
});

test("web mercator tile for Millington stays in range", function () {
  const tile = ctx.EXO.dem.xyz(35.3418, -89.897, 12);
  assert.equal(tile.z, 12);
  assert.ok(tile.x >= 0 && tile.x < 4096);
  assert.ok(tile.y >= 0 && tile.y < 4096);
});

test("offline sample without a cache is null", async function () {
  const elev = await ctx.EXO.dem.sample(35.3418, -89.897);
  assert.equal(elev, null);
});
