/* SGP4 is satellite.js (MIT). Doppler uses eciToEcf(velocity), then dopplerFactor. */
import { twoline2satrec } from "./satellite/io.js";
import { propagate, gstime } from "./satellite/propagation.js";
import { dopplerFactor } from "./satellite/dopplerFactor.js";
import { eciToEcf, geodeticToEcf, ecfToLookAngles } from "./satellite/transforms.js";
import { TOKENS } from "./exo-config.js";

const FILES = ["/tle/stations.txt", "/tle/weather.txt", "/tle/visual.txt"];
const ISS_DOWN = 145.8;
const ISS_UP = 144.49;
const HOME = { lat: 35.3418, lon: -89.897, heightKm: 0.09 };
const MIN_EL = 10;

function parseTle(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    const l1 = lines[i].trim();
    const l2 = lines[i + 1] ? lines[i + 1].trim() : "";
    if (!l1.startsWith("1 ") || !l2.startsWith("2 ")) continue;
    const prev = i > 0 ? lines[i - 1].trim() : "";
    const name = prev && !prev.startsWith("1 ") && !prev.startsWith("2 ") ? prev : "NORAD " + l1.slice(2, 7).trim();
    const norad = String(parseInt(l1.slice(2, 7), 10));
    if (!norad || norad === "NaN") continue;
    out.push({ name, norad, l1, l2 });
    i += 1;
  }
  return out;
}

function observe(satrec, when, obs) {
  const pv = propagate(satrec, when);
  if (!pv || !pv.position || !pv.velocity) return null;
  const gmst = gstime(when);
  const ecf = eciToEcf(pv.position, gmst);
  const vel = eciToEcf(pv.velocity, gmst);
  const gd = {
    longitude: obs.lon * Math.PI / 180,
    latitude: obs.lat * Math.PI / 180,
    height: Number.isFinite(obs.heightKm) ? obs.heightKm : HOME.heightKm,
  };
  const look = ecfToLookAngles(gd, ecf);
  return {
    az: look.azimuth * 180 / Math.PI,
    el: look.elevation * 180 / Math.PI,
    rangeKm: look.rangeSat,
    factor: dopplerFactor(geodeticToEcf(gd), ecf, vel),
  };
}

function passes(satrec, obs, start, hours) {
  const span = hours || 24;
  const step = 30 * 1000;
  const end = start + span * 3600 * 1000;
  const found = [];
  let open = null;
  let prev = null;
  for (let t = start; t <= end; t += step) {
    const hit = observe(satrec, new Date(t), obs);
    const up = hit && hit.el >= MIN_EL;
    if (up && !open) open = { aos: t, maxEl: hit.el, maxAt: t, points: [] };
    if (open && hit) {
      open.points.push(hit);
      if (hit.el > open.maxEl) { open.maxEl = hit.el; open.maxAt = t; }
    }
    if (open && !up && prev) {
      open.los = t;
      found.push(open);
      open = null;
    }
    prev = hit;
    if (found.length >= 8) break;
  }
  if (open) { open.los = null; found.push(open); }
  return found;
}

async function loadCatalog() {
  const all = [];
  const notes = [];
  for (const path of FILES) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) { notes.push(path + " " + res.status); continue; }
      all.push(...parseTle(await res.text()));
    } catch (err) {
      notes.push(path + " UNREACHABLE");
    }
  }
  return { all, notes };
}

