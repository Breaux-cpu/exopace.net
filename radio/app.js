"use strict";
const $ = (id) => document.getElementById(id);
const P = window.ExoProto;
const BLE_SVC = P.BLE.service;
const BLE_RX = P.BLE.rx;
const BLE_TX = P.BLE.tx;

const S = {
  ws: null, bleRx: null, bleDev: null, demo: false, demoTimers: [], mode: "off",
  myId: "", myName: "NODE", gps: null, nodes: {}, batt: [], tries: 0,
  keyDirty: false, keyClear: false, keySet: false, lastCfg: null, bleBuf: "",
  globe: null, ways: {}, rf: [], trail: [], rangeOn: false, rssiSpark: [], lastRssi: null, lastSnr: null,
};

function fitKb() {
  const vv = window.visualViewport;
  if (!vv) { document.documentElement.style.setProperty("--kb", "0px"); return; }
  const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
  document.documentElement.style.setProperty("--kb", kb + "px");
}
if (window.visualViewport) {
  visualViewport.addEventListener("resize", fitKb);
  visualViewport.addEventListener("scroll", fitKb);
}
addEventListener("focusin", (e) => { if (e.target && e.target.closest("#composer")) setTimeout(fitKb, 50); });
addEventListener("focusout", () => setTimeout(fitKb, 80));

document.querySelectorAll("nav button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("nav button").forEach((x) => x.classList.remove("active"));
  document.querySelectorAll(".screen").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  $("scr-" + b.dataset.s).classList.add("active");
  if (S.globe) S.globe.setActive(b.dataset.s === "map");
  if (b.dataset.s === "map") ensureGlobe();
});

function toast(t) { const e = $("toast"); e.textContent = t; e.style.opacity = 1; setTimeout(() => e.style.opacity = 0, 1800); }
function setPath(mode, up) {
  S.mode = mode;
  $("hLink").classList.toggle("up", !!up);
  const c = $("btnConn"); const lbl = $("pathLbl");
  if (mode === "demo") { c.textContent = "DEV"; lbl.textContent = "DEV"; lbl.classList.add("up"); $("demoTag").textContent = "DEV"; }
  else if (up) { c.textContent = "LINK UP"; lbl.textContent = "LINK UP"; lbl.classList.add("up"); }
  else { c.textContent = "CONNECT"; lbl.textContent = "LINK DOWN"; lbl.classList.remove("up"); }
  c.classList.toggle("up", !!up);
  $("demoTag").style.display = mode === "demo" ? "inline-block" : "none";
}
function showSheet(on) { $("sheet").classList.toggle("show", !!on); }
function syncChatEmpty() { $("chatEmpty").style.display = $("chatLog").children.length ? "none" : ""; }

function closeWifi() {
  const ws = S.ws; S.ws = null;
  if (!ws) return;
  try { ws.onclose = null; ws.onmessage = null; ws.onopen = null; ws.close(); } catch (e) {}
}
function clearBle() {
  const dev = S.bleDev; S.bleRx = null; S.bleDev = null;
  if (dev && dev.gatt && dev.gatt.connected) { try { dev.gatt.disconnect(); } catch (e) {} }
}
function stopDemo() {
  if (S.demo) {
    (S.demoTimers || []).forEach(clearInterval);
    S.demoTimers = [];
    S.nodes = {};
    $("chatLog").innerHTML = "";
    syncChatEmpty();
  }
  S.demo = false;
}

function onLine(raw) {
  const m = P.parseLine(raw);
  if (m) handle(m);
}
function onStreamChunk(chunk) {
  S.bleBuf += chunk;
  let i;
  while ((i = S.bleBuf.indexOf("\n")) >= 0) {
    const line = S.bleBuf.slice(0, i); S.bleBuf = S.bleBuf.slice(i + 1);
    onLine(line);
  }
  const rest = S.bleBuf.trim();
  if (rest.startsWith("{") && rest.endsWith("}")) { onLine(rest); S.bleBuf = ""; }
}

