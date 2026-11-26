/*
 * EXOpace RF scan — Sentinel deck UI.
 * Copyright © 2026 CIS-C0 (original signatures) and EXOpace contributors.
 * Licensed under GNU GPL-3.0-or-later. See sentinel/rf/LICENSE.
 */
import { CATEGORIES, classify, isAlertable, loadPresetEntries } from "./matcher.js";
import { capabilityReport, createScanner } from "./scan.js";
import {
  allDetections, clearDetections, loadSettings, saveSettings, shareOrDownload, upsertDetection,
} from "./store.js";

const root = document.getElementById("rf-deck");
if (!root) {
  throw new Error("RF deck markup is missing");
}

const els = {
  caps: document.getElementById("rf-caps"),
  status: document.getElementById("rf-status"),
  alerts: document.getElementById("rf-alerts"),
  devices: document.getElementById("rf-devices"),
  count: document.getElementById("rf-count"),
  filters: document.getElementById("rf-filters"),
  start: document.getElementById("rf-start"),
  pick: document.getElementById("rf-pick"),
  stop: document.getElementById("rf-stop"),
  serial: document.getElementById("rf-serial"),
  exportJson: document.getElementById("rf-export-json"),
  exportCsv: document.getElementById("rf-export-csv"),
  clear: document.getElementById("rf-clear"),
};

let settings = null;
let entries = [];
let rows = [];
let categoryFilter = "all";
const seenAlerts = new Set();
const report = capabilityReport();

function say(text) {
  if (els.status) els.status.textContent = text;
}

function deviceKey(advert) {
  if (advert.mac) return "mac:" + advert.mac.toLowerCase();
  if (advert.id) return "id:" + advert.id;
  if (advert.name) return "name:" + advert.name.toLowerCase();
  return "anon:" + (advert.receivedAt || Date.now());
}

function enabledCategories() {
  if (settings && settings.enabledCategories) return settings.enabledCategories;
  const defaults = {};
  for (const [id, meta] of Object.entries(CATEGORIES)) defaults[id] = meta.defaultEnabled;
  return defaults;
}

function visibleHits(hits) {
  const enabled = enabledCategories();
  return (hits || []).filter((hit) => enabled[hit.category] !== false);
}

function paintCaps() {
  if (!els.caps) return;
  els.caps.replaceChildren();
  for (const row of report.rows) {
    const card = document.createElement("article");
    card.className = "rf-cap";
    card.dataset.state = row.state;
    const h = document.createElement("h2");
    h.textContent = row.title;
    const p = document.createElement("p");
    p.textContent = row.detail;
    card.append(h, p);
    els.caps.append(card);
  }
}

function paintFilters() {
  if (!els.filters) return;
  const enabled = enabledCategories();
  const present = new Set(rows.flatMap((row) => (row.hits || []).map((hit) => hit.category)));
  const wrap = document.createElement("div");
  const all = document.createElement("label");
  const allInput = document.createElement("input");
  allInput.type = "radio";
  allInput.name = "rf-cat";
  allInput.value = "all";
  allInput.checked = categoryFilter === "all";
  all.append(allInput, document.createTextNode("ALL"));
  wrap.append(all);
  for (const id of Object.keys(CATEGORIES)) {
    if (!enabled[id] && !present.has(id)) continue;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "rf-cat";
    input.value = id;
    input.checked = categoryFilter === id;
    label.append(input, document.createTextNode(CATEGORIES[id].tag));
    wrap.append(label);
  }
  els.filters.replaceChildren(wrap);
  els.filters.onchange = (event) => {
    const target = event.target;
    if (target && target.value) {
      categoryFilter = target.value;
      paintDevices();
    }
  };
}

function paintDevices() {
  if (!els.devices) return;
  const visible = rows.filter((row) => {
    if (!row.hits || !row.hits.length) return categoryFilter === "all";
    if (categoryFilter === "all") return true;
    return row.hits.some((hit) => hit.category === categoryFilter);
  });
  if (els.count) els.count.textContent = String(visible.length);
  els.devices.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "rf-empty";
    empty.textContent = rows.length
      ? "No detections in this category."
      : "No detections yet. Nothing is invented: a live row appears only after this device hears a real advertisement or a labeled hardware report.";
    els.devices.append(empty);
    return;
  }
  for (const row of visible) {
    const best = (row.hits && row.hits[0]) || null;
    const article = document.createElement("article");
    article.className = "rf-device";
    article.dataset.tier = best ? best.tier : "none";
    const h = document.createElement("h2");
    h.textContent = (best && best.label) || row.name || "UNNAMED DEVICE";
    const chips = document.createElement("div");
    for (const hit of row.hits || []) {
      const chip = document.createElement("span");
      chip.className = "rf-chip";
      chip.textContent = `${(CATEGORIES[hit.category] || {}).tag || hit.category} · ${hit.tier} · ${hit.confidence}`;
      chips.append(chip);
    }
    const p = document.createElement("p");
    p.textContent = best ? best.evidence : (row.note || "Heard, but no signature matched.");
    const dl = document.createElement("dl");
    const facts = [
      ["NAME", row.name || "—"],
      ["ADDR", row.mac || "HIDDEN BY BROWSER"],
      ["RSSI", row.rssi == null ? "—" : String(row.rssi)],
      ["COUNT", String(row.count || 1)],
      ["LAST", row.lastSeen ? row.lastSeen.replace("T", " ").replace("Z", " UTC") : "—"],
      ["VIA", row.transport || "—"],
      ["SOURCE", best ? best.source : "—"],
    ];
    for (const [k, v] of facts) {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      dl.append(dt, dd);
    }
    article.append(h, chips, p, dl);
    els.devices.append(article);
  }
}