function drawSky(canvas, points, now) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = TOKENS.hairline;
  ctx.fillStyle = TOKENS.void;
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.42;
  for (const ring of [1, 0.66, 0.33]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = TOKENS.amber;
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillText("N", cx - 4, cy - r - 6);
  if (!points || !points.length) {
    ctx.fillStyle = TOKENS.dim;
    ctx.fillText("NO ARC", 12, h - 12);
  } else {
  ctx.strokeStyle = TOKENS.cyan;
  ctx.beginPath();
  points.forEach((p, i) => {
    const az = (p.az - 90) * Math.PI / 180;
    const rr = r * (1 - Math.max(0, Math.min(90, p.el)) / 90);
    const x = cx + Math.cos(az) * rr;
    const y = cy + Math.sin(az) * rr;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  }
  if (now && Number.isFinite(now.el)) {
    const az = (now.az - 90) * Math.PI / 180;
    const rr = r * (1 - Math.max(0, Math.min(90, now.el)) / 90);
    ctx.fillStyle = "#ffb84d";
    ctx.beginPath();
    ctx.arc(cx + Math.cos(az) * rr, cy + Math.sin(az) * rr, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function mount() {
  const root = document.getElementById("exo-orbit");
  if (!root) return;
  const status = root.querySelector("[data-orbit-status]");
  const table = root.querySelector("[data-orbit-table]");
  const live = root.querySelector("[data-orbit-live]");
  const canvas = root.querySelector("canvas");
  const latIn = root.querySelector("[data-lat]");
  const lonIn = root.querySelector("[data-lon]");
  const noradIn = root.querySelector("[data-norad]");
  const mhzIn = root.querySelector("[data-mhz]");
  let catalog = [];
  let arc = [];
  let timer = 0;
  const upIn = root.querySelector("[data-up]");
  if (latIn && !latIn.value) latIn.value = HOME.lat.toFixed(4);
  if (lonIn && !lonIn.value) lonIn.value = HOME.lon.toFixed(4);
  if (mhzIn && !mhzIn.value) mhzIn.value = String(ISS_DOWN);
  if (upIn && !upIn.value) upIn.value = String(ISS_UP);

  function setStatus(text) { if (status) status.textContent = text; }

  async function ensureCatalog() {
    if (catalog.length) return;
    const loaded = await loadCatalog();
    catalog = loaded.all;
    if (!catalog.length) setStatus(loaded.notes.join(" · ") || "TLE UNREACHABLE");
  }

  function readObs() {
    const lat = Number(latIn && latIn.value);
    const lon = Number(lonIn && lonIn.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { lat: HOME.lat, lon: HOME.lon, heightKm: HOME.heightKm };
    return { lat, lon, heightKm: HOME.heightKm };
  }

  function selected() {
    const id = (noradIn && noradIn.value || "25544").trim();
    return catalog.find((row) => row.norad === String(parseInt(id, 10))) || null;
  }

  function mhzFor(row) {
    const typed = Number(mhzIn && mhzIn.value);
    if (Number.isFinite(typed) && typed > 0) return typed;
    if (row && row.norad === "25544") return ISS_DOWN;
    return null;
  }

  let sharedKey = "";
  function shareTarget(row, here) {
    const bus = window.EXO && window.EXO.bus;
    if (!bus || !row || !here) return;
    const down = mhzFor(row);
    const key = row.norad + "|" + (down || "");
    if (key === sharedKey) return;
    sharedKey = key;
    bus.set({
      kind: "satellite",
      id: row.norad,
      label: row.name,
      lat: here.lat,
      lon: here.lon,
      norad: row.norad,
      freqMHz: down,
    });
  }

  function tick() {
    const here = readObs();
    const row = selected();
    if (!here) { if (live) live.textContent = "NO FIX"; return; }
    if (!row) { if (live) live.textContent = "NOT IN CACHED TLE"; return; }
    let satrec;
    try { satrec = twoline2satrec(row.l1, row.l2); }
    catch (err) { if (live) live.textContent = "TLE REJECTED"; return; }
    const now = observe(satrec, new Date(), here);
    if (!now) { if (live) live.textContent = "PROPAGATE FAILED"; return; }
    shareTarget(row, here);
    const down = mhzFor(row);
    const up = Number(upIn && upIn.value);
    const rx = down ? (down * now.factor).toFixed(6) + " RX" : "RX —";
    const tx = Number.isFinite(up) && up > 0 ? (up / now.factor).toFixed(6) + " TX" : "TX —";
    if (live) {
      live.textContent = "EL " + now.el.toFixed(1) + "°  AZ " + now.az.toFixed(0) + "°  " + rx + "  " + tx;
    }
    drawSky(canvas, arc, now);
  }

  async function predict() {
    await ensureCatalog();
    const here = readObs();
    if (!here) { setStatus("NO FIX"); if (table) table.textContent = ""; return; }
    const row = selected();
    if (!row) { setStatus("NOT IN CACHED TLE"); return; }
    let satrec;
    try { satrec = twoline2satrec(row.l1, row.l2); }
    catch (err) { setStatus("TLE REJECTED"); return; }
    const list = passes(satrec, here, Date.now(), 24);
    setStatus(row.name + " · CACHED TLE · " + list.length + " PASSES");
    if (table) {
      table.innerHTML = list.length ? list.map((pass) => {
        const aos = new Date(pass.aos).toISOString().slice(11, 16) + "Z";
        const los = pass.los ? new Date(pass.los).toISOString().slice(11, 16) + "Z" : "OPEN";
        return "<div>" + aos + " → " + los + " · MAX " + pass.maxEl.toFixed(0) + "°</div>";
      }).join("") : "NO PASS ≥10° IN 24 H";
    }
    arc = list[0] ? list[0].points : [];
    drawSky(canvas, arc, null);
    const board = document.getElementById("passes");
    if (board) {
      if (!list.length) board.textContent = row.name + " QUIET ABOVE 10°";
      else {
        const aos = new Date(list[0].aos).toISOString().slice(11, 16) + "Z";
        board.textContent = row.name + " AOS " + aos + " max " + list[0].maxEl.toFixed(0) + "°";
      }
    }
    const lock = root.querySelector("[data-lock]");
    if (lock) lock.href = "/mission/?lock=" + encodeURIComponent(row.norad) + "&cam=follow";
  }

  root.querySelector("[data-locate]")?.addEventListener("click", () => {
    if (!navigator.geolocation) { setStatus("NO FIX"); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      if (latIn) latIn.value = pos.coords.latitude.toFixed(5);
      if (lonIn) lonIn.value = pos.coords.longitude.toFixed(5);
      setStatus("GPS FIX");
      predict();
    }, () => setStatus("NO FIX"), { enableHighAccuracy: true, timeout: 8000 });
  });
  root.querySelector("[data-predict]")?.addEventListener("click", predict);
  timer = window.setInterval(tick, 1000);
  window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
  setStatus("MILLINGTON · CACHED TLE");
  predict();
}

const api = { parseTle, observe, passes, loadCatalog, home: HOME, minEl: MIN_EL };
if (typeof globalThis !== "undefined") globalThis.EXO_ORBIT = api;

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

export { parseTle, observe, passes, loadCatalog, HOME, MIN_EL };