function connectWifi(url) {
  if (!url && location.protocol === "file:") { toast("OPEN FROM THE NODE"); return; }
  stopDemo();
  if (S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1) && !url) {
    if (S.ws.readyState === 1) setPath("wifi", true);
    return;
  }
  const u = url || ("ws://" + (location.hostname || "192.168.4.1") + "/ws");
  try { S.ws = new WebSocket(u); } catch (e) { toast("WS FAIL"); return; }
  S.ws.onopen = () => { S.tries = 0; setPath(u.startsWith("wss") ? "remote" : "wifi", true); };
  S.ws.onclose = () => {
    if (S.mode === "wifi" || S.mode === "remote") setPath(S.mode, false);
    if (S.demo || S.mode === "bt" || url) return;
    setTimeout(() => { if (S.demo || S.mode === "bt") return; connectWifi(); }, 1500);
  };
  S.ws.onmessage = (ev) => onStreamChunk(typeof ev.data === "string" ? ev.data : "");
}

async function bindUart(svc) {
  let c2 = null, c3 = null;
  try { c2 = await svc.getCharacteristic(BLE_RX); } catch (e) {}
  try { c3 = await svc.getCharacteristic(BLE_TX); } catch (e) {}
  let notifyCh = null, writeCh = null;
  [c2, c3].forEach((c) => {
    if (!c) return;
    const p = c.properties;
    if (!notifyCh && (p.notify || p.indicate)) notifyCh = c;
    if (!writeCh && (p.write || p.writeWithoutResponse)) writeCh = c;
  });
  if (!notifyCh) notifyCh = c2 || c3;
  if (!writeCh) writeCh = c3 || c2;
  if (!notifyCh || !writeCh) throw new Error("UART CHARS");
  return { notifyCh, writeCh };
}

async function connectBle() {
  if (!window.isSecureContext || !navigator.bluetooth) { toast("NEEDS SECURE CONTEXT"); return; }
  let picked = false;
  try {
    const dev = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: P.BLE.namePrefix }],
      optionalServices: [BLE_SVC],
    });
    picked = true;
    const gatt = await dev.gatt.connect();
    const svc = await gatt.getPrimaryService(BLE_SVC);
    const { notifyCh, writeCh } = await bindUart(svc);
    await notifyCh.startNotifications();
    notifyCh.addEventListener("characteristicvaluechanged", (ev) => {
      onStreamChunk(new TextDecoder().decode(ev.target.value));
    });
    stopDemo(); closeWifi();
    S.bleRx = writeCh; S.bleDev = dev; S.bleBuf = "";
    setPath("bt", true);
    $("installHint").style.display = "none";
    dev.addEventListener("gattserverdisconnected", () => {
      if (S.bleDev !== dev) return;
      S.bleRx = null; S.bleDev = null;
      if (!S.demo) setPath("bt", false);
    });
  } catch (e) {
    toast(picked ? "BT FAILED" : "BT CANCELLED");
    if (!S.demo && location.protocol !== "file:" && !(S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)))
      connectWifi();
  }
}
(function initBt() {
  if (!window.isSecureContext || !navigator.bluetooth) {
    $("optBle").disabled = true;
    $("btHint").textContent = "NEEDS HTTPS OR ANDROID INSECURE-ORIGIN EXCEPTION";
  }
})();

function pushIngest(msg) {
  const url = (window.EXOPACE_BRIDGE || "").replace(/\/$/, "");
  const tok = window.EXOPACE_INGEST_TOKEN || localStorage.getItem("exopace-ingest-token") || "";
  if (!url || !tok) return;
  fetch(url + "/ingest", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + tok },
    body: JSON.stringify(msg),
  }).catch(() => {});
}

function send(o) {
  const j = P.encode(o);
  if (S.ws && S.ws.readyState === 1) { S.ws.send(j); return; }
  if (S.bleRx) {
    const u8 = new TextEncoder().encode(j);
    const w = S.bleRx.writeValueWithoutResponse || S.bleRx.writeValue;
    w.call(S.bleRx, u8); return;
  }
  if (S.demo) demoSend(o);
}

