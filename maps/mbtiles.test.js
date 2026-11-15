const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const initSqlJs = require("./vendor/sql-wasm.js");
const mb = require("./mbtiles.js");

assert.strictEqual(mb.tmsRow(2, 0), 3);
assert.strictEqual(mb.tmsRow(2, 3), 0);
assert.deepStrictEqual(mb.schema, [
  "CREATE TABLE metadata (name text, value text);",
  "CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);",
  "CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);",
]);

(async function () {
  const SQL = await initSqlJs({
    locateFile: function (file) { return path.join(__dirname, "vendor", file); },
  });
  const db = new SQL.Database();
  mb.schema.forEach(function (sql) { db.run(sql); });
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  db.run("INSERT INTO metadata (name, value) VALUES (?, ?)", ["format", "jpg"]);
  db.run("INSERT INTO metadata (name, value) VALUES (?, ?)", ["name", "EXOpace field map"]);
  db.run(
    "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)",
    [2, 1, mb.tmsRow(2, 0), jpeg]
  );
  const out = path.join("/tmp", "exopace-mbtiles-test.mbtiles");
  fs.writeFileSync(out, Buffer.from(db.export()));
  db.close();
  const report = execFileSync("python3", ["-c", `
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
assert con.execute("pragma integrity_check").fetchone()[0] == "ok"
rows = dict(con.execute("select name, value from metadata"))
assert rows["format"] == "jpg"
assert rows["name"] == "EXOpace field map"
count, = con.execute("select count(*) from tiles").fetchone()
assert count == 1
z, x, y, blob = con.execute("select zoom_level, tile_column, tile_row, tile_data from tiles").fetchone()
assert (z, x, y) == (2, 1, 3)
assert bytes(blob[:2]) == bytes([255, 216])
print("sqlite ok", count)
`, out], { encoding: "utf8" });
  console.log(report.trim());
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