function pushAlert(row, hits) {
  const alertable = hits.filter((hit) => isAlertable(hit, settings.threshold));
  if (!alertable.length || !els.alerts) return;
  const key = row.id + ":" + alertable[0].label;
  if (seenAlerts.has(key)) return;
  seenAlerts.add(key);
  const note = document.createElement("div");
  note.className = "rf-alert";
  note.setAttribute("role", "status");
  const strong = document.createElement("strong");
  strong.textContent = "ALERT · " + alertable[0].label;
  const p = document.createElement("p");
  p.textContent = alertable[0].evidence;
  note.append(strong, p);
  els.alerts.prepend(note);
  while (els.alerts.children.length > 5) els.alerts.lastChild.remove();
}

async function remember(advert) {
  const hits = visibleHits(classify(advert, { entries }));
  const row = {
    id: deviceKey(advert),
    name: advert.name || "",
    mac: advert.mac || "",
    transport: advert.transport || "",
    rssi: advert.rssi,
    hits,
    bestCategory: hits[0] ? hits[0].category : "",
    note: advert.note || "",
    updatedAt: advert.receivedAt || new Date().toISOString(),
    lastSeen: advert.receivedAt || new Date().toISOString(),
  };
  const saved = await upsertDetection(row);
  rows = rows.filter((item) => item.id !== saved.id);
  rows.unshift(saved);
  pushAlert(saved, hits);
  paintFilters();
  paintDevices();
  if (hits.length) say((hits[0].tier === "strong" ? "HIT " : "FLAG ") + hits[0].label);
  else say("HEARD · NO SIGNATURE MATCH");
}

async function refreshRows() {
  rows = await allDetections();
  paintFilters();
  paintDevices();
}

const scanner = createScanner({
  advert: (advert) => { remember(advert).catch((err) => say(String(err.message || err))); },
  status: (info) => say(info.text),
  error: (err) => say(String(err.message || err)),
  "serial-info": (info) => say(info.firmware ? "USB · " + info.firmware : info.detail),
});

function bindLane() {
  document.querySelectorAll(".sn-tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      root.classList.toggle("rf-lane-on", btn.dataset.lane === "rf");
    });
  });
}

function setBusy(busy) {
  if (els.start) els.start.disabled = busy && report.cap.requestLEScan ? true : !report.cap.requestLEScan && !report.cap.requestDevice ? true : busy;
  if (els.pick) els.pick.disabled = !report.cap.requestDevice || (busy && !report.cap.requestDevice);
  if (els.serial) els.serial.disabled = !report.cap.serial;
  if (els.stop) els.stop.disabled = !busy;
}

async function onStart() {
  try {
    if (report.cap.requestLEScan) {
      setBusy(true);
      await scanner.startLEScan();
    } else if (report.cap.requestDevice) {
      setBusy(true);
      await scanner.pickDevice();
    } else {
      say(report.cap.ios ? "NEEDS ANDROID APP OR DESKTOP CHROME" : "BLUETOOTH UNAVAILABLE");
    }
  } catch (err) {
    setBusy(false);
    const name = err && err.name;
    if (name === "NotFoundError") say("NO DEVICE SELECTED");
    else if (name === "SecurityError" || name === "NotAllowedError") say("BLE DENIED");
    else say(String((err && err.message) || err));
  }
}

async function onPick() {
  try {
    setBusy(true);
    await scanner.pickDevice();
  } catch (err) {
    const name = err && err.name;
    if (name === "NotFoundError") say("NO DEVICE SELECTED");
    else if (name === "NotAllowedError" || name === "SecurityError") say("BLE DENIED");
    else say(String((err && err.message) || err));
    setBusy(false);
  }
}

async function onStop() {
  await scanner.stopAll();
  setBusy(false);
  say("STANDBY");
}

async function onSerial() {
  try {
    setBusy(true);
    await scanner.connectSerial();
  } catch (err) {
    setBusy(false);
    const name = err && err.name;
    if (name === "NotFoundError") say("NO USB DEVICE SELECTED");
    else if (name === "NotAllowedError" || name === "SecurityError") say("SERIAL DENIED");
    else say(String((err && err.message) || err));
  }
}

paintCaps();
setBusy(false);
if (!report.cap.requestLEScan && els.start) {
  els.start.textContent = report.cap.requestDevice ? "PICK BLE DEVICE" : "BLE UNAVAILABLE";
  if (!report.cap.requestDevice) els.start.disabled = true;
}
if (els.start) els.start.addEventListener("click", onStart);
if (els.pick) els.pick.addEventListener("click", onPick);
if (els.stop) els.stop.addEventListener("click", onStop);
if (els.serial) els.serial.addEventListener("click", onSerial);
if (els.exportJson) els.exportJson.addEventListener("click", () => shareOrDownload("json").catch((err) => say(String(err.message || err))));
if (els.exportCsv) els.exportCsv.addEventListener("click", () => shareOrDownload("csv").catch((err) => say(String(err.message || err))));
if (els.clear) {
  els.clear.addEventListener("click", async () => {
    await clearDetections();
    rows = [];
    seenAlerts.clear();
    if (els.alerts) els.alerts.replaceChildren();
    paintFilters();
    paintDevices();
    say("LOG CLEARED · LOCAL ONLY");
  });
}
bindLane();

settings = await loadSettings();
try {
  entries = await loadPresetEntries(settings.presets || ["global"]);
  if (settings.customEntries && settings.customEntries.length) entries = entries.concat(settings.customEntries);
  say("STANDBY · " + entries.length + " SIGNATURES LOADED");
} catch (err) {
  say("SIGNATURE PRESETS UNAVAILABLE");
}
await refreshRows();
await saveSettings(settings);