$("btnConn").onclick = () => showSheet(true);
$("optCancel").onclick = () => showSheet(false);
$("sheet").onclick = (e) => { if (e.target.id === "sheet") showSheet(false); };
$("optWifi").onclick = () => {
  showSheet(false);
  if (location.protocol === "https:") { toast("JOIN EXOpace-XXXX · OPEN 192.168.4.1"); return; }
  connectWifi();
};
$("optBle").onclick = () => { if ($("optBle").disabled) return; showSheet(false); connectBle(); };

function gpsFrom(m) {
  if (m.g) return m.g;
  if (m.lat != null) return { fix: m.fix !== false, lat: +m.lat, lon: +m.lon, alt: m.alt, spd: m.spd, hdg: m.hdg, sats: m.sats };
  return null;
}
function chatText(m) { return m.text != null ? m.text : m.msg; }

function handle(m) {
  switch (m.t) {
    case "hello":
      S.myId = m.id; S.myName = m.name || m.id; $("hName").textContent = S.myName;
      $("chatLog").innerHTML = ""; syncChatEmpty(); break;
    case "cfg":
      fillCfg(m.cfg); S.myName = m.cfg.name; $("hName").textContent = m.cfg.name;
      $("hFreq").textContent = m.cfg.freq + " MHz · SF" + m.cfg.sf; break;
    case "chat":
      if (m.text == null && m.msg != null) m.text = m.msg;
      addMsg(m); ExoStore.put("chat", { id: m.msgId || ("c" + Date.now()), ...m }); break;
    case "hist":
      (m.m || []).forEach(handle); break;
    case "ack":
      markAck(m.msgId); break;
    case "gps":
      S.gps = gpsFrom(m); renderGps();
      if (S.gps && S.gps.fix) {
        S.trail.push([S.gps.lat, S.gps.lon, Date.now() / 1000]);
        if (S.trail.length > 200) S.trail.shift();
        if (S.rangeOn) sampleRfHere();
      }
      break;
    case "telem":
      renderTelem(m.d || m); break;
    case "nodes":
      (m.list || []).forEach((n) => { S.nodes[n.id] = n; ExoStore.put("nodes", { ...n, id: n.id }); });
      renderNodes(); break;
    case "sys":
      toast(m.msg); break;
    case "sos":
      addMsg({ t: "chat", from: m.id, fromName: m.id, text: "SOS " + (m.msg || ""), ts: m.ts });
      S.ways[m.id] = { id: m.id, name: "SOS", lat: m.lat, lon: m.lon, kind: "sos" };
      toast("SOS"); syncGlobe(); break;
    case "way":
      S.ways[m.id] = m; ExoStore.put("ways", m); renderWays(); syncGlobe(); break;
    case "track":
      if (m.pts) { S.trail = m.pts; if (S.globe) S.globe.setTrail(S.trail, $("stTrail").checked); }
      break;
    case "rf":
      S.rf.push(m); if (S.rf.length > 400) S.rf.shift();
      ExoStore.put("rf", { ...m, id: "rf" + Date.now() });
      if (S.globe) S.globe.setHeat(S.rf);
      break;
    case "presence":
      if (S.nodes[m.id]) Object.assign(S.nodes[m.id], m);
      else S.nodes[m.id] = m;
      renderNodes(); break;
    case "time":
      break;
  }
}

function addMsg(m) {
  const d = document.createElement("div");
  d.className = "msg" + (m.mine ? " mine" : ""); d.dataset.mid = m.msgId || "";
  const ts = m.ts ? new Date(m.ts * 1000).toISOString().slice(11, 19) + " UTC · " : "";
  const meta = m.mine ? (m.ack ? '<span class="ok">✓ delivered</span>' : '<span class="ackslot">…sent</span>')
    : (m.rssi !== undefined ? m.rssi + " dBm · " + m.snr + " dB" : "");
  d.innerHTML = '<div class="who">' + esc(m.mine ? "YOU" : (m.fromName || m.from)) + (m.to && m.to !== "*" ? " → " + esc(m.toName || m.to) : "") + "</div>"
    + '<div class="txt">' + esc(chatText(m)) + '</div><div class="meta">' + ts + meta + "</div>";
  $("chatLog").appendChild(d);
  syncChatEmpty();
  $("chatLog").scrollTop = 1e9;
}
function markAck(id) { const e = document.querySelector('.msg[data-mid="' + id + '"] .meta'); if (e) e.innerHTML = '<span class="ok">✓ delivered</span>'; }
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

