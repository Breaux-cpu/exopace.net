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

const fine = sheets.paper(24000, "portrait");
assert.strictEqual(fine.neatWmm, 160);
assert.strictEqual(fine.neatHmm, 200);
const s15 = sheets.size(15000, "portrait");
const s24 = sheets.size(24000, "portrait");
const s48 = sheets.size(48000, "portrait");
assert.strictEqual(s15.wM, 2400);
assert.strictEqual(s15.hM, 3000);
assert.strictEqual(s24.wM, 3840);
assert.strictEqual(s24.hM, 4800);
assert.strictEqual(s48.wM, 7680);
assert.strictEqual(s48.hM, 9600);
assert.deepStrictEqual(sheets.scales, [15000, 24000, 25000, 48000, 50000, 100000, 250000]);
assert.strictEqual(sheets.viewFromHash(""), null);
assert.strictEqual(sheets.viewFromHash("#scale=50000"), null);
assert.strictEqual(sheets.viewFromHash("#z=4"), null);
const gulf = sheets.viewFromHash("#lat=0&lon=0");
assert.deepStrictEqual(gulf.center, [0, 0]);
assert.strictEqual(gulf.zoom, 12);
const memphis = sheets.viewFromHash("#lat=35.15&lon=-90.05");
assert.deepStrictEqual(memphis.center, [-90.05, 35.15]);
assert.strictEqual(memphis.zoom, 12);
const zoomed = sheets.viewFromHash("#lat=35.15&lon=-90.05&z=11.5");
assert.strictEqual(zoomed.zoom, 11.5);
assert.strictEqual(sheets.viewFromHash("#lat=95&lon=0"), null);
assert.strictEqual(sheets.viewFromHash("#lat=&lon="), null);

const garmin = require("./garmin.js");
assert.strictEqual(garmin.spansDateLine({
  sw: { lon: 179 }, se: { lon: -179 }, ne: { lon: -179 }, nw: { lon: 179 },
}), true);
assert.strictEqual(garmin.spansDateLine(sheet), false);

