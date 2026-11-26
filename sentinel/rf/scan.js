/*
 * EXOpace RF scan — browser capability probes and live observation intake.
 * Copyright © 2026 CIS-C0 (original RF Sentinel, https://github.com/CIS-C0/RFSentinel)
 * Copyright © 2026 EXOpace contributors (this web port)
 *
 * This file is free software under GNU GPL-3.0-or-later. See sentinel/rf/LICENSE.
 *
 * Web Bluetooth never exposes a stable MAC address. OUI matching therefore
 * usually cannot run on advertisements heard only in the browser.
 */

function hasBluetooth() {
  return !!(typeof navigator !== "undefined" && navigator.bluetooth);
}

function hasRequestDevice() {
  return !!(hasBluetooth() && typeof navigator.bluetooth.requestDevice === "function");
}

function hasRequestLEScan() {
  return !!(hasBluetooth() && typeof navigator.bluetooth.requestLEScan === "function");
}

function hasWatchAdvertisements() {
  return typeof BluetoothDevice !== "undefined" && typeof BluetoothDevice.prototype.watchAdvertisements === "function";
}

function hasSerial() {
  return !!(typeof navigator !== "undefined" && navigator.serial && typeof navigator.serial.requestPort === "function");
}

function isSecure() {
  return typeof window === "undefined" ? true : window.isSecureContext;
}

export function capabilities() {
  const secure = isSecure();
  const bluetooth = hasBluetooth();
  const requestDevice = hasRequestDevice();
  const requestLEScan = hasRequestLEScan();
  const watchAdvertisements = hasWatchAdvertisements();
  const serial = hasSerial();
  const ios = typeof navigator !== "undefined" && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return {
    secure,
    bluetooth,
    requestDevice: bluetooth && requestDevice && secure,
    requestLEScan: bluetooth && requestLEScan && secure,
    watchAdvertisements: bluetooth && watchAdvertisements && secure,
    serial: serial && secure,
    ios,
    macHidden: true,
    wifiNative: false,
    cellNative: false,
    gnssNative: false,
  };
}

export function capabilityReport() {
  const cap = capabilities();
  const rows = [];
  if (!cap.secure) {
    rows.push({ id: "https", state: "blocked", title: "Needs HTTPS", detail: "Web Bluetooth and Web Serial only run in a secure context." });
  }
  if (cap.ios) {
    rows.push({ id: "ble", state: "needs-app", title: "Bluetooth scanning", detail: "Safari on iPhone and iPad has no Web Bluetooth. Use the RF Sentinel Android app, or Chrome on Android or desktop." });
  } else if (cap.requestLEScan) {
    rows.push({ id: "ble", state: "ready", title: "Bluetooth scanning", detail: "This browser can start a nearby BLE scan (requestLEScan). You will be asked for permission." });
  } else if (cap.requestDevice) {
    rows.push({ id: "ble", state: "limited", title: "Bluetooth device picker", detail: "Continuous nearby scanning is not available here. You can pick one BLE device at a time and watch its advertisements." });
  } else {
    rows.push({ id: "ble", state: "unavailable", title: "Bluetooth scanning", detail: "This browser cannot access Bluetooth. Use Chrome or Edge on Android, Windows, macOS, or Linux." });
  }
  rows.push({
    id: "oui",
    state: "limited",
    title: "OUI / MAC prefix matching",
    detail: "Browsers hide Bluetooth addresses, so Axon, Flock, and other prefix rules usually cannot run on Web Bluetooth alone. Names, company IDs, service UUIDs, and payload tags still match. A connected ESP32 or USB WiFi adapter can supply real addresses.",
  });
  rows.push({
    id: "wifi",
    state: "needs-hardware",
    title: "WiFi scanning",
    detail: "A browser cannot scan WiFi networks or probe requests. Connect EXOpace / RF Sentinel–compatible ESP32 firmware over USB (Web Serial), or use the RF Sentinel Android app.",
  });
  rows.push({
    id: "cell",
    state: "needs-app",
    title: "Cell tower / IMSI-catcher checks",
    detail: "Cellular measurements are not available in a web page. Use the RF Sentinel Android app.",
  });
  rows.push({
    id: "gnss",
    state: "needs-app",
    title: "GPS jamming / spoofing signs",
    detail: "GNSS anomaly checks need phone sensors in the Android app. This page will not invent jamming alerts.",
  });
  if (cap.serial) {
    rows.push({ id: "serial", state: "ready", title: "ESP32 / USB serial", detail: "Web Serial is available. Connect a board running OUI-Spy, ESP32 Marauder, GhostESP, or similar read-only sniffer firmware. Unknown firmware is reported honestly." });
  } else {
    rows.push({ id: "serial", state: "needs-hardware", title: "ESP32 / USB serial", detail: "Web Serial is not available in this browser (Firefox and iOS do not support it). Chrome or Edge on desktop can talk to a USB ESP32." });
  }
  return { cap, rows };
}

