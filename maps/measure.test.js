const assert = require("assert");
const mgrs = require("./mgrs.js");
const measure = require("./measure.js");

const A = 6378137;
const equatorDeg = A * Math.PI / 180;

const east = measure.vincenty(0, 0, 0, 1);
assert.ok(Math.abs(east.distanceM - equatorDeg) < 0.01, east.distanceM);
assert.ok(Math.abs(east.trueAz - 90) < 1e-6, east.trueAz);

const west = measure.vincenty(0, 10, 0, 9);
assert.ok(Math.abs(west.trueAz - 270) < 1e-6, west.trueAz);

const north = measure.vincenty(0, 0, 1, 0);
const south = measure.vincenty(1, 0, 0, 0);
assert.ok(Math.abs(north.trueAz) < 1e-6, north.trueAz);
assert.ok(Math.abs(south.trueAz - 180) < 1e-6, south.trueAz);
assert.ok(Math.abs(north.distanceM - south.distanceM) < 0.01);
assert.ok(north.distanceM > 110500 && north.distanceM < 110800, north.distanceM);

const dateline = measure.vincenty(0, 179.5, 0, -179.5);
assert.ok(Math.abs(dateline.distanceM - equatorDeg) < 0.05, dateline.distanceM);
assert.ok(Math.abs(dateline.trueAz - 90) < 1e-4, dateline.trueAz);

const same = measure.vincenty(35.15, -90.05, 35.15, -90.05);
assert.strictEqual(same.distanceM, 0);
assert.strictEqual(same.trueAz, null);
assert.strictEqual(measure.vincenty(91, 0, 0, 0), null);

const conv = mgrs.convergence(35, -91);
assert.ok(conv > 1 && conv < 2, conv);
const leg = measure.solve(35, -91, 36, -91, conv, 4);
assert.ok(Math.abs(leg.trueAz) < 0.01, leg.trueAz);
assert.ok(Math.abs(leg.gridAz - ((360 - conv) % 360)) < 0.02, leg.gridAz);
assert.ok(leg.gridAz > 350, leg.gridAz);
assert.strictEqual(leg.magAz, measure.magneticAzimuth(leg.trueAz, 4));
assert.ok(Math.abs(leg.backTrue - 180) < 0.01, leg.backTrue);

assert.strictEqual(measure.magneticAzimuth(2, 5), 357);
assert.strictEqual(measure.gridAzimuth(0, 1.5), 358.5);
assert.strictEqual(measure.azText(0), "000.0°");
assert.strictEqual(measure.azText(47.16), "047.2°");
assert.strictEqual(measure.azText(359.96), "000.0°");
assert.strictEqual(measure.formatDistance(1240, "metric"), "1,240 M");
assert.strictEqual(measure.formatDistance(equatorDeg, "metric"), "111.32 KM");
assert.strictEqual(measure.formatDistance(1240, "imperial"), "0.77 MI");
assert.strictEqual(measure.formatDistance(30, "imperial"), "98 FT");

const arc = measure.lineCoords({ lat: 0, lon: 179.5 }, { lat: 0, lon: -179.5 });
assert.strictEqual(arc.length, 17);
for (var i = 1; i < arc.length; i++) {
  assert.ok(Math.abs(arc[i][0] - arc[i - 1][0]) < 1, arc[i][0]);
}

console.log("measure ok", east.distanceM.toFixed(3), north.distanceM.toFixed(3), leg.gridAz.toFixed(3));
