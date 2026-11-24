import test from "node:test";
import assert from "node:assert/strict";
import { parseKp } from "../functions/api/spaceweather.js";

test("planetary k index uses the named column and does not turn a miss into zero", () => {
  assert.equal(parseKp(null), null);
  assert.equal(parseKp([["time_tag", "Kp"], ["2026-11-24", "0"]]), 0);
  assert.equal(parseKp([["time_tag", "Kp"], ["2026-11-24", ""]]), null);
  assert.equal(parseKp([["time_tag"], ["2026-11-24"]]), null);
});
