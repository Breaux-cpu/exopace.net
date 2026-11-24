import { observe, parseTle } from "../assets/exo-orbit.js";
import { twoline2satrec } from "../assets/satellite/io.js";
import { BLE, FEEDS } from "../assets/exo-config.js";
import { pull } from "../assets/exo-feeds.js";
import { decide } from "../assets/exo-decide.js";
import {
  catalogNote, epochAgeDays, findAircraft, findBird, findShip, insideFence, rankText, validWatch,
} from "../assets/exo-watch.js";

const statusEl = document.getElementById("sn-status");
const feedEl = document.getElementById("sn-feed");
let lane = "all";
let fix = null;
let ble = "BLE UNAVAILABLE";
let busy = false;

function say(text) { if (statusEl) statusEl.textContent = text; }

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("exo-sentinel", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      ["watches", "fences", "acks", "queue"].forEach((name) => {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: "id" });
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

async function allRows(store) {
  const db = await openDb();
  const tx = db.transaction(store, "readonly");
  const out = await new Promise((resolve, reject) => {
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return out;
}

async function putRow(store, row) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).put(row);
  await txDone(tx);
  db.close();
}

async function deleteRow(store, id) {
  const db = await openDb();
  const tx = db.transaction(store, "readwrite");
  tx.objectStore(store).delete(id);
  await txDone(tx);
  db.close();
}

function id() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function remember(row) {
  return putRow("queue", row);
}

async function loadTle() {
  const birds = [];
  const notes = [];
  for (const path of FEEDS.tle) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) { notes.push("TLE UNREACHABLE"); continue; }
      birds.push(...parseTle(await res.text()));
    } catch (err) {
      notes.push("TLE UNREACHABLE");
    }
  }
  return { birds, notes };
}

function card(title, body, extra) {
  const node = document.createElement("article");
  node.className = "sn-card";
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = body;
  node.append(h, p);
  if (extra) node.append(extra);
  return node;
}

function ackButton(hit) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "ACK";
  btn.style.minHeight = "44px";
  btn.style.marginTop = "8px";
  btn.addEventListener("click", async () => {
    await putRow("acks", { id: id(), hit: hit.title, at: new Date().toISOString(), note: "LOCAL ONLY" });
    btn.textContent = "LOCAL ONLY";
    btn.disabled = true;
  });
  return btn;
}

function show(hits, notes) {
  feedEl.replaceChildren();
  const visible = hits.filter((hit) => lane === "all" || lane === "active" || hit.lane === lane);
  const laneNotes = notes.filter((note) => lane === "all" || note.lane === lane || (lane === "active" && note.lane === "active"));
  if (!visible.length && lane === "active") feedEl.append(card("ACTIVE", "QUIET"));
  laneNotes.forEach((note) => feedEl.append(card(note.title, note.body)));
  visible.forEach((hit) => feedEl.append(card(hit.title, hit.body, ackButton(hit))));
  if (!visible.length && !laneNotes.length) feedEl.append(card(lane.toUpperCase(), "QUIET"));
}