$("chatSend").onclick = () => {
  const t = $("chatText").value.trim(); if (!t) return;
  send({ t: "chat", to: $("chatTo").value, text: t, msg: t }); $("chatText").value = "";
};
$("chatText").addEventListener("keydown", (e) => { if (e.key === "Enter") $("chatSend").click(); });
document.querySelectorAll("[data-qtx]").forEach((b) => {
  b.onclick = () => {
    const text = b.dataset.qtx;
    if (b.dataset.sos) {
      const g = S.gps;
      send(P.makeSos({ id: S.myId || "me", lat: g && g.lat, lon: g && g.lon, msg: text }));
      handle(P.makeSos({ id: S.myId || "me", lat: g && g.lat, lon: g && g.lon, msg: text }));
      toast("SOS TX");
      return;
    }
    send({ t: "chat", to: $("chatTo").value, text, msg: text });
  };
});

function renderGps() {
  const g = S.gps;
  $("fixBadge").textContent = (g && g.fix) ? "FIX" : "WAITING FOR FIX";
  $("fixBadge").classList.toggle("on", !!(g && g.fix));
  if (g && g.fix) {
    $("posLL").textContent = g.lat.toFixed(5) + " / " + g.lon.toFixed(5);
    $("posSpd").textContent = (g.spd || 0).toFixed(1) + " mph";
    $("posAlt").textContent = Math.round(g.alt || 0) + " ft · " + (g.sats || 0) + " sat";
    $("needle").style.transform = "translate(-50%,-100%) rotate(" + (g.hdg || 0) + "deg)";
  } else {
    $("posLL").textContent = "--.----- / --.-----";
  }
  renderNodes();
}
$("btnCopy").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  navigator.clipboard && navigator.clipboard.writeText(g.lat.toFixed(6) + "," + g.lon.toFixed(6)); toast("COPIED");
};
$("btnMaps").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  window.open("https://maps.google.com/?q=" + g.lat + "," + g.lon, "_blank");
};
$("btnWay").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  const id = "w" + Date.now().toString(36);
  const w = P.makeWay({ id, name: "MARK", lat: g.lat, lon: g.lon, kind: $("wayKind").value || "meet" });
  send(w); handle(w); toast("WAYPOINT");
};

