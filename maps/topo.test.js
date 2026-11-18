const assert = require("assert");
require("./mgrs.js");
const sheets = require("./sheets.js");
const topo = require("./topo.js");

const quad = sheets.quadAt(35.1495, -90.049, "usgs75");
assert.strictEqual(topo.queryExtent("usgs75"), "7.5 x 7.5 minute");
assert.strictEqual(topo.queryExtent("usgs15"), "15 x 15 minute");
assert.strictEqual(topo.queryExtent("usgs100"), "30 x 60 minute");
assert.strictEqual(topo.queryExtent("usgs250"), "1 x 2 degree");
assert.strictEqual(topo.queryExtent("letter"), "");

const cell = {
  minX: quad.west, maxX: quad.east, minY: quad.south, maxY: quad.north,
};
const neighbor = {
  minX: quad.east, maxX: quad.east + 0.125, minY: quad.south, maxY: quad.north,
};
const items = [
  {
    title: "USGS 1:24000-scale Quadrangle for Northwest Memphis, TN 1965",
    extent: "7.5 x 7.5 minute",
    publicationDate: "1965-01-01",
    boundingBox: cell,
    downloadURL: "https://prd-tnm.s3.amazonaws.com/a-1965-early.pdf",
    previewGraphicURL: "https://prd-tnm.s3.amazonaws.com/a-1965.jpg",
  },
  {
    title: "USGS 1:24000-scale Quadrangle for Northwest Memphis, TN 1965",
    extent: "7.5 x 7.5 minute",
    publicationDate: "1965-01-01",
    boundingBox: cell,
    downloadURL: "https://prd-tnm.s3.amazonaws.com/a-1965-later.pdf",
    previewGraphicURL: "http://prd-tnm.s3.amazonaws.com/insecure.jpg",
  },
  {
    title: "USGS 1:24000-scale Quadrangle for Northwest Memphis, TN 1997",
    extent: "7.5 x 7.5 minute",
    publicationDate: "1997-01-01",
    boundingBox: cell,
    downloadURL: "https://prd-tnm.s3.amazonaws.com/a-1997.pdf",
    previewGraphicURL: "https://prd-tnm.s3.amazonaws.com/a-1997.jpg",
  },
  {
    title: "USGS 1:24000-scale Quadrangle for Northeast Memphis, TN 1997",
    extent: "7.5 x 7.5 minute",
    publicationDate: "1997-01-01",
    boundingBox: neighbor,
    downloadURL: "https://prd-tnm.s3.amazonaws.com/neighbor.pdf",
    previewGraphicURL: "https://prd-tnm.s3.amazonaws.com/neighbor.jpg",
  },
  {
    title: "USGS 1:100000-scale Quadrangle for Memphis East, TN 1986",
    extent: "30 x 60 minute",
    publicationDate: "1986-01-01",
    boundingBox: { minX: -90, maxX: -89, minY: 35, maxY: 35.5 },
    downloadURL: "https://prd-tnm.s3.amazonaws.com/hundredk.pdf",
  },
  {
    title: "USGS 1:24000-scale Quadrangle for Northwest Memphis, TN 1953",
    extent: "7.5 x 7.5 minute",
    publicationDate: "1953-01-01",
    boundingBox: cell,
    downloadURL: "http://prd-tnm.s3.amazonaws.com/plain-http.pdf",
  },
  {
    title: "USGS 1:24000-scale Quadrangle for Northwest Memphis, TN 2019",
    extent: "7.5 x 7.5 minute",
    publicationDate: "2019-01-01",
    boundingBox: cell,
    downloadURL: "https://example.com/not-usgs.pdf",
  },
];

const rows = topo.editions(quad, items);
assert.deepStrictEqual(rows.map((row) => row.year), [1997, 1965]);
assert.strictEqual(rows[0].name, "Northwest Memphis, TN");
assert.strictEqual(rows[0].pdf, "https://prd-tnm.s3.amazonaws.com/a-1997.pdf");
assert.strictEqual(rows[0].preview, "https://prd-tnm.s3.amazonaws.com/a-1997.jpg");
assert.strictEqual(rows[1].pdf, "https://prd-tnm.s3.amazonaws.com/a-1965-later.pdf");
assert.strictEqual(rows[1].preview, "");
assert.strictEqual(topo.editions({ kind: "letter" }, items).length, 0);
assert.strictEqual(topo.editions(quad, []).length, 0);

const fifteen = sheets.quadAt(35.15, -90.05, "usgs15");
assert.strictEqual(topo.editions(fifteen, items).length, 0);

