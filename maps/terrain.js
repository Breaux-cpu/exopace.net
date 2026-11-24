/* Terrarium elevation, hillshade, and contours.
   Online tiles come from /api/terrain (same origin). A vq copy uses tiles/terrarium. */
(function (root) {
  var cache = new Map();
  var MAX = 240;

  function key(z, x, y) {
    return z + "/" + x + "/" + y;
  }

  function urlFor(z, x, y) {
    if (root.EXO && root.EXO.offlineHost) return "tiles/terrarium/" + z + "/" + x + "/" + y + ".png";
    return "/api/terrain/" + z + "/" + x + "/" + y;
  }

  function decode(img) {
    var w = img.width;
    var h = img.height;
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    var d = ctx.getImageData(0, 0, w, h).data;
    var elev = new Float32Array(w * h);
    for (var i = 0, p = 0; i < elev.length; i++, p += 4) {
      elev[i] = d[p] * 256 + d[p + 1] + d[p + 2] / 256 - 32768;
    }
    return { elev: elev, w: w, h: h };
  }

  async function load(z, x, y, signal) {
    var n = 1 << z;
    if (z < 0 || z > 15 || x < 0 || y < 0 || x >= n || y >= n) return null;
    var k = key(z, x, y);
    if (cache.has(k)) return cache.get(k);
    if (root.EXO && root.EXO.dem && root.EXO.dem.record) {
      var demRec = await root.EXO.dem.record(z, x, y);
      if (demRec) {
        cache.set(k, demRec);
        if (cache.size > MAX) cache.delete(cache.keys().next().value);
        return demRec;
      }
      return null;
    }
    var urls = [];
    if (root.EXO && root.EXO.offlineHost) urls.push(urlFor(z, x, y));
    urls.push("/api/terrain/" + z + "/" + x + "/" + y);
    var res = null;
    for (var u = 0; u < urls.length; u++) {
      try {
        var attempt = await fetch(urls[u], { signal: signal });
        if (attempt.ok) { res = attempt; break; }
      } catch (err) {}
    }
    if (!res) return null;
    var blob = await res.blob();
    var bmp = await createImageBitmap(blob);
    var rec = decode(bmp);
    bmp.close && bmp.close();
    cache.set(k, rec);
    if (cache.size > MAX) cache.delete(cache.keys().next().value);
    return rec;
  }

  function latOfY(z, y) {
    var n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function cellSize(z, y) {
    var lat = latOfY(z, y + 0.5);
    return 156543.03392804097 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  }

  function shadeGrid(elev, w, h, cell, contrast) {
    var rgba = new Uint8ClampedArray(w * h * 4);
    var alt = 45 * Math.PI / 180;
    var az = 315 * Math.PI / 180;
    var cAlt = Math.cos(alt);
    var sAlt = Math.sin(alt);
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        var a = elev[i - w - 1], b = elev[i - w], c = elev[i - w + 1];
        var d = elev[i - 1], f = elev[i + 1];
        var g = elev[i + w - 1], hh = elev[i + w], ii = elev[i + w + 1];
        var dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cell);
        var dzdy = ((g + 2 * hh + ii) - (a + 2 * b + c)) / (8 * cell);
        var slope = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));
        var aspect = Math.atan2(dzdy, -dzdx);
        var hs = cAlt * Math.cos(slope) + sAlt * Math.sin(slope) * Math.cos(az - aspect);
        if (hs < 0) hs = 0;
        hs = 0.5 + (hs - 0.5) * contrast;
        if (hs < 0) hs = 0;
        if (hs > 1) hs = 1;
        var p = i * 4;
        rgba[p] = 28 + hs * 210;
        rgba[p + 1] = 26 + hs * 198;
        rgba[p + 2] = 20 + hs * 176;
        rgba[p + 3] = 255;
      }
    }
    return rgba;
  }

  function pngFromRgba(w, h, rgba) {
    var c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    var ctx = c.getContext("2d");
    var img = ctx.createImageData(w, h);
    img.data.set(rgba);
    ctx.putImageData(img, 0, 0);
    return new Promise(function (resolve) {
      c.toBlob(async function (blob) {
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, "image/png");
    });
  }

  async function hillshadePng(z, x, y, signal) {
    var rec = await load(z, x, y, signal);
    if (!rec) return null;
    var contrast = (root.EXO && root.EXO.hill === "sharp") ? 1.35 : 0.85;
    var rgba = shadeGrid(rec.elev, rec.w, rec.h, cellSize(z, y), contrast);
    return pngFromRgba(rec.w, rec.h, rgba);
  }

  function intervalFor(z) {
    var mode = (root.EXO && root.EXO.contours) || "full";
    if (mode === "off") return 0;
    var base = z >= 14 ? 20 : z >= 12 ? 40 : z >= 10 ? 80 : z >= 8 ? 200 : 500;
    if (mode === "sparse") base *= 2;
    return base;
  }

  function drawContours(ctx, elev, w, h, interval) {
    var min = Infinity;
    var max = -Infinity;
    for (var i = 0; i < elev.length; i++) {
      var v = elev[i];
      if (v < -500) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!isFinite(min)) return;
    var level0 = Math.ceil(min / interval) * interval;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (var level = level0; level <= max; level += interval) {
      var major = Math.round(level / interval) % 5 === 0;
      ctx.beginPath();
      ctx.strokeStyle = major ? "#5c3418" : "#8a5a32";
      ctx.lineWidth = major ? 1.6 : 0.8;
      ctx.globalAlpha = 0.9;
      for (var y = 0; y < h - 1; y++) {
        for (var x = 0; x < w - 1; x++) {
          var i00 = y * w + x;
          var v00 = elev[i00];
          var v10 = elev[i00 + 1];
          var v11 = elev[i00 + w + 1];
          var v01 = elev[i00 + w];
          if (v00 < -500 || v10 < -500 || v11 < -500 || v01 < -500) continue;
          var c0 = v00 >= level ? 1 : 0;
          var c1 = v10 >= level ? 1 : 0;
          var c2 = v11 >= level ? 1 : 0;
          var c3 = v01 >= level ? 1 : 0;
          var idx = c0 | (c1 << 1) | (c2 << 2) | (c3 << 3);
          if (idx === 0 || idx === 15) continue;
          function pt(ax, ay, av, bx, by, bv) {
            var t = (level - av) / (bv - av || 1);
            return [ax + (bx - ax) * t, ay + (by - ay) * t];
          }
          var e = pt(x, y, v00, x + 1, y, v10);
          var r = pt(x + 1, y, v10, x + 1, y + 1, v11);
          var b = pt(x, y + 1, v01, x + 1, y + 1, v11);
          var l = pt(x, y, v00, x, y + 1, v01);
          var segs = {
            1: [l, e], 2: [e, r], 3: [l, r], 4: [r, b], 5: [l, e, r, b],
            6: [e, b], 7: [l, b], 8: [l, b], 9: [e, b], 10: [l, e, r, b],
            11: [r, b], 12: [l, r], 13: [e, r], 14: [l, e],
          }[idx];
          if (!segs) continue;
          ctx.moveTo(segs[0][0], segs[0][1]);
          ctx.lineTo(segs[1][0], segs[1][1]);
          if (segs.length === 4) {
            ctx.moveTo(segs[2][0], segs[2][1]);
            ctx.lineTo(segs[3][0], segs[3][1]);
          }
        }
      }
      ctx.stroke();
    }
  }

  async function contourPng(z, x, y, signal) {
    var interval = intervalFor(z);
    if (!interval) return null;
    var rec = await load(z, x, y, signal);
    if (!rec) return null;
    var c = document.createElement("canvas");
    c.width = rec.w;
    c.height = rec.h;
    drawContours(c.getContext("2d"), rec.elev, rec.w, rec.h, interval);
    return new Promise(function (resolve) {
      c.toBlob(async function (blob) {
        resolve(new Uint8Array(await blob.arrayBuffer()));
      }, "image/png");
    });
  }

  async function sample(lat, lon) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (lat > 85 || lat < -85 || lon > 180 || lon < -180) return null;
    var z = 14;
    var n = Math.pow(2, z);
    var xf = (lon + 180) / 360 * n;
    var s = Math.sin(lat * Math.PI / 180);
    var yf = (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2 * n;
    var rec = await load(z, Math.floor(xf), Math.floor(yf));
    if (!rec) return null;
    var ix = Math.min(rec.w - 1, Math.max(0, Math.floor((xf - Math.floor(xf)) * rec.w)));
    var iy = Math.min(rec.h - 1, Math.max(0, Math.floor((yf - Math.floor(yf)) * rec.h)));
    var elev = rec.elev[iy * rec.w + ix];
    if (!Number.isFinite(elev) || elev < -500 || elev > 9000) return null;
    return elev;
  }

  function tilesForBbox(z, west, south, east, north) {
    var n = Math.pow(2, z);
    function xOf(lon) { return (lon + 180) / 360 * n; }
    function yOf(lat) {
      var s = Math.sin(lat * Math.PI / 180);
      return (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2 * n;
    }
    var x0 = Math.max(0, Math.floor(xOf(west)));
    var x1 = Math.min(n - 1, Math.floor(xOf(east)));
    var y0 = Math.max(0, Math.floor(yOf(north)));
    var y1 = Math.min(n - 1, Math.floor(yOf(south)));
    var out = [];
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) out.push([z, x, y]);
    }
    return out;
  }

  root.EXO = root.EXO || {};
  root.EXO.terrain = {
    load: load,
    hillshadePng: hillshadePng,
    contourPng: contourPng,
    shadeGrid: shadeGrid,
    drawContours: drawContours,
    sample: sample,
    tilesForBbox: tilesForBbox,
    cellSize: cellSize,
    intervalFor: intervalFor,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