async function ensureGlobe() {
  if (S.globe) { S.globe.setActive(true); syncGlobe(); return; }
  if (!window.THREE || !window.ExoGlobe) { toast("GLOBE ENGINE MISSING"); return; }
  try {
    S.globe = new ExoGlobe();
    await S.globe.mount($("globeC"));
    S.globe.onPick = showDossier;
    S.globe.setActive($("scr-map").classList.contains("active"));
    syncGlobe();
  } catch (e) { toast("GLOBE FAIL"); }
}
function collectPts() {
  const pts = [];
  if (S.gps && S.gps.fix) pts.push({ kind: "me", lat: S.gps.lat, lon: S.gps.lon, name: S.myName || "ME", id: S.myId || "", alt: S.gps.alt, conf: 1 });
  Object.keys(S.nodes).forEach((i) => {
    const n = P.applyPresence(S.nodes[i]);
    if (n.quiet) return;
    if (n.lat != null && n.lon != null) pts.push({ kind: "peer", id: i, lat: +n.lat, lon: +n.lon, name: n.name || i, last: n.last, rssi: n.rssi, snr: n.snr, bat: n.batt, ago: n.ago, conf: n.conf });
  });
  Object.keys(S.ways).forEach((i) => {
    const w = S.ways[i];
    pts.push({ kind: w.kind === "sos" ? "sos" : "way", id: w.id, lat: w.lat, lon: w.lon, name: w.name, wayKind: w.kind, conf: 1 });
  });
  if ($("stPin").checked) pts.push({ kind: "st", lat: P.STATION.lat, lon: P.STATION.lon, name: "STATION", id: "MILLINGTON", conf: 1 });
  return pts;
}
function syncGlobe() {
  const pts = collectPts();
  if (S.globe) {
    S.globe.setMarkers(pts);
    S.globe.setTrail(S.trail, $("stTrail").checked);
    S.globe.setHeat(S.rf);
  }
  const noMe = !(S.gps && S.gps.fix);
  const noPeer = !Object.keys(S.nodes).some((i) => S.nodes[i].lat != null);
  $("mapEmpty").textContent = [
    noMe ? "WAITING FOR FIX — walk outside" : "",
    noPeer ? "MESH QUIET — peer dots appear when nodes report position." : "",
  ].filter(Boolean).join("\n");
}
function showDossier(m) {
  const tip = $("mapTip");
  if (!m) { tip.style.display = "none"; return; }
  const lines = [m.name || "?", m.id || "",
    (m.lat != null ? (m.lat.toFixed(5) + " / " + m.lon.toFixed(5)) : ""),
    m.alt != null ? ("ALT " + Math.round(m.alt)) : "",
    m.rssi != null ? ("RSSI " + m.rssi + " dBm") : "",
    m.snr != null ? ("SNR " + m.snr + " dB") : "",
    m.bat != null ? ("BAT " + m.bat + "%") : "",
    m.conf != null ? ("PRESENCE " + Math.round(m.conf * 100) + "%") : "",
    m.last != null ? (ago(m.last) + " ago") : "",
    m.kind === "me" ? "you" : "",
    m.kind === "st" ? "fixed pin" : "",
    m.kind === "sos" ? "SOS" : "",
  ].filter(Boolean);
  tip.textContent = lines.join("\n");
  tip.style.display = "block";
}
$("stPin").onchange = () => syncGlobe();
$("stTrail").onchange = () => syncGlobe();
$("btnRecage").onclick = () => {
  if (!S.globe) return;
  if (S.gps && S.gps.fix) S.globe.recage(S.gps.lat, S.gps.lon);
  else S.globe.recage(35.1495, -90.0490);
  toast("RECAGE");
};
$("btnRange").onclick = () => {
  S.rangeOn = !S.rangeOn;
  $("btnRange").classList.toggle("primary", S.rangeOn);
  toast(S.rangeOn ? "RANGE TEST ON" : "RANGE TEST OFF");
};
function sampleRfHere() {
  const g = S.gps;
  if (!g || !g.fix) { toast("WAITING FOR FIX"); return; }
  const rssi = S.lastRssi, snr = S.lastSnr;
  if (rssi == null || snr == null || rssi <= -135) { toast("NO RF SAMPLE · no packet"); return; }
  const rf = P.makeRf({ id: S.myId || "me", rssi: rssi, snr: snr, lat: g.lat, lon: g.lon });
  handle(rf);
  pushIngest(rf);
}
addEventListener("resize", () => { if (S.globe) S.globe._resize(); });

function bars(rssi) {
  let n = rssi > -70 ? 5 : rssi > -85 ? 4 : rssi > -100 ? 3 : rssi > -115 ? 2 : rssi > -135 ? 1 : 0, h = "";
  for (let i = 0; i < 5; i++) h += "<b" + (i < n ? ' class="on"' : "") + "></b>";
  return '<div class="meter">' + h + "</div>";
}
function ago(ts) {
  const s = ts > 1e9 ? Math.max(0, (Date.now() / 1000) - ts) : ts;
  return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s / 60) + "m" : Math.round(s / 3600) + "h";
}
function renderNodes() {
  const ids = Object.keys(S.nodes);
  const sel = $("chatTo"); const cur = sel.value;
  sel.innerHTML = '<option value="*">ALL</option>' + ids.map((i) => '<option value="' + i + '">' + esc(S.nodes[i].name || i) + "</option>").join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "*";
  $("nodeList").innerHTML = ids.length ? ids.map((i) => {
    const n = P.applyPresence(S.nodes[i]);
    const fade = Math.round(n.conf * 100);
    return '<div class="card node" style="opacity:' + (0.35 + 0.65 * n.conf) + '"><div><div class="nm">' + esc(n.name || "?") + '</div><div class="id">' + i + " · " + fade + "%</div></div>"
      + '<div class="st">' + ago(n.last) + " ago<br>" + (n.batt != null ? n.batt + "%" : "") + "</div>" + bars(n.rssi ?? -140) + "</div>";
  }).join("") : '<div class="card sub">MESH QUIET. Power up a second node — it announces itself.</div>';
  renderWays();
  syncGlobe();
}
function renderWays() {
  const el = $("wayList");
  if (!el) return;
  const ids = Object.keys(S.ways);
  el.innerHTML = ids.length ? ids.map((i) => {
    const w = S.ways[i];
    return '<div class="card node"><div><div class="nm">' + esc(w.name) + '</div><div class="id">' + esc(w.kind) + "</div></div></div>";
  }).join("") : '<div class="sub">No waypoints.</div>';
}