const memphisQuad = sheets.quadAt(35.1495, -90.049, "usgs75");
assert.strictEqual(memphisQuad.kind, "quad");
assert.ok(Math.abs(memphisQuad.south - 35.125) < 1e-6, memphisQuad.south);
assert.ok(Math.abs(memphisQuad.west - -90.125) < 1e-6, memphisQuad.west);
assert.ok(Math.abs(memphisQuad.north - 35.25) < 1e-6, memphisQuad.north);
assert.ok(Math.abs(memphisQuad.east - -90) < 1e-6, memphisQuad.east);
assert.strictEqual(memphisQuad.scale, 24000);
const memphisTiles = sheets.letterTiles(memphisQuad);
assert.ok(memphisTiles.length >= 6 && memphisTiles.length <= 16, "tiles " + memphisTiles.length);
assert.strictEqual(memphisTiles[0].wM, 3840);
assert.strictEqual(memphisTiles[0].hM, 4800);
assert.strictEqual(memphisTiles[0].quadName, memphisQuad.name);
const namedQuad = Object.assign({}, memphisQuad, { mapName: "Northwest Memphis" });
assert.strictEqual(sheets.letterTiles(namedQuad)[0].quadName, "Northwest Memphis · " + memphisQuad.name);
assert.strictEqual(sheets.quadIndexLayer("usgs75"), 10);
assert.strictEqual(sheets.quadIndexLayer("usgs15"), 9);
assert.strictEqual(sheets.quadIndexLayer("usgs100"), 8);
assert.strictEqual(sheets.quadIndexLayer("usgs250"), 0);
assert.strictEqual(sheets.quadExtentFits(memphisQuad, -90.125, 35.125, -90, 35.25), true);
assert.strictEqual(sheets.quadExtentFits(memphisQuad, -90.125, 35.125, -89.9, 35.25), false);
const englewood = sheets.quadAt(39.7392, -104.9903, "usgs75");
assert.strictEqual(sheets.quadExtentFits(englewood, -105, 39.625, -104.875, 39.75), true);
const anchorageCell = sheets.quadAt(61.1875, -149.78, "usgs75");
assert.strictEqual(sheets.quadExtentFits(anchorageCell, -149.8125, 61.125, -149.625, 61.25), false);
assert.ok(sheets.seriesNote("usgs75").indexOf("National Map") > 0);
assert.ok(sheets.seriesNote("usgs250").indexOf("1° by 1°") > 0);
const beside = sheets.adjoins(memphisQuad);
const bySide = {};
beside.forEach((cell) => { bySide[cell.side] = cell; });
assert.deepStrictEqual(Object.keys(bySide).sort(), ["E", "N", "NE", "NW", "S", "SE", "SW", "W"]);
assert.ok(Math.abs(bySide.N.south - 35.25) < 1e-6);
assert.ok(Math.abs(bySide.N.west - memphisQuad.west) < 1e-6);
assert.ok(Math.abs(bySide.E.west - memphisQuad.east) < 1e-6);
assert.ok(Math.abs(bySide.S.north - memphisQuad.south) < 1e-6);
assert.ok(Math.abs(bySide.W.east - memphisQuad.west) < 1e-6);
assert.strictEqual(bySide.N.id, sheets.quadAt(35.26, -90.1, "usgs75").id);
assert.strictEqual(sheets.adjoinLines(memphisQuad)[0], "N " + bySide.N.corner + "  ·  S " + bySide.S.corner);
assert.strictEqual(sheets.adjoinLines(memphisQuad)[1], "E " + bySide.E.corner + "  ·  W " + bySide.W.corner);
assert.deepStrictEqual(sheets.letterTiles(memphisQuad)[0].adjoinLines, sheets.adjoinLines(memphisQuad));
assert.strictEqual(sheets.adjoins(sheet).length, 0);
assert.strictEqual(sheets.adjoinLines(sheet).length, 0);
const dateLine = sheets.quadAt(35, -179.95, "usgs75");
assert.ok(Math.abs(dateLine.west + 180) < 1e-6);
assert.deepStrictEqual(sheets.adjoins(dateLine).map((cell) => cell.side), ["N", "NE", "E", "SE", "S"]);
const polar = sheets.quadAt(83.9, -100, "usgs75");
assert.ok(Math.abs(polar.north - 84) < 1e-6);
assert.deepStrictEqual(sheets.adjoins(polar).map((cell) => cell.side), ["E", "SE", "S", "SW", "W"]);
const nudgedQuad = sheets.nudge(memphisQuad, 0, 1000);
assert.ok(Math.abs(nudgedQuad.south - 35.25) < 1e-6);
assert.strictEqual(sheets.decodeSheet(sheets.encodeSheet(memphisQuad)).id, memphisQuad.id);
assert.strictEqual(sheets.decodeSheet(sheets.encodeSheet(sheet)).id, sheet.id);
assert.strictEqual(sheets.quadAt(61.218, -149.9, "usgs75").scale, 25000);
assert.strictEqual(sheets.quadAt(18.465, -66.105, "usgs75").scale, 20000);
assert.strictEqual(sheets.quadAt(35.15, -90.05, "usgs15").scale, 62500);
const block = sheets.quadAt(35.15, -90.05, "usgs100");
assert.ok(Math.abs(block.south - 35) < 1e-6);
assert.ok(Math.abs(block.west - -91) < 1e-6);
assert.ok(Math.abs(block.north - 35.5) < 1e-6);
assert.ok(Math.abs(block.east - -90) < 1e-6);
assert.throws(() => sheets.quadAt(89, 0, "usgs75"), /polar/);
assert.throws(() => sheets.quadFromArc("usgs75", 10, 0), /grid/);

console.log("mgrs ok", origin, vegas, sheet.name, memphisQuad.name, memphisTiles.length);
