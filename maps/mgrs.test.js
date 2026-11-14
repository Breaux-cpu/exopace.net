const assert = require("assert");
const mgrs = require("./mgrs.js");

function close(a, b, tol, msg) {
  assert.ok(Math.abs(a - b) <= tol, (msg || "") + " " + a + " vs " + b);
}

const origin = mgrs.forward(0, 0, 5);
assert.strictEqual(origin, "31NAA6602100000", origin);

const nudged = mgrs.forward(0, 0.00001, 5);
assert.strictEqual(nudged, "31NAA6602100001", nudged);

const vegas = mgrs.forward(-115.0820944, 36.2361322, 5);
assert.strictEqual(vegas, "11SPA7234911844", vegas);

const p = mgrs.toLatLon("33UXP04");
/* Published point is the lat/lon bbox center of the UTM square.
   This reader returns the UTM square center, a few metres away. */
close(p.lon, 16.4145, 0.0002, "33UXP lon");
close(p.lat, 48.24949, 0.0002, "33UXP lat");
assert.strictEqual(mgrs.forward(p.lon, p.lat, 1), "33UXP04");
assert.strictEqual(mgrs.forward(16.4145, 48.24949, 5), "33UXP0500444997");
assert.strictEqual(mgrs.forward(p.lon, p.lat, 1), "33UXP04");
assert.strictEqual(mgrs.forward(p.lon, p.lat, 0), "33UXP");

const border = mgrs.toLatLon("24XWT783908");
close(border.lon, -32.66433, 0.00005, "border lon");
close(border.lat, 83.62778, 0.00005, "border lat");
assert.strictEqual(mgrs.forward(border.lon, border.lat, 3), "25XEN041865");

const spaced = mgrs.toLatLon("4Q FJ 12345 67890");
const tight = mgrs.toLatLon("4QFJ1234567890");
close(spaced.lat, tight.lat, 1e-10);
close(spaced.lon, tight.lon, 1e-10);

const samples = [
  [0, 0],
  [-115.0820944, 36.2361322],
  [151.2093, -33.8688],
  [-90.049, 35.1495],
  [6.5, 60],
  [12, 78],
  [-122.4, 37.8],
  [139.7, 35.7],
];
for (const pair of samples) {
  const text = mgrs.forward(pair[0], pair[1], 5);
  const back = mgrs.toLatLon(text);
  close(back.lon, pair[0], 0.00002, text + " lon");
  close(back.lat, pair[1], 0.00002, text + " lat");
}

assert.throws(() => mgrs.utm(86, 0), /polar/);
const g = mgrs.convergence(35.15, -90.05);
assert.ok(g > -3 && g < 3, "convergence " + g);

const sheets = require("./sheets.js");
const spec = sheets.paper(25000, "portrait");
assert.strictEqual(spec.neatWmm, 160);
assert.strictEqual(spec.neatHmm, 200);
const sheet = sheets.at(35.1495, -90.049, 25000, "portrait");
assert.strictEqual(sheet.wM, 4000);
assert.strictEqual(sheet.hM, 5000);
assert.strictEqual(sheet.e0 % 4000, 0);
assert.strictEqual(sheet.n0 % 5000, 0);
const moved = sheets.nudge(sheet, 1000, -1000);
assert.strictEqual(moved.e0, sheet.e0 + 1000);
assert.strictEqual(moved.n0, sheet.n0 - 1000);
const land = sheets.size(50000, "landscape");
assert.strictEqual(land.wKm, 10);
assert.strictEqual(land.hKm, 8);
console.log("mgrs ok", origin, vegas, sheet.name);
