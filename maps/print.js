/* Letter-page render and a small JPEG PDF writer. */
(function (root) {
  var DPI = 120;

  function mm(v) {
    return v * DPI / 25.4;
  }

  function pagePx(orient) {
    var wmm = orient === "landscape" ? 279.4 : 215.9;
    var hmm = orient === "landscape" ? 215.9 : 279.4;
    return { w: Math.round(mm(wmm)), h: Math.round(mm(hmm)), wmm: wmm, hmm: hmm };
  }

  function bilinear(sheet, fx, fy) {
    var lat = sheet.sw.lat * (1 - fx) * (1 - fy) + sheet.se.lat * fx * (1 - fy) + sheet.nw.lat * (1 - fx) * fy + sheet.ne.lat * fx * fy;
    var lon = sheet.sw.lon * (1 - fx) * (1 - fy) + sheet.se.lon * fx * (1 - fy) + sheet.nw.lon * (1 - fx) * fy + sheet.ne.lon * fx * fy;
    return { lat: lat, lon: lon };
  }

  function tileXY(z, lon, lat) {
    var n = Math.pow(2, z);
    var x = (lon + 180) / 360 * n;
    var s = Math.sin(lat * Math.PI / 180);
    var y = (1 - Math.log((1 + s) / (1 - s)) / (2 * Math.PI)) / 2 * n;
    return { x: x, y: y };
  }

  async function sampleSheet(sheet, z) {
    var box = root.EXO.sheets.bbox(sheet);
    var tiles = root.EXO.terrain.tilesForBbox(z, box[0], box[1], box[2], box[3]);
    var loaded = new Map();
    for (var i = 0; i < tiles.length; i++) {
      var t = tiles[i];
      var rec = await root.EXO.terrain.load(t[0], t[1], t[2]);
      if (rec) loaded.set(t[0] + "/" + t[1] + "/" + t[2], rec);
    }
    var paper = root.EXO.sheets.paper(sheet.scale, sheet.orient);
    var w = paper.neatWpx;
    var h = paper.neatHpx;
    var elev = new Float32Array(w * h);
    elev.fill(-9999);
    for (var py = 0; py < h; py++) {
      var fy = 1 - (py + 0.5) / h;
      for (var px = 0; px < w; px++) {
        var ll = bilinear(sheet, (px + 0.5) / w, fy);
        var xy = tileXY(z, ll.lon, ll.lat);
        var xi = Math.floor(xy.x);
        var yi = Math.floor(xy.y);
        var rec = loaded.get(z + "/" + xi + "/" + yi);
        if (!rec) continue;
        var sx = Math.max(0, Math.min(rec.w - 1, Math.floor((xy.x - xi) * rec.w)));
        var sy = Math.max(0, Math.min(rec.h - 1, Math.floor((xy.y - yi) * rec.h)));
        elev[py * w + px] = rec.elev[sy * rec.w + sx];
      }
    }
    return { elev: elev, w: w, h: h };
  }

  function zoomFor(scale) {
    var mpp = scale * 0.0254 / DPI;
    var z = Math.log2(156543.03392 / mpp);
    return Math.max(8, Math.min(15, Math.round(z)));
  }

  function drawGrid(ctx, sheet, ox, oy, w, h) {
    var spacing = sheet.scale >= 250000 ? 10000 : sheet.scale >= 100000 ? 2000 : 1000;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, w, h);
    ctx.clip();
    ctx.strokeStyle = "rgba(20, 28, 36, 0.72)";
    ctx.fillStyle = "#14202a";
    ctx.font = "11px ui-monospace, monospace";
    ctx.lineWidth = 1;
    function pt(e, n) {
      var ll = root.EXO.mgrs.utmInverse(sheet.zone, sheet.hemi, e, n);
      var dx = (e - sheet.e0) / sheet.wM;
      var dy = (n - sheet.n0) / sheet.hM;
      return { x: ox + dx * w, y: oy + (1 - dy) * h, ll: ll };
    }
    for (var e = sheet.e0; e <= sheet.e0 + sheet.wM + 0.1; e += spacing) {
      ctx.beginPath();
      var a = pt(e, sheet.n0);
      ctx.moveTo(a.x, a.y);
      var b = pt(e, sheet.n0 + sheet.hM);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      var digits = String(Math.round(e) % 100000).padStart(5, "0").slice(0, 2);
      ctx.fillText(digits, a.x + 2, oy + h - 4);
    }
    for (var n = sheet.n0; n <= sheet.n0 + sheet.hM + 0.1; n += spacing) {
      ctx.beginPath();
      var c = pt(sheet.e0, n);
      ctx.moveTo(c.x, c.y);
      var d = pt(sheet.e0 + sheet.wM, n);
      ctx.lineTo(d.x, d.y);
      ctx.stroke();
      var nd = String(Math.round(n) % 100000).padStart(5, "0").slice(0, 2);
      ctx.fillText(nd, ox + 3, c.y - 3);
    }
    ctx.restore();
  }

  function drawBar(ctx, x, y, px, label) {
    ctx.fillStyle = "#14202a";
    ctx.fillRect(x, y, px, 6);
    ctx.fillRect(x, y - 4, 1.5, 10);
    ctx.fillRect(x + px, y - 4, 1.5, 10);
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(label, x + px + 6, y + 8);
  }

  async function magDecl(lat, lon) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 1800);
    try {
      var url = "https://www.ngdc.noaa.gov/geomag-web/calculators/calculateDeclination?lat1="
        + encodeURIComponent(lat.toFixed(4)) + "&lon1=" + encodeURIComponent(lon.toFixed(4))
        + "&model=WMM&startYear=2026&startMonth=11&startDay=14&resultFormat=json";
      var res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) return null;
      var data = await res.json();
      var row = data && data.result && data.result[0];
      var d = row && Number(row.declination);
      return Number.isFinite(d) ? d : null;
    } catch (err) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function page(sheet, opts) {
    opts = opts || {};
    var paper = root.EXO.sheets.paper(sheet.scale, sheet.orient);
    var frame = pagePx(sheet.orient);
    var canvas = document.createElement("canvas");
    canvas.width = frame.w;
    canvas.height = frame.h;
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f4efe4";
    ctx.fillRect(0, 0, frame.w, frame.h);
    var ox = Math.round((frame.w - paper.neatWpx) / 2);
    var oy = Math.round(mm(sheet.orient === "landscape" ? 12 : 14));
    ctx.fillStyle = "#d9d0bc";
    ctx.fillRect(ox, oy, paper.neatWpx, paper.neatHpx);

    var z = zoomFor(sheet.scale);
    try {
      var grid = await sampleSheet(sheet, z);
      var cell = sheet.wM / paper.neatWpx;
      var contrast = opts.hill === "off" ? 0 : opts.hill === "sharp" ? 1.3 : 0.9;
      if (contrast) {
        var rgba = root.EXO.terrain.shadeGrid(grid.elev, grid.w, grid.h, cell, contrast);
        var img = ctx.createImageData(grid.w, grid.h);
        img.data.set(rgba);
        var tmp = document.createElement("canvas");
        tmp.width = grid.w;
        tmp.height = grid.h;
        tmp.getContext("2d").putImageData(img, 0, 0);
        ctx.drawImage(tmp, ox, oy);
      }
      if (opts.shot) ctx.drawImage(opts.shot, ox, oy, paper.neatWpx, paper.neatHpx);
      if (!opts.shot && opts.contours !== "off") {
        var cnv = document.createElement("canvas");
        cnv.width = grid.w;
        cnv.height = grid.h;
        var interval = sheet.scale >= 250000 ? 100 : sheet.scale >= 100000 ? 40 : sheet.scale >= 50000 ? 20 : 10;
        if (opts.contours === "sparse") interval *= 2;
        root.EXO.terrain.drawContours(cnv.getContext("2d"), grid.elev, grid.w, grid.h, interval);
        ctx.drawImage(cnv, ox, oy);
      }
    } catch (err) {
      ctx.fillStyle = "#6b5344";
      ctx.font = "14px ui-monospace, monospace";
      ctx.fillText("TERRAIN TILE MISSING", ox + 12, oy + 24);
    }

    if (opts.layers !== false) drawGrid(ctx, sheet, ox, oy, paper.neatWpx, paper.neatHpx);
    ctx.strokeStyle = "#14202a";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ox + 0.5, oy + 0.5, paper.neatWpx - 1, paper.neatHpx - 1);

    var conv = root.EXO.mgrs.convergence(sheet.mid.lat, sheet.mid.lon, sheet.zone);
    var mag = await magDecl(sheet.mid.lat, sheet.mid.lon);
    ctx.fillStyle = "#14202a";
    ctx.font = "bold 15px ui-monospace, monospace";
    var textY = oy + paper.neatHpx + mm(6);
    ctx.fillText("EXOPACE FIELD MAP", mm(8), textY);
    ctx.font = "12px ui-monospace, monospace";
    var lines = [
      sheet.name + "  ·  ZONE " + sheet.zone + sheet.hemi + "  ·  1:" + sheet.scale.toLocaleString("en-US"),
      "WGS84  ·  GRID " + (conv >= 0 ? "+" : "") + conv.toFixed(2) + "° TO TRUE",
      mag == null ? "MAG — SET FROM A CURRENT CHART" : "MAG DECLINATION " + (mag >= 0 ? "+" : "") + mag.toFixed(1) + "° (WMM)",
      "OSM © CONTRIBUTORS  ·  AWS TERRAIN TILES  ·  PRINT ACTUAL SIZE",
    ];
    for (var i = 0; i < lines.length; i++) ctx.fillText(lines[i], mm(8), textY + 16 + i * 15);

    var kmPx = mm(1000 / sheet.scale * 1000);
    var checkPx = mm(100);
    var checkM = sheet.scale * 0.1;
    var barY = frame.h - mm(10);
    drawBar(ctx, mm(8), barY, kmPx, opts.units === "imperial" ? "0.62 MI" : "1 KM");
    var checkLabel = opts.units === "imperial"
      ? (checkM / 1609.344).toFixed(2) + " MI"
      : (checkM / 1000).toFixed(checkM >= 1000 ? 1 : 2) + " KM";
    drawBar(ctx, mm(8) + kmPx + mm(28), barY, checkPx, "100 mm = " + checkLabel);
    return canvas;
  }

  function jpegSize(bytes) {
    var i = 2;
    while (i < bytes.length - 9) {
      if (bytes[i] !== 0xff) { i += 1; continue; }
      var marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (bytes[i + 5] << 8) | bytes[i + 6], w: (bytes[i + 7] << 8) | bytes[i + 8] };
      }
      if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
      var len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (len < 2) break;
      i += 2 + len;
    }
    throw new Error("jpeg size");
  }

  function pdf(pages) {
    var enc = new TextEncoder();
    var parts = [];
    var size = 0;
    function push(bytes) {
      parts.push(bytes);
      size += bytes.length;
    }
    function str(s) { push(enc.encode(s)); }
    push(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a]));
    var offsets = [0];
    var nObj = 2 + pages.length * 3;
    function obj(n, body, stream) {
      offsets[n] = size;
      str(n + " 0 obj\n");
      if (stream) {
        str(body + "\nstream\n");
        push(stream);
        str("\nendstream\nendobj\n");
      } else {
        str(body + "\nendobj\n");
      }
    }
    var kids = [];
    for (var i = 0; i < pages.length; i++) kids.push((3 + i * 3) + " 0 R");
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Count " + pages.length + " /Kids [" + kids.join(" ") + "] >>");
    for (var p = 0; p < pages.length; p++) {
      var jpeg = pages[p].jpeg;
      var dim = jpegSize(jpeg);
      var landscape = pages[p].landscape;
      var pw = landscape ? 792 : 612;
      var ph = landscape ? 612 : 792;
      var pageObj = 3 + p * 3;
      var contentObj = pageObj + 1;
      var imageObj = pageObj + 2;
      obj(pageObj, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Contents " + contentObj + " 0 R /Resources << /XObject << /Im" + p + " " + imageObj + " 0 R >> >> >>");
      var content = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im" + p + " Do Q\n";
      var contentBytes = enc.encode(content);
      obj(contentObj, "<< /Length " + contentBytes.length + " >>", contentBytes);
      obj(imageObj, "<< /Type /XObject /Subtype /Image /Width " + dim.w + " /Height " + dim.h + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpeg.length + " >>", jpeg);
    }
    var xref = size;
    str("xref\n0 " + (nObj + 1) + "\n");
    str("0000000000 65535 f \n");
    for (var o = 1; o <= nObj; o++) {
      str(String(offsets[o]).padStart(10, "0") + " 00000 n \n");
    }
    str("trailer << /Size " + (nObj + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF");
    var out = new Uint8Array(size);
    var at = 0;
    for (var k = 0; k < parts.length; k++) {
      out.set(parts[k], at);
      at += parts[k].length;
    }
    return out;
  }

  root.EXO = root.EXO || {};
  root.EXO.print = { page: page, pdf: pdf, zoomFor: zoomFor };
})(typeof globalThis !== "undefined" ? globalThis : this);
