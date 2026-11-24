/* Terrarium elevation from cached tiles. A cache miss stays null. It is not zero. */
(function (root) {
  var CACHE = "exopace-dem-v1";
  var mem = new Map();

  function decodeTerrarium(r, g, b) {
    return r * 256 + g + b / 256 - 32768;
  }

  function xyz(lat, lon, z) {
    var n = 2 ** z;
    var x = Math.floor(((lon + 180) / 360) * n);
    var latR = lat * Math.PI / 180;
    var y = Math.floor((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n);
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x >= n) x = n - 1;
    if (y >= n) y = n - 1;
    return { z: z, x: x, y: y };
  }

  function haversine(a, b) {
    var R = 6371000;
    var p1 = a.lat * Math.PI / 180;
    var p2 = b.lat * Math.PI / 180;
    var dp = (b.lat - a.lat) * Math.PI / 180;
    var dl = (b.lon - a.lon) * Math.PI / 180;
    var s = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function decodeBitmap(bmp) {
    var c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(bmp, 0, 0);
    var data = ctx.getImageData(0, 0, bmp.width, bmp.height).data;
    var elev = new Float32Array(bmp.width * bmp.height);
    for (var i = 0, p = 0; i < elev.length; i++, p += 4) elev[i] = decodeTerrarium(data[p], data[p + 1], data[p + 2]);
    return { elev: elev, w: bmp.width, h: bmp.height };
  }

  function sampleRec(rec, lat, lon, z, x, y) {
    var n = 2 ** z;
    var fx = ((lon + 180) / 360) * n - x;
    var latR = lat * Math.PI / 180;
    var gy = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n - y;
    var px = Math.min(rec.w - 1, Math.max(0, fx * rec.w));
    var py = Math.min(rec.h - 1, Math.max(0, gy * rec.h));
    var x0 = Math.floor(px);
    var y0 = Math.floor(py);
    var x1 = Math.min(rec.w - 1, x0 + 1);
    var y1 = Math.min(rec.h - 1, y0 + 1);
    var tx = px - x0;
    var ty = py - y0;
    var i00 = rec.elev[y0 * rec.w + x0];
    var i10 = rec.elev[y0 * rec.w + x1];
    var i01 = rec.elev[y1 * rec.w + x0];
    var i11 = rec.elev[y1 * rec.w + x1];
    return i00 * (1 - tx) * (1 - ty) + i10 * tx * (1 - ty) + i01 * (1 - tx) * ty + i11 * tx * ty;
  }

  async function openCache() {
    try { return await caches.open(CACHE); } catch (err) { return null; }
  }

  async function record(z, x, y) {
    var key = z + "/" + x + "/" + y;
    if (mem.has(key)) return mem.get(key);
    var req = "/api/terrain/" + key;
    var cache = await openCache();
    var res = cache ? await cache.match(req) : null;
    if (!res && root.navigator && root.navigator.onLine !== false) {
      try {
        var live = await fetch(req);
        if (live.ok) {
          if (cache) await cache.put(req, live.clone());
          res = live;
        }
      } catch (err) { res = null; }
    }
    if (!res) return null;
    var bmp = await createImageBitmap(await res.blob());
    var rec = decodeBitmap(bmp);
    if (bmp.close) bmp.close();
    mem.set(key, rec);
    return rec;
  }

  async function sample(lat, lon, z) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    var tile = xyz(lat, lon, z || 12);
    var rec = await record(tile.z, tile.x, tile.y);
    if (!rec) return null;
    var meters = sampleRec(rec, lat, lon, tile.z, tile.x, tile.y);
    return Number.isFinite(meters) ? meters : null;
  }

  async function samplePath(points) {
    var rows = [];
    var distance = 0;
    for (var i = 0; i < points.length; i++) {
      if (i > 0) distance += haversine(points[i - 1], points[i]);
      rows.push({
        lat: points[i].lat,
        lon: points[i].lon,
        elev: await sample(points[i].lat, points[i].lon),
        dM: distance,
      });
    }
    return rows;
  }

  async function stats() {
    var cache = await openCache();
    if (!cache) return { tiles: 0 };
    var keys = await cache.keys();
    return { tiles: keys.length };
  }

  root.EXO = root.EXO || {};
  root.EXO.dem = {
    decodeTerrarium: decodeTerrarium,
    xyz: xyz,
    record: record,
    sample: sample,
    samplePath: samplePath,
    stats: stats,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
