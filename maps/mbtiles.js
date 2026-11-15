/* Raster MBTiles for the selected sheets. sql.js writes a real SQLite file. */
(function (root) {
  var SCHEMA = [
    "CREATE TABLE metadata (name text, value text);",
    "CREATE TABLE tiles (zoom_level integer, tile_column integer, tile_row integer, tile_data blob);",
    "CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row);",
  ];
  var MAX_TILES = 200;

  function tmsRow(z, y) {
    return Math.pow(2, z) - 1 - y;
  }

  function tileRange(z, box) {
    var n = Math.pow(2, z);
    function xOf(lon) { return (lon + 180) / 360 * n; }
    function yOf(lat) {
      var s = Math.sin(lat * Math.PI / 180);
      return (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2 * n;
    }
    var x0 = Math.max(0, Math.floor(xOf(box[0])));
    var x1 = Math.min(n - 1, Math.floor(xOf(box[2])));
    var yNorth = yOf(box[3]);
    var ySouth = yOf(box[1]);
    var y0 = Math.max(0, Math.floor(Math.min(yNorth, ySouth)));
    var y1 = Math.min(n - 1, Math.floor(Math.max(yNorth, ySouth)));
    return { x0: x0, x1: x1, y0: y0, y1: y1 };
  }

  function cover(sheets, z) {
    var seen = {};
    var out = [];
    sheets.forEach(function (sheet) {
      var range = tileRange(z, root.EXO.sheets.bbox(sheet));
      for (var x = range.x0; x <= range.x1; x++) {
        for (var y = range.y0; y <= range.y1; y++) {
          var key = z + "/" + x + "/" + y;
          if (seen[key]) continue;
          seen[key] = true;
          out.push({ z: z, x: x, y: y });
        }
      }
    });
    return out;
  }

  function boundsOf(sheets) {
    var west = 180;
    var south = 90;
    var east = -180;
    var north = -90;
    sheets.forEach(function (sheet) {
      var box = root.EXO.sheets.bbox(sheet);
      west = Math.min(west, box[0]);
      south = Math.min(south, box[1]);
      east = Math.max(east, box[2]);
      north = Math.max(north, box[3]);
    });
    return [west, south, east, north];
  }

  function kindOf(buf) {
    if (buf && buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return "jpg";
    if (buf && buf.length > 4 && buf[0] === 0x89 && buf[1] === 0x50) return "png";
    return "";
  }

  function loadSql() {
    if (root.initSqlJs) return Promise.resolve(root.initSqlJs);
    return new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      script.src = "vendor/sql-wasm.js";
      script.onload = function () { resolve(root.initSqlJs); };
      script.onerror = function () { reject(new Error("sql.js missing")); };
      document.head.appendChild(script);
    });
  }

  async function fetchTile(tile) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 12000);
    try {
      var url = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/"
        + tile.z + "/" + tile.y + "/" + tile.x;
      var res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      var buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length < 32 || buf.length > 600000) return null;
      if (!kindOf(buf)) return null;
      return buf;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function mapPool(items, limit, fn) {
    var cursor = 0;
    var out = new Array(items.length);
    async function worker() {
      while (cursor < items.length) {
        var n = cursor;
        cursor += 1;
        out[n] = await fn(items[n], n);
      }
    }
    var workers = [];
    var nWorkers = Math.min(limit, items.length);
    for (var i = 0; i < nWorkers; i++) workers.push(worker());
    await Promise.all(workers);
    return out;
  }

  async function build(sheets, setStatus) {
    if (!sheets || !sheets.length) throw new Error("no sheets");
    var zoom = 8;
    sheets.forEach(function (sheet) {
      var z = root.EXO.print.zoomFor(sheet.scale);
      if (z > zoom) zoom = z;
    });
    zoom = Math.max(8, Math.min(16, zoom));
    var tiles = cover(sheets, zoom);
    while (tiles.length > MAX_TILES && zoom > 8) {
      zoom -= 1;
      tiles = cover(sheets, zoom);
    }
    if (!tiles.length || tiles.length > MAX_TILES) throw new Error("too many tiles");
    if (setStatus) setStatus("MBTILES z" + zoom + " — " + tiles.length + " TILES");
    var initSqlJs = await loadSql();
    var SQL = await initSqlJs({ locateFile: function (file) { return "vendor/" + file; } });
    var fetched = await mapPool(tiles, 4, fetchTile);
    var format = "";
    var kept = [];
    var missing = 0;
    for (var i = 0; i < tiles.length; i++) {
      var buf = fetched[i];
      if (!buf) { missing += 1; continue; }
      var kind = kindOf(buf);
      if (!format) format = kind;
      if (kind !== format) throw new Error("mixed tile format");
      kept.push({ tile: tiles[i], buf: buf });
    }
    if (!kept.length || missing > tiles.length / 2) throw new Error("tiles missing");
    var db = new SQL.Database();
    SCHEMA.forEach(function (sql) { db.run(sql); });
    var box = boundsOf(sheets);
    var rows = [
      ["name", "EXOpace field map"],
      ["type", "baselayer"],
      ["version", "1.3"],
      ["description", "Raster imagery for the selected EXOpace sheets"],
      ["format", format],
      ["minzoom", String(zoom)],
      ["maxzoom", String(zoom)],
      ["bounds", box.map(function (n) { return n.toFixed(6); }).join(",")],
      ["center", ((box[0] + box[2]) / 2).toFixed(6) + "," + ((box[1] + box[3]) / 2).toFixed(6) + "," + zoom],
      ["attribution", "Esri, Maxar, Earthstar Geographics"],
    ];
    rows.forEach(function (row) {
      db.run("INSERT INTO metadata (name, value) VALUES (?, ?)", row);
    });
    kept.forEach(function (item) {
      db.run(
        "INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)",
        [item.tile.z, item.tile.x, tmsRow(item.tile.z, item.tile.y), item.buf]
      );
    });
    var bytes = db.export();
    db.close();
    return { bytes: bytes, zoom: zoom, count: kept.length, missing: missing, format: format };
  }

  root.EXO = root.EXO || {};
  root.EXO.mbtiles = { build: build, schema: SCHEMA, tmsRow: tmsRow, cover: cover };
  if (typeof module === "object" && module.exports) module.exports = root.EXO.mbtiles;
})(typeof globalThis !== "undefined" ? globalThis : this);