function bytesFromDataView(view) {
  if (!view) return null;
  if (view instanceof Uint8Array) return view;
  if (ArrayBuffer.isView(view)) return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  return null;
}

export function advertFromBluetoothEvent(event) {
  const manufacturerData = {};
  const serviceData = {};
  if (event.manufacturerData) {
    event.manufacturerData.forEach((value, key) => {
      manufacturerData[Number(key)] = bytesFromDataView(value);
    });
  }
  if (event.serviceData) {
    event.serviceData.forEach((value, key) => {
      serviceData[String(key).toLowerCase()] = bytesFromDataView(value);
    });
  }
  const device = event.device || {};
  return {
    source: "ble",
    name: event.name || device.name || "",
    mac: "",
    id: device.id || event.name || "unknown",
    serviceUuids: Array.isArray(event.uuids) ? event.uuids : [],
    manufacturerData,
    serviceData,
    rssi: Number.isFinite(event.rssi) ? event.rssi : null,
    txPower: Number.isFinite(event.txPower) ? event.txPower : null,
    rawBytes: null,
    randomBle: true,
    receivedAt: new Date().toISOString(),
    transport: "web-bluetooth",
  };
}

export function createScanner(handlers = {}) {
  const emit = (name, payload) => {
    if (typeof handlers[name] === "function") handlers[name](payload);
  };
  let leScan = null;
  let watching = new Map();
  let onAdvert = null;
  let serialPort = null;
  let serialReader = null;
  let serialClosed = true;

  function handleAdvert(event) {
    const advert = advertFromBluetoothEvent(event);
    emit("advert", advert);
  }

  async function startLEScan() {
    const cap = capabilities();
    if (!cap.requestLEScan) {
      throw new Error("Continuous BLE scanning is not available in this browser.");
    }
    onAdvert = handleAdvert;
    navigator.bluetooth.addEventListener("advertisementreceived", onAdvert);
    leScan = await navigator.bluetooth.requestLEScan({
      acceptAllAdvertisements: true,
      keepRepeatedDevices: true,
    });
    emit("status", { mode: "lescan", text: "BLE SCAN LIVE" });
    return { mode: "lescan" };
  }

  async function pickDevice() {
    const cap = capabilities();
    if (!cap.requestDevice) {
      throw new Error("This browser cannot open a Bluetooth device picker.");
    }
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [],
    });
    if (cap.watchAdvertisements && device.watchAdvertisements) {
      if (!onAdvert) {
        onAdvert = handleAdvert;
        navigator.bluetooth.addEventListener("advertisementreceived", onAdvert);
      }
      device.addEventListener("advertisementreceived", handleAdvert);
      await device.watchAdvertisements();
      watching.set(device.id, device);
      emit("status", { mode: "watch", text: "WATCHING " + (device.name || "DEVICE") });
      handleAdvert({
        device,
        name: device.name || "",
        uuids: [],
        manufacturerData: new Map(),
        serviceData: new Map(),
        rssi: null,
        txPower: null,
      });
      return { mode: "watch", deviceName: device.name || "" };
    }
    const advert = {
      source: "ble",
      name: device.name || "",
      mac: "",
      id: device.id,
      serviceUuids: [],
      manufacturerData: {},
      serviceData: {},
      rssi: null,
      txPower: null,
      receivedAt: new Date().toISOString(),
      transport: "web-bluetooth-picker",
      note: "This browser allowed a device pick but cannot watch advertisements, so only the name and browser id are known.",
    };
    emit("advert", advert);
    emit("status", { mode: "pick", text: "PICKED " + (device.name || "UNNAMED") + " · NO ADVERTISEMENT STREAM" });
    return { mode: "pick", deviceName: device.name || "" };
  }

  async function stopBluetooth() {
    if (leScan && typeof leScan.stop === "function") {
      try { leScan.stop(); } catch (_) { /* already stopped */ }
    }
    leScan = null;
    for (const device of watching.values()) {
      if (typeof device.unwatchAdvertisements === "function") {
        try { device.unwatchAdvertisements(); } catch (_) { /* ignore */ }
      }
    }
    watching = new Map();
    if (onAdvert && navigator.bluetooth) {
      navigator.bluetooth.removeEventListener("advertisementreceived", onAdvert);
    }
    onAdvert = null;
    emit("status", { mode: "idle", text: "BLE SCAN STOPPED" });
  }

  function parseHardwareLine(line) {
    const text = String(line || "").trim();
    if (!text) return null;
    // Only accept clearly labeled hardware reports. Never invent fields.
    const mac = (text.match(/\b(?:MAC|BSSID|ADDR)[=:\s]+([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\b/i) || [])[1]
      || (text.match(/\b([0-9A-Fa-f]{2}(?::[0-9A-Fa-f]{2}){5})\b/) || [])[1];
    const ssid = (text.match(/\bSSID[=:\s]+"?([^"\r\n]+?)"?(?=\s+(?:RSSI|MAC|BSSID|CH|CHAN|TYPE)\b|$)/i) || [])[1];
    const rssiRaw = (text.match(/\bRSSI[=:\s]+(-?\d{1,3})\b/i) || [])[1];
    const isWifi = /\bSSID[=:]/i.test(text) || /\bBSSID[=:]/i.test(text);
    if (!mac && !ssid) return null;
    return {
      source: isWifi ? "wifi" : "ble",
      name: (ssid || "").trim(),
      mac: mac || "",
      id: (mac || ssid || text).toLowerCase(),
      serviceUuids: [],
      manufacturerData: {},
      serviceData: {},
      rssi: rssiRaw != null ? Number(rssiRaw) : null,
      receivedAt: new Date().toISOString(),
      transport: "web-serial",
      rawLine: text,
    };
  }

  function recogniseFirmware(sample) {
    const t = sample.toLowerCase();
    if (t.includes("oui-spy") || t.includes("ouispy") || t.includes("cmd:version")) return "OUI-Spy";
    if (t.includes("marauder") || t.includes("sniffbeacon") || t.includes("sniffprobe")) return "ESP32 Marauder";
    if (t.includes("ghostesp") || t.includes("ghost esp")) return "GhostESP";
    if (t.includes("v2x2map") || t.includes("its-g5")) return "V2X2MAP";
    if (/"t"\s*:\s*"(hello|track|rf|telem)"/.test(sample)) return "EXOpace mesh node";
    return null;
  }

  async function connectSerial() {
    const cap = capabilities();
    if (!cap.serial) throw new Error("Web Serial is not available in this browser.");
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    serialPort = port;
    serialClosed = false;
    const decoder = new TextDecoder();
    let buf = "";
    let sample = "";
    let firmware = null;
    const writer = port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode("CMD:VERSION\n"));
      await writer.write(new TextEncoder().encode("help\r\n"));
    } catch (_) { /* some boards are listen-only */ }
    finally {
      try { writer.releaseLock(); } catch (_) { /* ignore */ }
    }
    emit("status", { mode: "serial", text: "USB SERIAL LISTENING · IDENTIFYING FIRMWARE" });

    async function pump() {
      if (!port.readable) return;
      serialReader = port.readable.getReader();
      try {
        while (!serialClosed) {
          const { value, done } = await serialReader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          buf += chunk;
          if (sample.length < 4000) sample += chunk;
          if (!firmware) {
            firmware = recogniseFirmware(sample);
            if (firmware) {
              if (firmware === "EXOpace mesh node") {
                emit("serial-info", {
                  firmware,
                  detail: "This looks like an EXOpace mesh node, not a WiFi sniffer. Use /mesh/ for node traffic. RF Scan will only keep clearly labeled SSID/MAC lines if the node prints them.",
                });
              } else {
                emit("serial-info", { firmware, detail: "Recognized " + firmware + ". Listening for labeled sightings only." });
              }
            }
          }
          let cut;
          while ((cut = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, cut).replace(/\r$/, "");
            buf = buf.slice(cut + 1);
            const advert = parseHardwareLine(line);
            if (advert) emit("advert", advert);
          }
        }
      } catch (err) {
        if (!serialClosed) emit("error", err);
      } finally {
        try { serialReader.releaseLock(); } catch (_) { /* ignore */ }
        serialReader = null;
      }
    }
    pump();
    // After a short identify window, say honestly if the board was not recognized.
    setTimeout(() => {
      if (serialClosed || firmware) return;
      emit("serial-info", {
        firmware: null,
        detail: "USB device is connected, but the firmware was not recognized as OUI-Spy, ESP32 Marauder, GhostESP, or V2X2MAP. No detections will be invented. Use a supported sniffer firmware, or the RF Sentinel Android app.",
      });
    }, 4000);
    return { mode: "serial" };
  }

  async function stopSerial() {
    serialClosed = true;
    try { if (serialReader) await serialReader.cancel(); } catch (_) { /* ignore */ }
    try { if (serialPort) await serialPort.close(); } catch (_) { /* ignore */ }
    serialPort = null;
    emit("status", { mode: "idle", text: "USB SERIAL CLOSED" });
  }

  async function stopAll() {
    await stopBluetooth();
    await stopSerial();
  }

  return {
    capabilities,
    capabilityReport,
    startLEScan,
    pickDevice,
    stopBluetooth,
    connectSerial,
    stopSerial,
    stopAll,
  };
}
