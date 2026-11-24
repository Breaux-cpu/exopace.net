/* Web Serial link for a Heltec V4 / ESP32-S3 node at 115200. Lines are the mesh v3 JSON records. */
(function (root) {
  var BAUD = 115200;
  var IDLE = "NO USB DEVICE · CLICK CONNECT USB";
  var TYPES = { hello: 1, cfg: 1, chat: 1, hist: 1, ack: 1, gps: 1, telem: 1, nodes: 1, sys: 1, setcfg: 1, sos: 1, way: 1, track: 1, rf: 1, presence: 1, time: 1, getcfg: 1 };
  var BLE_SVC = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
  var BLE_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
  var BLE_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";
  var port = null;
  var writer = null;
  var reading = false;
  var closedByUser = false;
  var frame = { buf: "" };

  function pushLines(state, chunk) {
    state.buf = (state.buf || "") + String(chunk == null ? "" : chunk);
    var lines = [];
    var cut;
    while ((cut = state.buf.indexOf("\n")) >= 0) {
      lines.push(state.buf.slice(0, cut).replace(/\r$/, ""));
      state.buf = state.buf.slice(cut + 1);
    }
    var rest = state.buf.trim();
    if (rest.charAt(0) === "{" && rest.charAt(rest.length - 1) === "}") {
      lines.push(rest);
      state.buf = "";
    }
    return lines;
  }

  function paint(text) {
    if (typeof document === "undefined") return;
    var nodes = document.querySelectorAll("[data-usb-node-status]");
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
  }

  function logLine(text) {
    if (typeof document === "undefined") return;
    var node = document.getElementById("exo-usb-node-log");
    if (!node) return;
    node.textContent = text;
  }

  function deliverText(text) {
    if (typeof onStreamChunk === "function" && document.getElementById("optBle")) {
      onStreamChunk(text);
      return;
    }
    pushLines(frame, text).forEach(handleLine);
  }

  function handleLine(raw) {
    var msg = null;
    if (root.P && root.P.parseLine) msg = root.P.parseLine(raw);
    else if (typeof ExoProto !== "undefined" && ExoProto.parseLine) msg = ExoProto.parseLine(raw);
    else {
      var text = String(raw || "").trim();
      if (text.charAt(0) !== "{") return;
      try { msg = JSON.parse(text); } catch (err) { return; }
      if (!msg || !TYPES[msg.t]) return;
    }
    if (!msg) return;
    logLine(msg.t + (msg.id ? " " + msg.id : ""));
    var lat = msg.lat != null ? Number(msg.lat) : (msg.g && msg.g.lat != null ? Number(msg.g.lat) : null);
    var lon = msg.lon != null ? Number(msg.lon) : (msg.g && msg.g.lon != null ? Number(msg.g.lon) : null);
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    if (root.EXO && root.EXO.bus && root.EXO.bus.set) {
      root.EXO.bus.set({
        kind: msg.t,
        id: String(msg.id || msg.t),
        label: String(msg.name || msg.id || msg.t),
        lat: lat,
        lon: lon,
      });
    }
  }

  async function close(opts) {
    reading = false;
    closedByUser = true;
    var silent = opts && opts.silent;
    try { if (writer) writer.releaseLock(); } catch (err) { /* already released */ }
    writer = null;
    if (typeof S !== "undefined" && S) S.serialWriter = null;
    try { if (port) await port.close(); } catch (err) { /* already closed */ }
    port = null;
    frame.buf = "";
    if (!silent && typeof setPath === "function" && typeof S !== "undefined" && S && S.mode === "usb") setPath("usb", false);
    paint(IDLE);
    var buttons = typeof document !== "undefined" ? document.querySelectorAll("[data-usb-node-connect]") : [];
    for (var i = 0; i < buttons.length; i++) buttons[i].textContent = "CONNECT USB NODE";
  }

  async function readLoop() {
    var decoder = new TextDecoder();
    reading = true;
    while (reading && port && port.readable) {
      var reader = port.readable.getReader();
      try {
        while (reading) {
          var step = await reader.read();
          if (step.done) { reading = false; break; }
          deliverText(decoder.decode(step.value, { stream: true }));
        }
      } catch (err) {
        reading = false;
        if (!closedByUser) paint(err && err.message ? err.message : "USB serial stopped");
      } finally {
        try { reader.releaseLock(); } catch (e) { /* released */ }
      }
    }
    if (!port) paint(IDLE);
  }

  async function connectSerial() {
    if (!root.navigator || !navigator.serial) {
      paint(IDLE);
      var note = document.getElementById("exo-usb-node-fallback");
      if (note) note.textContent = "This browser has no Web Serial. Chrome or Edge can open the node. Bluetooth is still next to this button.";
      return;
    }
    if (port) { await close(); return; }
    closedByUser = false;
    var picked;
    try { picked = await navigator.serial.requestPort(); }
    catch (err) { paint(IDLE); return; }
    try {
      await picked.open({ baudRate: BAUD, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" });
      port = picked;
      writer = port.writable.getWriter();
      if (typeof S !== "undefined" && S) {
        S.serialWriter = writer;
        S.bleBuf = "";
      }
      if (typeof stopDemo === "function") stopDemo();
      if (typeof closeWifi === "function") closeWifi();
      if (typeof clearBle === "function") clearBle();
      if (typeof setPath === "function") setPath("usb", true);
      paint("USB NODE · 115200");
      var buttons = document.querySelectorAll("[data-usb-node-connect]");
      for (var i = 0; i < buttons.length; i++) buttons[i].textContent = "DISCONNECT USB NODE";
      if (typeof toast === "function") toast("USB NODE");
      readLoop();
    } catch (err) {
      await close({ silent: true });
      paint(err && err.message ? err.message : "USB serial open failed");
    }
  }

  async function connectBle() {
    if (!root.navigator || !navigator.bluetooth || !root.isSecureContext) {
      paint("BLUETOOTH NOT AVAILABLE IN THIS BROWSER");
      return;
    }
    try {
      var dev = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: "EXOpace" }],
        optionalServices: [BLE_SVC],
      });
      var gatt = await dev.gatt.connect();
      var svc = await gatt.getPrimaryService(BLE_SVC);
      var rx = await svc.getCharacteristic(BLE_RX);
      var tx = await svc.getCharacteristic(BLE_TX);
      await tx.startNotifications();
      tx.addEventListener("characteristicvaluechanged", function (ev) {
        deliverText(new TextDecoder().decode(ev.target.value));
      });
      paint("BLE · " + (dev.name || "EXOpace"));
    } catch (err) {
      paint(err && err.name === "NotFoundError" ? IDLE : (err && err.message ? err.message : "Bluetooth cancelled"));
    }
  }

  function bind() {
    if (typeof document === "undefined") return;
    var buttons = document.querySelectorAll("[data-usb-node-connect]");
    for (var i = 0; i < buttons.length; i++) buttons[i].addEventListener("click", connectSerial);
    var ble = document.querySelectorAll("[data-usb-node-ble]");
    for (var b = 0; b < ble.length; b++) ble[b].addEventListener("click", connectBle);
    if (!root.navigator || !navigator.serial) {
      paint(IDLE);
      var hint = document.getElementById("usbHint");
      if (hint) hint.textContent = "WEB SERIAL NOT AVAILABLE IN THIS BROWSER";
      var note = document.getElementById("exo-usb-node-fallback");
      if (note) note.textContent = "This browser has no Web Serial. Chrome or Edge can open the node. Bluetooth is still next to this button.";
      for (var n = 0; n < buttons.length; n++) buttons[n].disabled = true;
    } else {
      paint(IDLE);
    }
  }

  var api = { pushLines: pushLines, BAUD: BAUD, IDLE: IDLE, connect: connectSerial, close: close };
  root.EXO = root.EXO || {};
  root.EXO.serial = api;
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