async function evaluate() {
  if (busy) return;
  busy = true;
  say("REFRESH");
  const hits = [];
  const notes = [];
  const watches = await allRows("watches");
  const fences = (await allRows("fences")).filter((row) => row.armed);
  const queue = await allRows("queue");
  const armed = watches.filter((row) => row.armed);

  const air = await pull(FEEDS.air, remember);
  const sea = await pull(FEEDS.sea, remember);
  const tle = await loadTle();
  const aircraft = air.data && Array.isArray(air.data.aircraft) ? air.data.aircraft : [];
  const ships = sea.data && Array.isArray(sea.data.ships) ? sea.data.ships : [];

  if (air.error) notes.push({ lane: "air", title: "AIR", body: "FEED UNREACHABLE" });
  else if (!armed.some((row) => row.kind === "icao") && !fences.length) notes.push({ lane: "air", title: "AIR", body: "STANDBY" });
  else notes.push({ lane: "air", title: "AIR", body: aircraft.length ? aircraft.length + " TRACKS" : "QUIET" });

  if (sea.error) notes.push({ lane: "sea", title: "SEA", body: "FEED UNREACHABLE" });
  else notes.push({ lane: "sea", title: "SEA", body: ships.length ? ships.length + " SHIPS · " + (sea.data.region || "SEA") : "QUIET" });

  if (!tle.birds.length) notes.push({ lane: "orbital", title: "ORBITAL", body: tle.notes[0] || "TLE UNREACHABLE" });
  else notes.push({ lane: "orbital", title: "ORBITAL", body: tle.birds.length + " CACHED" + (fix ? "" : " · NO FIX") });

  notes.push({ lane: "rf", title: "RF", body: "BROWSER CANNOT SCAN WIFI OR CELL · " + ble });
  notes.push({ lane: "geofences", title: "GEOFENCES", body: fences.length ? fences.length + " ARMED" : "STANDBY" });
  if (queue.length) notes.push({ lane: "all", title: "QUEUE", body: queue.length + " QUEUED · LOCAL ONLY" });

  armed.forEach((watch) => {
    if (watch.kind === "rf") {
      notes.push({ lane: "rf", title: "RF " + watch.value, body: "BROWSER CANNOT SCAN WIFI OR CELL" });
      return;
    }
    if (watch.kind === "icao" && !air.error) {
      const hit = findAircraft(aircraft, watch.value);
      if (hit) hits.push({ lane: "air", title: "AIR " + hit.id, body: (hit.call || "NO CALL") + " · " + hit.lat.toFixed(3) + "," + hit.lon.toFixed(3) });
    }
    if (watch.kind === "mmsi" && !sea.error) {
      const hit = findShip(ships, watch.value);
      if (hit) hits.push({ lane: "sea", title: "SEA " + hit.id, body: hit.lat.toFixed(3) + "," + hit.lon.toFixed(3) });
    }
    if (watch.kind === "norad") {
      const bird = findBird(tle.birds, watch.value);
      if (!bird) {
        notes.push({ lane: "orbital", title: "NORAD " + watch.value, body: catalogNote(tle.birds, watch.value) });
        return;
      }
      const age = epochAgeDays(bird.l1);
      const ageText = age == null ? "CACHED" : "CACHED · EPOCH AGE " + age.toFixed(1) + " D";
      if (!fix) {
        notes.push({ lane: "orbital", title: bird.name, body: ageText + " · NO FIX" });
        return;
      }
      try {
        const satrec = twoline2satrec(bird.l1, bird.l2);
        const now = observe(satrec, new Date(), fix);
        if (!now) notes.push({ lane: "orbital", title: bird.name, body: "PROPAGATE FAILED" });
        else if (now.el > 0) hits.push({ lane: "orbital", title: bird.name, body: "EL " + now.el.toFixed(1) + "° · " + ageText });
        else notes.push({ lane: "orbital", title: bird.name, body: "BELOW HORIZON · " + ageText });
      } catch (err) {
        notes.push({ lane: "orbital", title: bird.name, body: "TLE REJECTED" });
      }
    }
  });

  const cameraWatches = armed.filter((row) => row.kind === "camera");
  if (!cameraWatches.length && !fences.length) notes.push({ lane: "cameras", title: "CAMERAS", body: "STANDBY" });
  for (const watch of cameraWatches) {
    const cam = await pull(FEEDS.cameras + "?id=" + encodeURIComponent(watch.value), remember);
    const features = cam.data && Array.isArray(cam.data.features) ? cam.data.features : [];
    if (cam.error) notes.push({ lane: "cameras", title: "CAMERA " + watch.value, body: "FEED UNREACHABLE" });
    else if (!features.length) notes.push({ lane: "cameras", title: "CAMERA " + watch.value, body: "QUIET" });
    else {
      const feature = features[0];
      const coords = feature.geometry && feature.geometry.coordinates;
      notes.push({
        lane: "cameras",
        title: "CAMERA " + watch.value,
        body: "IN CATALOG" + (coords ? " · " + Number(coords[1]).toFixed(3) + "," + Number(coords[0]).toFixed(3) : ""),
      });
    }
  }

  fences.forEach((fence) => {
    const center = { lat: fence.lat, lon: fence.lon };
    aircraft.forEach((row) => {
      if (air.error || !Number.isFinite(row.lat)) return;
      if (insideFence(fence, row)) {
        hits.push({ lane: "geofences", title: fence.name + " AIR", body: (row.call || row.id || "AIR") + " INSIDE" });
      }
    });
    ships.forEach((row) => {
      if (sea.error) return;
      if (insideFence(fence, row)) hits.push({ lane: "geofences", title: fence.name + " SEA", body: row.id + " INSIDE" });
    });
  });

  hits.sort((a, b) => rankText(b.body + " " + b.title) - rankText(a.body + " " + a.title));
  const activeCount = hits.length;
  say(activeCount ? activeCount + " HITS" : "QUIET");
  show(hits, notes);
  busy = false;
}

document.querySelectorAll(".sn-tabs button").forEach((btn) => {
  btn.addEventListener("click", () => {
    lane = btn.dataset.lane;
    document.querySelectorAll(".sn-tabs button").forEach((peer) => {
      peer.setAttribute("aria-selected", peer === btn ? "true" : "false");
    });
    evaluate();
  });
});

document.getElementById("sn-add").addEventListener("click", async () => {
  const kind = document.getElementById("sn-kind").value;
  const value = document.getElementById("sn-value").value.trim();
  if (!validWatch(kind, value)) { say("STANDBY"); return; }
  await putRow("watches", { id: id(), kind, value, armed: true });
  evaluate();
});

document.getElementById("sn-fence").addEventListener("click", async () => {
  const lat = Number(document.getElementById("sn-flat").value);
  const lon = Number(document.getElementById("sn-flon").value);
  const radiusM = Number(document.getElementById("sn-frad").value);
  const name = document.getElementById("sn-fname").value.trim() || "FENCE";
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radiusM) || radiusM <= 0) {
    say("NO FIX");
    return;
  }
  const gate = await decide("noul", { name });
  const spam = gate && gate.answers && gate.answers.spam;
  if (spam && spam.noul >= 0.8) { say("STANDBY"); return; }
  await putRow("fences", { id: id(), name, lat, lon, radiusM, armed: true });
  evaluate();
});

document.getElementById("sn-fix").addEventListener("click", () => {
  if (!navigator.geolocation) { say("NO FIX"); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    fix = { lat: pos.coords.latitude, lon: pos.coords.longitude };
    say("GPS FIX");
    evaluate();
  }, () => say("NO FIX"), { enableHighAccuracy: true, timeout: 8000 });
});

document.getElementById("sn-refresh").addEventListener("click", evaluate);

document.getElementById("sn-ble").addEventListener("click", async () => {
  if (!navigator.bluetooth || !navigator.bluetooth.requestDevice) {
    ble = "BLE UNAVAILABLE";
    say(ble);
    return;
  }
  try {
    const device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: BLE.namePrefix, services: [BLE.uart] }],
      optionalServices: [BLE.uart],
    });
    ble = device && device.name ? "LIVE " + device.name : "LIVE";
    say(ble);
  } catch (err) {
    ble = "BLE DENIED";
    say(ble);
  }
  evaluate();
});

say("STANDBY");
evaluate();