const pdf = "https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/PDF/TN/24000/TN_Northwest%20Memphis_148630_1997_24000_geo.pdf";
assert.strictEqual(
  topo.geotiffUrl(pdf),
  "https://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/GeoTIFF/TN/TN_Northwest%20Memphis_148630_1997_24000_geo.tif",
);
assert.strictEqual(topo.geotiffUrl("https://example.com/nope.pdf"), "");
assert.strictEqual(topo.geotiffUrl("http://prd-tnm.s3.amazonaws.com/StagedProducts/Maps/HistoricalTopo/PDF/TN/24000/x_geo.pdf"), "");

const memphisProj = {
  a: 6378137,
  f: 1 / 298.257223563,
  lon0: -90.0625,
  lat0: 35.125,
  easting: 0,
  northing: 0,
  k0: 1,
};
const origin = topo.inverseTm(0, 0, memphisProj);
assert.ok(Math.abs(origin[0] + 90.0625) < 1e-8, origin[0]);
assert.ok(Math.abs(origin[1] - 35.125) < 1e-8, origin[1]);

function putU16(bytes, offset, value) {
  bytes[offset] = value & 255;
  bytes[offset + 1] = (value >> 8) & 255;
}
function putU32(bytes, offset, value) {
  bytes[offset] = value & 255;
  bytes[offset + 1] = (value >> 8) & 255;
  bytes[offset + 2] = (value >> 16) & 255;
  bytes[offset + 3] = (value >>> 24) & 255;
}
function putF64(bytes, offset, value) {
  new DataView(bytes.buffer).setFloat64(offset, value, true);
}
function putIfd(bytes, offset, tags, next) {
  putU16(bytes, offset, tags.length);
  tags.forEach(function (tag, index) {
    const at = offset + 2 + index * 12;
    putU16(bytes, at, tag[0]);
    putU16(bytes, at + 2, tag[1]);
    putU32(bytes, at + 4, tag[2]);
    putU32(bytes, at + 8, tag[3]);
  });
  putU32(bytes, offset + 2 + tags.length * 12, next);
}

const header = new Uint8Array(4096);
header[0] = 73;
header[1] = 73;
header[2] = 42;
putU32(header, 4, 8);
const scaleAt = 700;
const tieAt = 740;
const doublesAt = 800;
const keysAt = 900;
const tileAt = 1200;
[2.032, 2.032, 0].forEach((value, index) => putF64(header, scaleAt + index * 8, value));
[0, 0, 0, -6564.351726960475, 14783.349829774485, 0].forEach((value, index) => putF64(header, tieAt + index * 8, value));
[35.125, -90.0625, 1, 0, 0, 298.2572235604902, 6378137].forEach((value, index) => putF64(header, doublesAt + index * 8, value));
const keys = [
  [1024, 0, 1, 1],
  [1025, 0, 1, 1],
  [2048, 0, 1, 4326],
  [2054, 0, 1, 9102],
  [2057, 34736, 1, 6],
  [2059, 34736, 1, 5],
  [3072, 0, 1, 32767],
  [3075, 0, 1, 1],
  [3076, 0, 1, 9001],
  [3080, 34736, 1, 1],
  [3081, 34736, 1, 0],
  [3082, 34736, 1, 3],
  [3083, 34736, 1, 4],
  [3092, 34736, 1, 2],
];
putU16(header, keysAt, 1);
putU16(header, keysAt + 2, 1);
putU16(header, keysAt + 4, 0);
putU16(header, keysAt + 6, keys.length);
keys.forEach((key, index) => {
  const at = keysAt + 8 + index * 8;
  putU16(header, at, key[0]);
  putU16(header, at + 2, key[1]);
  putU16(header, at + 4, key[2]);
  putU16(header, at + 6, key[3]);
});
for (let i = 0; i < 20; i++) {
  putU32(header, tileAt + i * 4, 1800);
  putU32(header, tileAt + 80 + i * 4, 8);
}

