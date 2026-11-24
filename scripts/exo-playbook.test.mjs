import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const store = new Map();
const ctx = {
  localStorage: {
    getItem: function (k) { return store.has(k) ? store.get(k) : null; },
    setItem: function (k, v) { store.set(k, v); },
  },
};
ctx.globalThis = ctx;
ctx.window = ctx;
vm.runInNewContext(readFileSync(new URL("../assets/exo-playbook.js", import.meta.url), "utf8"), ctx);

test("a matching trigger queues once per cooldown", function () {
  ctx.EXO.playbook.add({ id: "aos", trigger: "SATELLITE_AOS", action: "TUNE_SDR_PRESET", cooldownMs: 1000 });
  const first = ctx.EXO.playbook.run({ trigger: "SATELLITE_AOS" }, 1000);
  const second = ctx.EXO.playbook.run({ trigger: "SATELLITE_AOS" }, 1500);
  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.equal(ctx.EXO.playbook.log().at(-1).outcome, "COOLDOWN");
});

test("a different trigger does not fire the rule", function () {
  const fired = ctx.EXO.playbook.run({ trigger: "MESH_SOS_RX" }, 5000);
  assert.equal(fired.length, 0);
});
