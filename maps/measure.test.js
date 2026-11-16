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

const grade = measure.slope(1000, 100);
assert.ok(Math.abs(grade.percent - 10) < 1e-9, grade.percent);
assert.ok(Math.abs(grade.degrees - Math.atan(0.1) * 180 / Math.PI) < 1e-9);
assert.ok(Math.abs(grade.pathM - Math.sqrt(1000 * 1000 + 100 * 100)) < 1e-6);
assert.strictEqual(measure.slope(0, 10), null);

const legs = [
  measure.solve(0, 0, 0, 1, 0, null),
  measure.solve(0, 1, 0, 2, 0, null),
];
assert.ok(Math.abs(measure.totalDistance(legs) - equatorDeg * 2) < 0.05);
assert.strictEqual(measure.totalDistance([null]), null);

const track = measure.gpx([
  { lat: 35.15, lon: -90.05, elev: 80, name: "A & B" },
  { lat: 35.16, lon: -90.04, elev: null, name: "" },
  { lat: 99, lon: 0 },
]);
assert.ok(track.indexOf('lat="35.150000"') > 0);
assert.ok(track.indexOf("<ele>80.0</ele>") > 0);
assert.ok(track.indexOf("A &amp; B") > 0);
assert.ok(track.indexOf("lat=\"99") < 0);

const route = measure.routeLine([
  { lat: 0, lon: 179.5 },
  { lat: 0, lon: -179.5 },
  { lat: 0.1, lon: -179.4 },
]);
assert.ok(route.length > 17, route.length);
for (var step = 1; step < route.length; step++) {
  assert.ok(Math.abs(route[step][0] - route[step - 1][0]) < 2, route[step][0]);
}

const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
const inside = measure.clipPolyline([{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 4, y: 4 }], box);
assert.strictEqual(inside.length, 1);
assert.strictEqual(inside[0].length, 3);
const cut = measure.clipPolyline([{ x: -5, y: 5 }, { x: 5, y: 5 }, { x: 15, y: 5 }], box);
assert.strictEqual(cut.length, 1);
assert.ok(Math.abs(cut[0][0].x) < 1e-6, cut[0][0].x);
assert.ok(Math.abs(cut[0][cut[0].length - 1].x - 10) < 1e-6);
const outside = measure.clipPolyline([{ x: -5, y: -5 }, { x: -1, y: -1 }], box);
assert.strictEqual(outside.length, 0);
const gap = measure.clipPolyline([{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 20, y: 1 }, { x: 22, y: 1 }, { x: 5, y: 5 }], box);
assert.strictEqual(gap.length, 2);

const sheets = require("./sheets.js");
require("./print.js");
const sheet = sheets.at(35.15, -90.05, 50000, "portrait");
const sheetBox = {
  minX: sheet.e0,
  minY: sheet.n0,
  maxX: sheet.e0 + sheet.wM,
  maxY: sheet.n0 + sheet.hM,
};
const onSheet = measure.sheetRoute([
  { lat: sheet.mid.lat, lon: sheet.mid.lon },
  { lat: sheet.ne.lat, lon: sheet.ne.lon },
], sheet.zone, sheetBox, mgrs.utm);
assert.strictEqual(onSheet.runs.length, 1);
assert.strictEqual(onSheet.marks.length, 2);
assert.strictEqual(onSheet.marks[0].n, 1);
assert.strictEqual(onSheet.marks[1].n, 2);

const southPt = mgrs.utmInverse(sheet.zone, sheet.hemi, sheet.e0 + sheet.wM / 2, sheet.n0 - 500);
const northEdge = mgrs.utmInverse(sheet.zone, sheet.hemi, sheet.e0 + sheet.wM / 2, sheet.n0 + sheet.hM + 500);
const crossing = measure.sheetRoute([
  { lat: southPt.lat, lon: southPt.lon },
  { lat: northEdge.lat, lon: northEdge.lon },
], sheet.zone, sheetBox, mgrs.utm);
assert.strictEqual(crossing.runs.length, 1);
assert.strictEqual(crossing.marks.length, 0);
const ys = crossing.runs[0].map(function (p) { return p.y; });
assert.ok(Math.abs(Math.min.apply(null, ys) - sheetBox.minY) < 1);
assert.ok(Math.abs(Math.max.apply(null, ys) - sheetBox.maxY) < 1);

const missed = measure.sheetRoute([
  { lat: 21.3, lon: -157.8 },
  { lat: 21.4, lon: -157.7 },
], sheet.zone, sheetBox, mgrs.utm);
assert.strictEqual(missed.runs.length, 0);
assert.strictEqual(missed.marks.length, 0);

const pix = globalThis.EXO.print.routePixels(sheet, [
  { lat: sheet.mid.lat, lon: sheet.mid.lon },
  { lat: sheet.sw.lat, lon: sheet.sw.lon },
], 10, 20, 756, 945);
assert.strictEqual(pix.marked, true);
assert.strictEqual(pix.marks.length, 2);
pix.runs.forEach(function (run) {
  run.forEach(function (p) {
    assert.ok(p.x >= 10 - 0.05 && p.x <= 766.05, p.x);
    assert.ok(p.y >= 20 - 0.05 && p.y <= 965.05, p.y);
  });
});
const blank = globalThis.EXO.print.routePixels(sheet, [{ lat: 21.3, lon: -157.8 }, { lat: 21.4, lon: -157.7 }], 10, 20, 756, 945);
assert.strictEqual(blank.marked, false);

console.log("measure ok", east.distanceM.toFixed(3), north.distanceM.toFixed(3), leg.gridAz.toFixed(3), grade.degrees.toFixed(3));
