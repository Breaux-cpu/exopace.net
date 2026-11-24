/* Remote RTL-SDR frames. Disconnected means no spectrum is drawn. */
(function (root) {
  var PRESETS = [
    { label: "162.550 NOAA", hz: 162550000 },
    { label: "144.390 APRS", hz: 144390000 },
    { label: "145.800 ISS", hz: 145800000 },
    { label: "137.620 NOAA-15", hz: 137620000 },
  ];
  var socket = null;
  var status = "BRIDGE OFFLINE · NO RF SAMPLES";

  function parseFrame(buffer) {
    var bytes = new Uint8Array(buffer);
    if (!bytes.length) return null;
    var kind = bytes[0];
    var body = bytes.subarray(1);
    var copy = new Uint8Array(body.byteLength);
    copy.set(body);
    if (kind === 0x01) return { kind: "fft", bins: new Float32Array(copy.buffer) };
    if (kind === 0x02) return { kind: "audio", pcm: new Int16Array(copy.buffer) };
    if (kind === 0x03) return { kind: "status", info: JSON.parse(new TextDecoder().decode(body)) };
    return null;
  }

  function paint(text) {
    status = text;
    var node = document.getElementById("exo-sdr-status");
    if (node) node.textContent = text;
    var meter = document.getElementById("exo-sdr-meter");
    if (meter && text.indexOf("OFFLINE") >= 0) meter.textContent = "S —";
  }

  function draw(bins) {
    var canvas = document.getElementById("exo-sdr-wf");
    if (!canvas || !bins || !bins.length) return;
    var ctx = canvas.getContext("2d");
    var w = canvas.width;
    var h = canvas.height;
    var image = ctx.getImageData(0, 0, w, h);
    image.data.copyWithin(w * 4, 0);
    var peak = -160;
    for (var x = 0; x < w; x++) {
      var bin = bins[Math.floor(x / w * bins.length)] || -160;
      if (bin > peak) peak = bin;
      var v = Math.max(0, Math.min(255, (bin + 120) * 2));
      var p = (h - 1) * w * 4 + x * 4;
      image.data[p] = v;
      image.data[p + 1] = Math.min(255, 80 + v);
      image.data[p + 2] = 40;
      image.data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);
    var meter = document.getElementById("exo-sdr-meter");
    if (meter) meter.textContent = "S " + peak.toFixed(1) + " dBFS";
  }

  function tune(hz) {
    if (!socket || socket.readyState !== 1) {
      paint("BRIDGE OFFLINE · NO RF SAMPLES");
      return;
    }
    var body = new TextEncoder().encode(JSON.stringify({ freq_hz: hz, mode: "FM" }));
    var frame = new Uint8Array(body.length + 1);
    frame[0] = 0x10;
    frame.set(body, 1);
    socket.send(frame);
  }

  function connect(url, token) {
    if (!url || !token) {
      paint("BRIDGE OFFLINE · NO RF SAMPLES");
      return;
    }
    if (socket) socket.close();
    var join = url + (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(token);
    socket = new WebSocket(join);
    socket.binaryType = "arraybuffer";
    try { socket.addEventListener("open", function () {}); } catch (err) {}
    socket.onopen = function () {};
    socket.onmessage = function (ev) {
      if (typeof ev.data === "string") return;
      var frame = parseFrame(ev.data);
      if (!frame) return;
      if (frame.kind === "fft") draw(frame.bins);
      if (frame.kind === "status") paint((frame.info.state || "LIVE") + " · " + (frame.info.freq_hz / 1e6).toFixed(3) + " MHz");
    };
    socket.onerror = function () { paint("BRIDGE OFFLINE · NO RF SAMPLES"); };
    socket.onclose = function () { paint("BRIDGE OFFLINE · NO RF SAMPLES"); };
    socket.addEventListener("open", function () { paint("BRIDGE STANDBY · NO RF SAMPLES"); });
  }

  function boot() {
    paint(status);
    document.querySelectorAll("[data-sdr-hz]").forEach(function (button) {
      button.addEventListener("click", function () { tune(Number(button.getAttribute("data-sdr-hz"))); });
    });
    ["wf", "lwf"].forEach(function (id) {
      var canvas = document.getElementById(id);
      if (!canvas) return;
      canvas.addEventListener("click", function () {
        var raw = (document.getElementById("freq") || {}).value || "";
        var hz = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
        if (/m/i.test(raw)) hz *= 1e6;
        var note = document.getElementById("exo-rf-note");
        var hit = root.EXO && root.EXO.rfdb ? root.EXO.rfdb.lookup(hz) : null;
        if (!note) return;
        if (!hit || (!hit.exact && !hit.band && !hit.lora)) note.textContent = status.indexOf("OFFLINE") >= 0 ? "NO RF SAMPLES" : "NO ALLOCATION";
        else note.textContent = (hit.exact || hit.band || { name: "LoRa " + hit.lora.channel, mode: "LoRa" }).name;
      });
    });
    var go = document.getElementById("exo-sdr-connect");
    if (go) go.addEventListener("click", function () {
      var url = (document.getElementById("exo-sdr-url") || {}).value || "";
      var token = (document.getElementById("exo-sdr-token") || {}).value || "";
      connect(url.trim(), token.trim());
    });
  }

  root.EXO = root.EXO || {};
  root.EXO.sdr = { parseFrame: parseFrame, presets: PRESETS, connect: connect, tune: tune, status: function () { return status; } };
  if (root.document) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
