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
    ctx.fillText("No pass to draw", 12, h - 12);
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

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
function compass(az) { return COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8]; }
function tleAgeDays(row, nowMs) {
  const yy = parseInt(row.l1.slice(18, 20), 10);
  const doy = parseFloat(row.l1.slice(20, 32));
  if (!Number.isFinite(yy) || !Number.isFinite(doy)) return null;
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const epoch = Date.UTC(year, 0, 1) + (doy - 1) * 86400000;
  return (nowMs - epoch) / 86400000;
}
function ageText(days) {
  if (days == null) return "orbit data age unknown";
  if (days < 1) return "orbit data " + Math.max(1, Math.round(days * 24)) + " h old";
  return "orbit data " + days.toFixed(1) + " days old" + (days > 7 ? " (older than a week, times may be off by minutes)" : "");
}
function localTime(ms, withDay) {
  const d = new Date(ms);
  const t = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (!withDay) return t;
  const today = new Date();
  const same = d.toDateString() === today.toDateString();
  const tomorrow = new Date(today.getTime() + 86400000).toDateString() === d.toDateString();
  return (same ? "Today " : tomorrow ? "Tomorrow " : d.toLocaleDateString(undefined, { weekday: "short" }) + " ") + t;
}
function zoneName() {
  try {
    const part = new Intl.DateTimeFormat(undefined, { timeZoneName: "short" }).formatToParts(new Date()).find((x) => x.type === "timeZoneName");
    return part ? part.value : "local time";
  } catch (err) { return "local time"; }
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
    if (!catalog.length) setStatus("Couldn't load satellite orbit data. Check your connection, then press Show passes again.");
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
  // Only publish a page-wide target after the user acts on this card (Predict,
  // Locate, or edits a field). Opening /radio/ alone must not lock ISS or
  // rewrite the URL.
  let userActed = false;
  root.addEventListener("input", () => { userActed = true; });
  root.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest("button, a")) userActed = true; });
  function shareTarget(row, here) {
    const bus = window.EXO && window.EXO.bus;
    if (!bus || !row || !here || !userActed) return;
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
    if (!here) { if (live) live.textContent = "Enter your latitude and longitude."; return; }
    if (!row) { if (live) live.textContent = catalog.length ? "—" : "Waiting for orbit data…"; return; }
    let satrec;
    try { satrec = twoline2satrec(row.l1, row.l2); }
    catch (err) { if (live) live.textContent = "This satellite's orbit data is damaged. Try another satellite."; return; }
    const now = observe(satrec, new Date(), here);
    if (!now) { if (live) live.textContent = "Couldn't compute this satellite's position right now."; return; }
    shareTarget(row, here);
    const down = mhzFor(row);
    const up = Number(upIn && upIn.value);
    const rx = down ? "listen on " + (down * now.factor).toFixed(4) + " MHz" : "";
    const tx = Number.isFinite(up) && up > 0 ? "transmit on " + (up / now.factor).toFixed(4) + " MHz" : "";
    const tune = [rx, tx].filter(Boolean).join(", ");
    if (live) {
      live.textContent = now.el >= 0
        ? "Now: " + now.el.toFixed(0) + "° above the horizon toward the " + compass(now.az) + (tune ? ". Doppler-corrected: " + tune + "." : ".")
        : "Now: below the horizon (" + now.el.toFixed(0) + "°), so it can't be heard yet. The list below shows when it rises.";
    }
    drawSky(canvas, arc, now);
  }

  async function predict() {
    await ensureCatalog();
    const here = readObs();
    if (!catalog.length) { if (table) table.textContent = ""; arc = []; drawSky(canvas, arc, null); return; }
    const row = selected();
    const board = document.getElementById("passes");
    if (!row) {
      const typed = (noradIn && noradIn.value || "").trim();
      setStatus("Satellite " + (typed || "number") + " isn't in this site's orbit list (space stations, weather and bright satellites). Check the NORAD number; ISS is 25544.");
      if (table) table.textContent = "";
      arc = [];
      drawSky(canvas, arc, null);
      if (board) delete board.dataset.next;
      return;
    }
    let satrec;
    try { satrec = twoline2satrec(row.l1, row.l2); }
    catch (err) { setStatus("This satellite's orbit data is damaged. Try another satellite."); return; }
    const list = passes(satrec, here, Date.now(), 24);
    const home = Math.abs(here.lat - HOME.lat) < 0.01 && Math.abs(here.lon - HOME.lon) < 0.01;
    const place = home ? "Millington, TN (the EXOpace station). Press Use my location for your own" : "your location (" + here.lat.toFixed(2) + ", " + here.lon.toFixed(2) + ")";
    setStatus(row.name + ": " + list.length + " pass" + (list.length === 1 ? "" : "es") + " higher than " + MIN_EL + "° in the next 24 hours, for " + place + ". Times in " + zoneName() + "; " + ageText(tleAgeDays(row, Date.now())) + ".");
    if (table) {
      table.innerHTML = list.length ? "<ol>" + list.map((pass) => {
        const aos = localTime(pass.aos, true);
        const los = pass.los ? localTime(pass.los, false) : "still up at the end of the window";
        return "<li>" + aos + " to " + los + ", highest " + pass.maxEl.toFixed(0) + "° above the horizon</li>";
      }).join("") + "</ol>" : "No passes higher than " + MIN_EL + "° in the next 24 hours. Try another satellite or come back tomorrow.";
    }
    arc = list[0] ? list[0].points : [];
    drawSky(canvas, arc, null);
    if (board) {
      if (!list.length) { board.textContent = row.name + " quiet above 10°"; delete board.dataset.next; }
      else {
        const short = row.name.replace(/\s*\(.*\)\s*$/, "").trim();
        board.textContent = row.name + " next pass " + localTime(list[0].aos, true);
        board.dataset.next = "Next " + short + " pass " + localTime(list[0].aos, true).replace(/^(Today|Tomorrow)/, (m) => m.toLowerCase()) + ", up to " + list[0].maxEl.toFixed(0) + "°";
      }
    }
    const lock = root.querySelector("[data-lock]");
    if (lock) lock.href = "/mission/?lock=" + encodeURIComponent(row.norad) + "&cam=follow";
  }

  root.querySelector("[data-locate]")?.addEventListener("click", () => {
    if (!navigator.geolocation) { setStatus("This browser can't share your location. Type your latitude and longitude, then press Show passes."); return; }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition((pos) => {
      if (latIn) latIn.value = pos.coords.latitude.toFixed(5);
      if (lonIn) lonIn.value = pos.coords.longitude.toFixed(5);
      setStatus("Location found. Working out passes…");
      predict();
    }, (err) => setStatus((err && err.code === 1
      ? "Location is blocked for this site. Allow location in the address bar"
      : "Couldn't get a location fix") + ", or type your latitude and longitude and press Show passes."), { enableHighAccuracy: true, timeout: 8000 });
  });
  root.querySelector("[data-predict]")?.addEventListener("click", predict);
  timer = window.setInterval(tick, 1000);
  window.addEventListener("pagehide", () => window.clearInterval(timer), { once: true });
  setStatus("Loading satellite orbit data…");
  predict();
}

const api = { parseTle, observe, passes, loadCatalog, home: HOME, minEl: MIN_EL };
if (typeof globalThis !== "undefined") globalThis.EXO_ORBIT = api;

if (typeof document !== "undefined") {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

export { parseTle, observe, passes, loadCatalog, HOME, MIN_EL };