function renderTelem(d) {
  $("vBatt").textContent = (d.batt ?? "-") + "%"; $("vVolt").textContent = (d.vbat ?? 0).toFixed(2) + " V";
  $("vUp").textContent = fmtUp(d.up); $("vHeap").textContent = "heap " + Math.round((d.heap || 0) / 1024) + " KB";
  $("vRssi").textContent = (d.rssi ?? "-") + " dBm"; $("vSnr").textContent = "SNR " + (d.snr ?? "-") + " dB";
  $("vTx").textContent = (d.txp ?? "-") + " dBm"; $("vFreq").textContent = (d.freq ?? "-") + " MHz";
  const m = bars(d.rssi ?? -140); $("hMeter").outerHTML = m.replace('class="meter"', 'class="meter" id="hMeter"');
  S.batt.push(d.batt || 0); if (S.batt.length > 60) S.batt.shift();
  if (d.rssi != null) S.lastRssi = d.rssi;
  if (d.snr != null) S.lastSnr = d.snr;
  S.rssiSpark.push(d.rssi ?? -120); if (S.rssiSpark.length > 48) S.rssiSpark.shift();
  drawBatt(); drawSpark();
}
function fmtUp(s) { s = s || 0; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h + "h " + m + "m"; }
function drawBatt() {
  const c = $("battChart"), x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = "#ffb454"; x.lineWidth = 3; x.beginPath();
  S.batt.forEach((v, i) => {
    const px = i / (Math.max(S.batt.length - 1, 1)) * c.width, py = c.height - (v / 100) * c.height;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }); x.stroke();
}
function drawSpark() {
  const c = $("rssiChart"); if (!c) return;
  const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = "#7ee0ff"; x.lineWidth = 2; x.beginPath();
  S.rssiSpark.forEach((v, i) => {
    const px = i / (Math.max(S.rssiSpark.length - 1, 1)) * c.width;
    const py = c.height - ((v + 140) / 80) * c.height;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }); x.stroke();
}