const second = 400;
putIfd(header, 8, [
  [256, 3, 1, 6617],
  [257, 3, 1, 8242],
  [259, 3, 1, 7],
  [322, 3, 1, 512],
  [323, 3, 1, 512],
  [324, 4, 221, 8],
  [325, 4, 221, 8],
  [33550, 12, 3, scaleAt],
  [33922, 12, 6, tieAt],
  [34735, 3, 4 + keys.length * 4, keysAt],
  [34736, 12, 7, doublesAt],
], second);
putIfd(header, second, [
  [256, 3, 1, 414],
  [257, 3, 1, 516],
  [259, 3, 1, 7],
  [322, 3, 1, 128],
  [323, 3, 1, 128],
  [324, 4, 20, tileAt],
  [325, 4, 20, tileAt + 80],
], 1500);
putIfd(header, 1500, [
  [256, 3, 1, 1655],
  [257, 3, 1, 2061],
  [259, 3, 1, 7],
  [322, 3, 1, 1655],
  [323, 3, 1, 2061],
  [324, 4, 1, 1900],
  [325, 4, 1, 100],
], 1700);
putIfd(header, 1700, [
  [256, 3, 1, 2400],
  [257, 3, 1, 3000],
  [259, 3, 1, 7],
  [322, 3, 1, 2400],
  [323, 3, 1, 3000],
  [324, 4, 1, 1900],
  [325, 4, 1, 100],
], 1900);
for (let i = 0; i < 4; i++) {
  putU32(header, 2100 + i * 4, 3000);
  putU32(header, 2200 + i * 4, 400000);
}
putIfd(header, 1900, [
  [256, 3, 1, 800],
  [257, 3, 1, 800],
  [259, 3, 1, 7],
  [322, 3, 1, 400],
  [323, 3, 1, 400],
  [324, 4, 4, 2100],
  [325, 4, 4, 2200],
], 0);

const reg = topo.registration(header);
assert.ok(reg, "registration");
assert.strictEqual(reg.overview.width, 1655);
assert.strictEqual(reg.overview.height, 2061);
assert.strictEqual(reg.overview.tiles.length, 1);
const expected = [
  [-90.13464, 35.25823],
  [-89.98688, 35.25823],
  [-89.98702, 35.10727],
  [-90.13450, 35.10727],
];
reg.corners.forEach((point, index) => {
  assert.ok(Math.abs(point[0] - expected[index][0]) < 0.00008, point[0]);
  assert.ok(Math.abs(point[1] - expected[index][1]) < 0.00008, point[1]);
});
assert.strictEqual(topo.covers(quad, reg.corners), true);
const shifted = Object.assign({}, quad, {
  west: quad.west + 2,
  east: quad.east + 2,
});
assert.strictEqual(topo.covers(shifted, reg.corners), false);
assert.strictEqual(topo.registration(new Uint8Array(32)), null);

const clark = {
  a: 6378206.4,
  f: 1 / 294.978698213898,
  lat0: 30,
  lon0: -96,
  easting: 0,
  northing: 0,
};
const snyder = topo.inversePoly(1776774.54, 1319657.78, clark);
assert.ok(snyder, "snyder");
assert.ok(Math.abs(snyder[0] + 75) < 0.0002, snyder[0]);
assert.ok(Math.abs(snyder[1] - 40) < 0.0002, snyder[1]);
const wgs = topo.nad27ToWgs84(-90.05, 35.2);
assert.ok(wgs, "nad27");
const east = (wgs[0] + 90.05) * 111320 * Math.cos(35.2 * Math.PI / 180);
const north = (wgs[1] - 35.2) * 110540;
const meters = Math.hypot(east, north);
assert.ok(meters > 5 && meters < 80, meters);
assert.strictEqual(topo.nad27ToWgs84(-150, 61), null);

const topLeft = topo.locate(reg.corners, 6617, 8242, reg.corners[0][0], reg.corners[0][1]);
const bottomRight = topo.locate(reg.corners, 6617, 8242, reg.corners[2][0], reg.corners[2][1]);
assert.ok(topLeft && Math.abs(topLeft[0]) < 1 && Math.abs(topLeft[1]) < 1, topLeft);
assert.ok(bottomRight && Math.abs(bottomRight[0] - 6617) < 1 && Math.abs(bottomRight[1] - 8242) < 1, bottomRight);
const ring = [
  [quad.west, quad.north],
  [quad.east, quad.north],
  [quad.east, quad.south],
  [quad.west, quad.south],
];
const win = topo.windowOf(reg.corners, 1655, 2061, ring);
assert.ok(win, "window");
assert.ok(win.x > 0 && win.y > 0, win.x + "," + win.y);
assert.ok(win.w < 1655 && win.h < 2061, win.w + "x" + win.h);
assert.ok(win.w > 1200 && win.h > 1500, win.w + "x" + win.h);
assert.strictEqual(topo.covers(quad, win.coordinates), true);
assert.strictEqual(topo.windowOf(reg.corners, 1655, 2061, ring.map((point) => [point[0] + 2, point[1]])), null);

console.log("topo ok " + rows[0].year + " " + rows.length + " " + reg.corners[0][0].toFixed(5) + " " + win.w + "x" + win.h);
