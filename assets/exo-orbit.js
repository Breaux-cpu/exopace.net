import { twoline2satrec } from "./satellite/io.js";
import { propagate, gstime } from "./satellite/propagation.js";
import { dopplerFactor } from "./satellite/dopplerFactor.js";
import { eciToEcf, geodeticToEcf, ecfToLookAngles } from "./satellite/transforms.js";

const FILES = ["/tle/stations.txt", "/tle/weather.txt", "/tle/visual.txt"];
const ISS_MHZ = 145.8;

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
    height: 0.05,
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
  const step = 20 * 1000;
  const end = start + hours * 3600 * 1000;
  const found = [];
  let open = null;
  let prev = null;
  for (let t = start; t <= end; t += step) {
    const hit = observe(satrec, new Date(t), obs);
    const up = hit && hit.el > 0;
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

function drawSky(canvas, points) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(126,224,255,0.35)";
  ctx.fillStyle = "#04070d";
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.42;
  for (const ring of [1, 0.66, 0.33]) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * ring, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffe08a";
  ctx.font = "11px IBM Plex Mono, monospace";
  ctx.fillText("N", cx - 4, cy - r - 6);
  if (!points || !points.length) {
    ctx.fillStyle = "#9fb0b4";
    ctx.fillText("NO ARC", 12, h - 12);
    return;
  }
  ctx.strokeStyle = "#7ee0ff";
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
  let obs = null;
  let catalog = [];
  let timer = 0;

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
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  }

  function selected() {
    const id = (noradIn && noradIn.value || "25544").trim();
    return catalog.find((row) => row.norad === String(parseInt(id, 10))) || null;
  }

  function mhzFor(row) {
    const typed = Number(mhzIn && mhzIn.value);
    if (Number.isFinite(typed) && typed > 0) return typed;
    if (row && row.norad === "25544") return ISS_MHZ;
    return null;
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
    const mhz = mhzFor(row);
    const doppler = mhz ? (mhz * now.factor).toFixed(6) + " MHz" : "NO CATALOG MHZ";
    if (live) {
      live.textContent = "EL " + now.el.toFixed(1) + "°  AZ " + now.az.toFixed(0) + "°  " + doppler;
    }
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
    const list = passes(satrec, here, Date.now(), 12);
    setStatus(row.name + " · CACHED TLE · " + list.length + " PASSES");
    if (table) {
      table.innerHTML = list.length ? list.map((pass) => {
        const aos = new Date(pass.aos).toISOString().slice(11, 16) + "Z";
        const los = pass.los ? new Date(pass.los).toISOString().slice(11, 16) + "Z" : "OPEN";
        return "<div>" + aos + " → " + los + " · MAX " + pass.maxEl.toFixed(0) + "°</div>";
      }).join("") : "NO PASS IN 12 H";
    }
    drawSky(canvas, list[0] ? list[0].points : []);
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
  setStatus("STANDBY · NO FIX");
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

export { parseTle, observe, passes, loadCatalog };