function fillCfg(c) {
  S.lastCfg = c; S.keySet = !!c.keySet; S.keyDirty = false; S.keyClear = false;
  $("cfgName").value = c.name; $("cfgFreq").value = c.freq; $("cfgSf").value = c.sf;
  $("cfgTx").value = c.txp; $("cfgPass").value = c.pass || "";
  $("cfgGpsRx").value = c.gpsRx; $("cfgGpsTx").value = c.gpsTx; $("cfgGpsPwr").value = c.gpsPwr;
  if (c.gpsInt) $("cfgGpsInt").value = c.gpsInt;
  if (c.key) {
    $("cfgKey").value = "";
    $("cfgKey").placeholder = "set — tap to change (never shown)";
    S.keySet = true;
  } else if (c.keySet) {
    $("cfgKey").value = "";
    $("cfgKey").placeholder = "•••••••• / set — tap to change";
  } else {
    $("cfgKey").value = "";
    $("cfgKey").placeholder = "shared secret, same on every node";
  }
  if (c.pass === "nodelink") {
    $("passHint").textContent = "Node still has the factory AP password — change it on the radio before field use (FIRMWARE.md).";
    $("passHint").style.display = "";
  } else {
    $("passHint").style.display = c.pass ? "none" : "";
  }
}
$("cfgKey").addEventListener("input", () => { S.keyDirty = true; S.keyClear = false; });
$("cfgPass").addEventListener("input", () => {
  if ($("cfgPass").value === "nodelink") {
    $("passHint").textContent = "Node still has the factory AP password — change it on the radio before field use (FIRMWARE.md).";
    $("passHint").style.display = "";
  } else {
    $("passHint").style.display = $("cfgPass").value ? "none" : "";
  }
});
$("cfgClearKey").onclick = () => {
  $("cfgKey").value = "";
  $("cfgKey").placeholder = "open mesh (no encryption)";
  S.keyClear = true; S.keyDirty = false;
};
$("cfgSave").onclick = () => {
  const cfg = {
    name: $("cfgName").value.trim() || "NODE", freq: parseFloat($("cfgFreq").value),
    sf: parseInt($("cfgSf").value), txp: parseInt($("cfgTx").value), pass: $("cfgPass").value,
    gpsRx: parseInt($("cfgGpsRx").value), gpsTx: parseInt($("cfgGpsTx").value), gpsPwr: parseInt($("cfgGpsPwr").value),
    gpsInt: parseInt($("cfgGpsInt").value) || 30,
  };
  if (S.keyClear) cfg.clearKey = true;
  else if (S.keyDirty) { const k = $("cfgKey").value; if (k) cfg.key = k; }
  send({ t: "setcfg", cfg });
};

function startDemo() {
  if (!window.exoAllowDemo || !window.exoAllowDemo()) { toast("DEMO DISABLED IN PROD"); return; }
  if (S.demo) { ensureGlobe(); return; }
  S.demo = true; closeWifi(); clearBle(); S.nodes = {}; $("chatLog").innerHTML = "";
  syncChatEmpty(); setPath("demo", true);
  const d = P.demoMesh();
  S.myId = d.me.id;
  $("hName").textContent = d.me.name;
  handle({ t: "cfg", cfg: d.cfg });
  let lat = d.me.lat, lon = d.me.lon, hdg = d.me.hdg;
  d.peers.forEach((p) => { S.nodes[p.id] = p; });
  d.ways.forEach((w) => { S.ways[w.id] = w; });
  d.chats.forEach(handle);
  handle({ t: "gps", g: { fix: 1, lat, lon, alt: 312, spd: 4.2, hdg, sats: 9 } });
  ensureGlobe().then(() => { if (S.globe) S.globe.recage(lat, lon); });
  S.demoTimers = [
    setInterval(() => {
      lat += 0.00006; hdg = (hdg + 3) % 360;
      handle({ t: "gps", g: { fix: 1, lat, lon, alt: 312, spd: 4.2, hdg, sats: 9 } });
      d.peers.forEach((p, i) => {
        S.nodes[p.id].lat = lat + p.dlat + Math.sin(Date.now() / 8000) * 0.002;
        S.nodes[p.id].last = Date.now() / 1000 - i * 18;
      });
      renderNodes();
    }, 1000),
    setInterval(() => {
      handle({ t: "telem", d: { batt: 90 - (S.batt.length % 9), vbat: 4.02, up: S.batt.length * 60 + 7300, heap: 214000, rssi: -72 - (Math.random() * 6 | 0), snr: 9.5, txp: 17, freq: "915.0" } });
    }, 1500),
    setInterval(() => {
      const p = d.peers[Math.random() * d.peers.length | 0];
      handle({ t: "chat", from: p.id, fromName: p.name, rssi: p.rssi, snr: 8, ts: Math.floor(Date.now() / 1000), text: P.DEMO_QUICK[Math.random() * 4 | 0] });
    }, 9000),
  ];
}
function demoSend(o) {
  if (o.t === "chat") {
    const id = "m" + Date.now();
    handle({ t: "chat", mine: true, msgId: id, text: o.text, to: o.to, toName: S.nodes[o.to] ? S.nodes[o.to].name : null, ts: Math.floor(Date.now() / 1000) });
    setTimeout(() => markAck(id), 900);
  }
  if (o.t === "setcfg") {
    const prev = S.lastCfg || {};
    const c = Object.assign({}, prev, o.cfg);
    if (o.cfg.clearKey) { c.key = ""; c.keySet = false; }
    else if (o.cfg.key) { c.key = o.cfg.key; c.keySet = true; }
    else { c.key = ""; c.keySet = !!prev.keySet; }
    delete c.clearKey;
    handle({ t: "cfg", cfg: c });
    handle({ t: "sys", msg: "RADIO RECONFIGURED" });
  }
  if (o.t === "sos" || o.t === "way" || o.t === "rf") handle(o);
}

