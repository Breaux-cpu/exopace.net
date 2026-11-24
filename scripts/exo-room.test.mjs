import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const ctx = { crypto: globalThis.crypto, TextEncoder: TextEncoder, TextDecoder: TextDecoder, btoa: btoa, atob: atob };
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInNewContext(readFileSync(new URL("../assets/exo-room.js", import.meta.url), "utf8"), ctx);

test("aes-gcm round trip keeps the coordinate", async function () {
  const packet = await ctx.EXO.room.encrypt("field-key", { lat: 35.34, lon: -89.9, kind: "way" });
  assert.equal(typeof packet.cipher, "string");
  assert.equal(JSON.stringify(packet).includes("35.34"), false);
  const plain = await ctx.EXO.room.decrypt("field-key", packet);
  assert.equal(plain.lat, 35.34);
});

test("the wrong passphrase fails closed", async function () {
  const packet = await ctx.EXO.room.encrypt("field-key", { lat: 1, lon: 2 });
  await assert.rejects(function () { return ctx.EXO.room.decrypt("other-key", packet); });
});
