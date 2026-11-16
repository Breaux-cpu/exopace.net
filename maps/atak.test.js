const assert = require("assert");
require("./mgrs.js");
require("./measure.js");
const atak = require("./atak.js");

const sheet = {
  name: "A & B",
  scale: 25000,
  sw: { lon: -90.05, lat: 35.1 },
  se: { lon: -90.0, lat: 35.1 },
  ne: { lon: -90.0, lat: 35.15 },
  nw: { lon: -90.05, lat: 35.15 },
};
const route = [
  { lat: 35.15, lon: -90.05 },
  { lat: 35.16, lon: -90.04 },
  { lat: 99, lon: 0 },
];
const doc = atak.kml([sheet], route);
assert.ok(doc.indexOf("A &amp; B") > 0);
assert.ok(doc.indexOf("EXOpace route") > 0);
assert.ok(doc.indexOf("-90.050000,35.150000,0") > 0);
assert.ok(doc.indexOf("-90.040000,35.160000,0") > 0);
assert.strictEqual(doc.indexOf("99.000000"), -1);
assert.strictEqual((doc.match(/<Point>/g) || []).length, 2);
assert.ok(doc.indexOf("15S") > 0);
assert.strictEqual(atak.routeKml([{ lat: 35, lon: -90 }]), "");
assert.strictEqual(atak.routeKml(null), "");

const dateLine = atak.lineSegments(require("./measure.js").routeLine([
  { lat: 0, lon: 179.5 },
  { lat: 0, lon: -179.5 },
]));
assert.ok(dateLine.length >= 2, dateLine.length);
dateLine.forEach(function (segment) {
  for (var i = 1; i < segment.length; i++) {
    assert.ok(Math.abs(segment[i][0] - segment[i - 1][0]) <= 180, segment[i][0]);
  }
});

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
atak.kmz([sheet], [jpeg], route).then(function (bytes) {
  assert.strictEqual(bytes[0], 0x50);
  assert.strictEqual(bytes[1], 0x4b);
  var text = new TextDecoder().decode(bytes);
  assert.ok(text.indexOf("EXOpace route") > 0);
  assert.ok(text.indexOf("doc.kml") > 0);
  console.log("atak ok", dateLine.length, bytes.length);
}).catch(function (err) {
  console.error(err);
  process.exit(1);
});