let deferredPrompt = null;
function isiOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
function showInstallHow() { toast(isiOS() ? "SHARE → ADD TO HOME SCREEN" : "CHROME MENU → INSTALL APP"); }
function tryInstall() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; $("btnInst").style.display = "none"; }); return; }
  showInstallHow();
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; $("btnInst").style.display = ""; });
window.addEventListener("appinstalled", () => { deferredPrompt = null; $("btnInst").style.display = "none"; $("installHint").style.display = "none"; toast("INSTALLED"); });
$("btnInst").onclick = tryInstall;
$("btnInst2").onclick = tryInstall;
$("btnHintHide").onclick = () => { $("installHint").style.display = "none"; };
if (isStandalone()) $("installHint").style.display = "none";
if (isiOS() && !isStandalone()) $("installTxt").textContent = "Safari: Share → Add to Home Screen. Then open EXOpace and CONNECT → Bluetooth.";

(async function restore() {
  try {
    const chats = await ExoStore.all("chat");
    chats.slice(-40).forEach((m) => { if (m.t === "chat" || m.text) addMsg(m); });
    const ways = await ExoStore.all("ways");
    ways.forEach((w) => { if (w.id) S.ways[w.id] = w; });
    const rf = await ExoStore.all("rf");
    S.rf = rf.slice(-200);
  } catch (e) {}
})();

(function prodChrome() {
  ["optDemo", "optRemote", "remoteBox", "remoteUrl", "remoteGo"].forEach((id) => {
    const el = $(id);
    if (el) el.remove();
  });
  if (window.exoAllowDemo && window.exoAllowDemo()) {
    const sheet = document.querySelector("#sheet .sheet");
    const cancel = $("optCancel");
    if (sheet && cancel) {
      const b = document.createElement("button");
      b.className = "opt"; b.id = "optDemo";
      b.innerHTML = "<b>Demo</b><span>Earth + Memphis mesh — local DEV only</span>";
      b.onclick = () => { showSheet(false); startDemo(); };
      sheet.insertBefore(b, cancel);
    }
  }
})();

if (location.protocol === "https:") {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
if (location.hostname === "192.168.4.1") connectWifi();
else if (window.exoAllowDemo && window.exoAllowDemo()) {
  setTimeout(() => { if (!S.demo && S.mode === "off") startDemo(); }, 500);
}

if (location.hash === "#map") {
  const b = document.querySelector('nav button[data-s="map"]');
  if (b) b.click();
}

(function gateRangeCsv() {
  const onNode = location.hostname === "192.168.4.1" || location.hostname === P.WIFI.apHost;
  const card = $("rangeCard");
  const hint = $("rangeHint");
  if (!onNode) {
    if (hint) hint.textContent = "Range CSV lives on the node (join EXOpace-XXXX → http://192.168.4.1). Not served from exopace.net.";
    if ($("btnRangeCsv")) $("btnRangeCsv").style.display = "none";
    if ($("btnRangeCsv0")) $("btnRangeCsv0").style.display = "none";
  } else {
    if ($("btnRangeCsv")) $("btnRangeCsv").onclick = () => { location.href = "/range.csv"; };
    if ($("btnRangeCsv0")) $("btnRangeCsv0").onclick = () => { location.href = "/range0.csv"; };
  }
  if (card) card.dataset.node = onNode ? "1" : "0";
})();
