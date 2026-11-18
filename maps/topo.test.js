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

console.log("topo ok " + rows[0].year + " " + rows.length);
