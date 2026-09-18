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
  stats: { packets: 0, byType: {}, linkUpAt: 0, lastPktAt: 0 },
  renaming: null, tapDrop: false, sos: null, sosTimer: null, sel: null,
  telemHist: [], unread: 0, lowBattWarned: {},
  nodeSel: null, nodeTime: null, nodeWatch: {},
  sort: "rssi", savedChatTo: null,
  events: [], rssiWarned: false,
  tz: "utc", seenMsg: {}, prevRssi: null, rssiTrend: "", stars: {}, tripArmed: false, navTarget: null, night: false, lastTx: 0, waySort: "newest", hdg: null, arriveR: 100, rssiHist: {},
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
  if (b.dataset.s === "chat") { S.unread = 0; syncBadge(); }
  if (b.dataset.s === "setup") renderAbout();
  if (S.globe) S.globe.setActive(b.dataset.s === "map");
  if (b.dataset.s === "setup") syncInstallHint();
  if (b.dataset.s === "map") {
    syncGlobe();
    ensureGlobe();
  }
});

function toast(t) { const e = $("toast"); e.textContent = t; e.style.opacity = 1; setTimeout(() => e.style.opacity = 0, 1800); }
function setPath(mode, up) {
  const prevUp = !!S.stats.linkUpAt;
  S.mode = mode;
  if (up) { if (!S.stats.linkUpAt) S.stats.linkUpAt = Date.now() / 1000; }
  else S.stats.linkUpAt = 0;
  if (up && !prevUp) logEvent("LINK", mode === "demo" ? "demo mode on" : "link up");
  else if (!up && prevUp) {
    logEvent("LINK", "link down");
    if (document.hidden) {
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      sysNotify("EXOpace LINK DOWN", "Radio link lost", "exo-link");
    }
  }
  $("hLink").classList.toggle("up", !!up);
  const c = $("btnConn"); const lbl = $("pathLbl");
  if (mode === "demo") { c.textContent = "DEV"; lbl.textContent = "DEV"; lbl.classList.add("up"); $("modeTag").textContent = "DEV"; }
  else if (up) { c.textContent = "LINK UP"; lbl.textContent = "LINK UP"; lbl.classList.add("up"); }
  else { c.textContent = "CONNECT"; lbl.textContent = "LINK DOWN"; lbl.classList.remove("up"); }
  c.classList.toggle("up", !!up);
  $("modeTag").style.display = mode === "demo" ? "inline-block" : "none";
  const hw = $("cfgHw");
  if (hw) hw.hidden = !up;
  const form = $("cfgForm");
  if (form) form.hidden = !up;
  const passHint = $("passHint");
  if (passHint) passHint.hidden = !up;
  const freqHint = $("freqHint");
  if (freqHint) freqHint.hidden = !up;
  const freq = $("hFreq");
  if (freq) { freq.hidden = !up; freq.style.display = up ? "" : "none"; }
  syncHeaderMeter();
  syncChatSend();
  syncMapChrome();
}
function showSheet(on) { $("sheet").classList.toggle("show", !!on); }
function syncChatEmpty() {
  const rows = [...$("chatLog").children];
  const q = $("chatSearch") ? $("chatSearch").value.trim() : "";
  const visible = rows.filter((el) => el.style.display !== "none").length;
  const e = $("chatEmpty");
  if (!rows.length) { e.textContent = "MESH QUIET. Wait for a peer."; e.style.display = ""; }
  else if (!visible && q) { e.textContent = "NO MATCHES."; e.style.display = ""; }
  else { e.style.display = "none"; }
}
function syncHeaderMeter() {
  const el = $("hMeter");
  if (!el) return;
  const up = !!($("pathLbl") && $("pathLbl").classList.contains("up"));
  el.hidden = !up;
  el.style.display = up ? "" : "none";
}
function syncChatSend() {
  const send = $("chatSend"), composer = $("composer"), empty = $("chatEmpty"), qtx = $("qtx");
  const up = radioUp();
  if (send) { send.hidden = !up; send.style.display = up ? "" : "none"; }
  if (composer) composer.hidden = !up;
  if (qtx) qtx.hidden = !up;
  if (empty) empty.textContent = up ? "MESH QUIET. TX or wait for a peer." : "MESH QUIET. Wait for a peer.";
}

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

async function attachBle(dev) {
  const gatt = await dev.gatt.connect();
  const svc = await gatt.getPrimaryService(BLE_SVC);
  const { notifyCh, writeCh } = await bindUart(svc);
  await notifyCh.startNotifications();
  notifyCh.oncharacteristicvaluechanged = (ev) => {
    onStreamChunk(new TextDecoder().decode(ev.target.value));
  };
  return writeCh;
}

async function reconnectBle(dev) {
  for (let i = 0; i < 5; i++) {
    await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    if (S.bleDev !== dev || S.demo) return;
    try {
      S.bleRx = await attachBle(dev);
      setPath("bt", true);
      logEvent("LINK", "BT reconnected");
      toast("BT RECONNECTED");
      return;
    } catch (e) {}
  }
  if (S.bleDev === dev) { S.bleDev = null; S.bleRx = null; }
  logEvent("LINK", "BT reconnect failed");
  toast("BT RETRY FAILED — TAP CONNECT");
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
    const writeCh = await attachBle(dev);
    stopDemo(); closeWifi();
    S.bleRx = writeCh; S.bleDev = dev; S.bleBuf = "";
    setPath("bt", true);
    syncInstallHint();
    logEvent("LINK", "BT connected " + (dev.name || ""));
    dev.addEventListener("gattserverdisconnected", () => {
      if (S.bleDev !== dev) return;
      S.bleRx = null;
      if (!S.demo) setPath("bt", false);
      logEvent("LINK", "BT disconnected — retrying");
      reconnectBle(dev);
    });
  } catch (e) {
    toast(picked ? "BT FAILED" : "BT CANCELLED");
    if (!S.demo && location.protocol !== "file:" && !(S.ws && (S.ws.readyState === 0 || S.ws.readyState === 1)))
      connectWifi();
  }
}
(function initBt() {
  if (navigator.bluetooth) return;
  $("optBle").disabled = true;
  $("btHint").textContent = window.isSecureContext
    ? "BLUETOOTH NOT AVAILABLE IN THIS BROWSER"
    : "NEEDS HTTPS OR ANDROID INSECURE-ORIGIN EXCEPTION";
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
  if (S.ws && S.ws.readyState === 1) { S.ws.send(j); return true; }
  if (S.bleRx) {
    const u8 = new TextEncoder().encode(j);
    const w = S.bleRx.writeValueWithoutResponse || S.bleRx.writeValue;
    w.call(S.bleRx, u8); return true;
  }
  if (S.demo) { demoSend(o); return true; }
  return false;
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
  S.stats.packets++;
  S.stats.byType[m.t] = (S.stats.byType[m.t] || 0) + 1;
  S.stats.lastPktAt = Date.now() / 1000;
  switch (m.t) {
    case "hello":
      S.myId = m.id; S.myName = m.name || m.id; $("hName").textContent = S.myName;
      $("chatLog").innerHTML = ""; syncChatEmpty(); break;
    case "cfg":
      fillCfg(m.cfg); S.myName = m.cfg.name; $("hName").textContent = m.cfg.name;
      $("hFreq").textContent = m.cfg.freq + " MHz · SF" + m.cfg.sf; break;
    case "chat":
      if (m.text == null && m.msg != null) m.text = m.msg;
      if (m.msgId && S.seenMsg[m.msgId]) break;
      if (m.msgId) {
        S.seenMsg[m.msgId] = 1;
        if (Object.keys(S.seenMsg).length > 500) S.seenMsg = { [m.msgId]: 1 };
      }
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
        ExoStore.put("tracks", { id: "trail", pts: S.trail });
        if (S.rangeOn) sampleRfHere();
        checkWaypoints();
      }
      break;
    case "telem":
      renderTelem(m.d || m); break;
    case "nodes":
      (m.list || []).forEach((n) => {
        S.nodes[n.id] = n; ExoStore.put("nodes", { ...n, id: n.id });
        if (n.rssi != null) {
          const h = S.rssiHist[n.id] || (S.rssiHist[n.id] = []);
          h.push(n.rssi);
          if (h.length > 40) h.shift();
        }
      });
      renderNodes(); break;
    case "sys":
      toast(m.msg); break;
    case "sos":
      addMsg({
        t: "chat",
        from: m.id,
        fromName: m.id,
        text: sosLine(m),
        ts: m.ts,
        mine: m.id === "me" || !m.id || (S.myId && m.id === S.myId),
      });
      S.ways[m.id] = { id: m.id, name: "SOS", lat: m.lat, lon: m.lon, kind: "sos" };
      toast("SOS"); syncGlobe();
      raiseSos(m);
      break;
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
      S.nodeTime = { epoch: m.epoch, mode: m.mode || "live", rate: m.rate != null ? m.rate : 1, at: Date.now() / 1000 };
      renderStats(); break;
  }
}

function sosLine(m) {
  const raw = String(m.msg == null ? "" : m.msg).trim();
  if (!raw || /^sos$/i.test(raw)) return "SOS";
  if (/^sos\b/i.test(raw)) return raw;
  return "SOS " + raw;
}
function sosVibrate() {
  if (navigator.vibrate) { try { navigator.vibrate([300, 100, 300]); } catch (e) {} }
}
function sysNotify(title, body, tag) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try { new Notification(title, { body, tag }); } catch (e) {}
  } else if (Notification.permission === "default") {
    Notification.requestPermission().then((p) => { if (p === "granted") sysNotify(title, body, tag); });
  }
}
function sosNotify(s) { sysNotify("EXOpace SOS", s.msg + " — " + s.id, "exo-sos"); }
function syncSosRange() {
  const el = $("sosRange");
  if (!el) return;
  const s = S.sos;
  if (!s || s.lat == null || s.lon == null || !S.gps || !S.gps.fix) { el.textContent = ""; return; }
  el.textContent = "(" + fmtRange(bearingDist(S.gps.lat, S.gps.lon, +s.lat, +s.lon)) + ")";
}
function raiseSos(m) {
  if (m.id === "me" || (S.myId && m.id === S.myId)) return;
  const s = { id: m.id, lat: m.lat, lon: m.lon, msg: sosLine(m), ts: m.ts || Math.floor(Date.now() / 1000), acked: false };
  S.sos = s;
  $("sosWho").textContent = s.id;
  $("sosMsg").textContent = s.msg;
  $("sosBanner").hidden = false;
  $("sosBanner").classList.remove("acked");
  $("sosAck").textContent = "ACK";
  sosVibrate();
  sosNotify(s);
  logEvent("SOS", "received from " + s.id);
  syncSosRange();
  if (S.sosTimer) clearInterval(S.sosTimer);
  S.sosTimer = setInterval(() => {
    if (S.sos && !S.sos.acked) { sosVibrate(); toast("SOS UNACKED"); }
  }, 30000);
}
function dismissSos() {
  if (S.sos) logEvent("SOS", "cleared");
  S.sos = null;
  if (S.sosTimer) { clearInterval(S.sosTimer); S.sosTimer = null; }
  $("sosBanner").hidden = true;
}
$("sosAck").onclick = () => {
  const s = S.sos; if (!s) return;
  s.acked = true;
  const text = "ACK — on the way";
  const went = send({ t: "chat", to: s.id, text, msg: text });
  if (!went) echoOwnChat(text, s.id);
  $("sosBanner").classList.add("acked");
  $("sosAck").textContent = "ACKED";
  if (S.sosTimer) { clearInterval(S.sosTimer); S.sosTimer = null; }
  setTimeout(() => { if (S.sos && S.sos.acked) dismissSos(); }, 4000);
};
$("sosNav").onclick = () => {
  const s = S.sos; if (!s) return;
  if (s.lat != null && s.lon != null && S.globe) S.globe.recage(s.lat, s.lon);
  if (s.lat != null && s.lon != null) setNav({ id: "sos-" + (s.id || "?"), name: "SOS " + (s.id || "peer"), lat: +s.lat, lon: +s.lon, kind: "sos" });
  const b = document.querySelector('nav button[data-s="map"]');
  if (b) b.click();
  toast("NAV SOS");
};
$("sosDismiss").onclick = dismissSos;
function isOwnMsg(m) {
  const from = m.from || m.id;
  return !!(m.mine || from === "me" || m.fromName === "me" || (S.myId && from === S.myId));
}
function dayKey(ts) {
  const d = new Date((ts || 0) * 1000);
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}
function dayLabel(ts) {
  const d = new Date(ts * 1000);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === yest.toDateString()) return "YESTERDAY";
  return d.toDateString().toUpperCase();
}
function parseCoord(t) {
  const m = String(t == null ? "" : t).match(/(-?\d{1,3}\.\d{3,})\s*(?:,|\s)\s*(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
  if (!isFinite(lat) || !isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
function addMsg(m) {
  const own = isOwnMsg(m);
  const d = document.createElement("div");
  d.className = "msg" + (own ? " mine" : ""); d.dataset.mid = m.msgId || "";
  d.dataset.ts = String(m.ts || "");
  d.dataset.text = chatText(m) || "";
  d.dataset.to = m.to || "*";
  const ts = m.ts ? fmtTs(m.ts) : "";
  let extra = "";
  if (m.ack) extra = '<span class="ok">✓ delivered</span>';
  else if (own && m.to && m.to !== "*") extra = '<span class="pend">pending</span>';
  else if (!own && m.rssi !== undefined && m.rssi !== null) extra = m.rssi + " dBm · " + m.snr + " dB";
  const meta = ts && extra ? ts + " · " + extra : (ts || extra);
  d.innerHTML = '<div class="who">' + esc(own ? "YOU" : (m.fromName || m.from)) + (m.to && m.to !== "*" ? " → " + esc(m.toName || m.to) : "") + "</div>"
    + '<div class="txt">' + esc(chatText(m)) + '</div><div class="meta">' + meta + "</div>";
  const metaEl = d.querySelector(".meta");
  metaEl.dataset.ts = ts;
  metaEl.dataset.extra = extra;
  let div = null;
  if (m.ts) {
    const last = $("chatLog").lastElementChild;
    const lastTs = last && last.dataset.ts ? parseInt(last.dataset.ts, 10) : 0;
    if (lastTs && dayKey(m.ts) !== dayKey(lastTs)) {
      div = document.createElement("div");
      div.className = "daydiv";
      div.textContent = "— " + dayLabel(m.ts) + " —";
      $("chatLog").appendChild(div);
    }
  }
  const c = parseCoord(chatText(m));
  if (c) {
    const b = document.createElement("button");
    b.className = "btn";
    b.style.cssText = "width:auto;min-width:0;padding:4px 8px;margin-top:6px;font-size:10px;letter-spacing:.08em";
    b.textContent = "ADD WAY " + c.lat.toFixed(4) + "," + c.lon.toFixed(4);
    b.onclick = () => { dropWaypointAt(c.lat, c.lon); b.disabled = true; };
    d.appendChild(b);
  }
  const nearBottom = $("chatLog").scrollTop + $("chatLog").clientHeight >= $("chatLog").scrollHeight - 60;
  $("chatLog").appendChild(d);
  const q = $("chatSearch") ? $("chatSearch").value.trim().toLowerCase() : "";
  if (q && !chatMatches(d, q)) { d.style.display = "none"; if (div) div.style.display = "none"; }
  syncChatEmpty();
  if (nearBottom) $("chatLog").scrollTop = 1e9;
  if (!own && !$("scr-chat").classList.contains("active")) { S.unread++; syncBadge(); }
  const dm = !own && m.to && m.to !== "*" && (m.to === S.myId || m.to === "me");
  if (dm) {
    if (navigator.vibrate) navigator.vibrate(80);
    if (document.hidden) sysNotify("EXOpace DM · " + (m.fromName || m.from || "peer"), chatText(m), "exo-dm");
  }
}
function syncBadge() {
  const b = $("chatBadge");
  if (!b) return;
  b.hidden = S.unread <= 0;
  b.textContent = S.unread > 99 ? "99+" : S.unread;
}
function markAck(id) {
  const e = document.querySelector('.msg[data-mid="' + id + '"] .meta');
  if (!e) return;
  const delivered = '<span class="ok">✓ delivered</span>';
  e.dataset.extra = delivered;
  e.innerHTML = (e.dataset.ts ? e.dataset.ts + " · " : "") + delivered;
  logEvent("ACK", "delivered");
}
function fmtTs(t) {
  const d = new Date(t * 1000);
  if (S.tz === "local") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) + " LCL";
  return d.toISOString().slice(11, 19) + " UTC";
}
function esc(s) { return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function saveUi() {
  try {
    localStorage.setItem("exopace-ui", JSON.stringify({
      pin: $("stPin").checked, trail: $("stTrail").checked, rings: $("stRings").checked, heat: $("stHeat").checked,
      sort: S.sort, chatTo: $("chatTo").value, tz: S.tz, stars: S.stars, navTarget: S.navTarget, night: S.night, waySort: S.waySort, arriveR: S.arriveR,
    }));
  } catch (e) {}
}
function loadUi() {
  let u = {};
  try { u = JSON.parse(localStorage.getItem("exopace-ui") || "{}") || {}; } catch (e) { u = {}; }
  if (u.pin != null) $("stPin").checked = !!u.pin;
  if (u.trail != null) $("stTrail").checked = !!u.trail;
  if (u.rings != null) $("stRings").checked = !!u.rings;
  if (u.heat != null) $("stHeat").checked = !!u.heat;
  if (u.sort) S.sort = u.sort;
  if (u.tz) S.tz = u.tz;
  if (u.stars && typeof u.stars === "object") S.stars = u.stars;
  if (u.navTarget && u.navTarget.lat != null) S.navTarget = u.navTarget;
  if (u.night) S.night = true;
  if (u.waySort) S.waySort = u.waySort;
  if (u.arriveR) S.arriveR = +u.arriveR;
  if (u.chatTo != null) S.savedChatTo = u.chatTo;
  if ($("btnTz")) $("btnTz").textContent = S.tz === "utc" ? "TIME UTC" : "TIME LCL";
}

function echoOwnChat(text, to) {
  handle({
    t: "chat",
    mine: true,
    from: S.myId || "me",
    fromName: S.myName || "YOU",
    text,
    msg: text,
    to,
    ts: Math.floor(Date.now() / 1000),
  });
}
function txGuard() {
  const now = Date.now();
  if (now - (S.lastTx || 0) < 700) return false;
  S.lastTx = now;
  return true;
}
$("chatSend").onclick = () => {
  if (!radioUp()) return;
  const t = $("chatText").value.trim(); if (!t) return;
  if (!txGuard()) return toast("HOLD ON — AIRTIME");
  const to = $("chatTo").value;
  const went = send({ t: "chat", to, text: t, msg: t });
  $("chatText").value = "";
  if (!went) echoOwnChat(t, to);
};
$("chatText").addEventListener("keydown", (e) => { if (e.key === "Enter") $("chatSend").click(); });
document.querySelectorAll("[data-qtx]").forEach((b) => {
  b.onclick = () => {
    const text = b.dataset.qtx;
    if (b.dataset.sos) {
      const g = S.gps;
      const note = ($("chatText") && $("chatText").value.trim()) || text;
      const pkt = P.makeSos({ id: S.myId || "me", lat: g && g.lat, lon: g && g.lon, msg: note });
      const went = send(pkt);
      handle(pkt);
      if ($("chatText")) $("chatText").value = "";
      logEvent("SOS", "sent " + (g && g.fix ? "with fix" : "no fix"));
      if (went) toast("SOS TX");
      else toast("SOS NOT SENT");
      return;
    }
    const to = $("chatTo").value;
    if (!txGuard()) return toast("HOLD ON — AIRTIME");
    if (!send({ t: "chat", to, text, msg: text })) echoOwnChat(text, to);
  };
});

function renderGps() {
  const g = S.gps;
  $("fixBadge").textContent = (g && g.fix) ? "FIX" : "WAITING FOR FIX";
  $("fixBadge").classList.toggle("on", !!(g && g.fix));
  if (g && g.fix) {
    $("posLL").textContent = g.lat.toFixed(5) + " / " + g.lon.toFixed(5);
    $("posSpd").textContent = (g.spd || 0).toFixed(1) + " mph";
    $("posAlt").textContent = Math.round(g.alt || 0) + " ft · " + (g.sats || 0) + " sat" + (g.hdop != null ? " · hdop " + (+g.hdop).toFixed(1) : "");
    $("needle").style.transform = "translate(-50%,-100%) rotate(" + (g.hdg || 0) + "deg)";
  }
  renderNodes();
  syncMapChrome();
  syncSosRange();
}
$("btnCopy").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  navigator.clipboard && navigator.clipboard.writeText(g.lat.toFixed(6) + "," + g.lon.toFixed(6)); toast("COPIED");
};
$("btnMaps").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  window.open("https://maps.google.com/?q=" + g.lat + "," + g.lon, "_blank");
};
function sharePoint(m) {
  const name = m.name || m.id || "EXOpace";
  const text = name + " — " + m.lat.toFixed(6) + "," + m.lon.toFixed(6) + " (EXOpace Radio)";
  const url = "https://maps.google.com/?q=" + m.lat + "," + m.lon;
  if (navigator.share) {
    navigator.share({ title: name, text, url }).catch(() => {});
  } else {
    navigator.clipboard && navigator.clipboard.writeText(text + " " + url);
    toast("COPIED");
  }
}
$("btnShare").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  sharePoint({ name: S.myName || "ME", lat: g.lat, lon: g.lon });
};
function download(name, text) {
  const blob = new Blob([text], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("btnExportChat").onclick = () => {
  const rows = [];
  document.querySelectorAll("#chatLog .msg").forEach((el) => {
    const who = (el.querySelector(".who") || {}).textContent || "";
    const txt = (el.querySelector(".txt") || {}).textContent || "";
    const meta = (el.querySelector(".meta") || {}).textContent || "";
    rows.push("[" + meta + "] " + who + ": " + txt);
  });
  const text = "EXOpace Radio chat log\n" + new Date().toISOString() + "\n\n" + rows.join("\n");
  download("exopace-chat.txt", text);
  toast("CHAT EXPORTED");
};
$("btnClearChat").onclick = () => {
  $("chatLog").innerHTML = "";
  ExoStore.clear("chat");
  syncChatEmpty();
  toast("CHAT CLEARED");
};
$("chatSearch").oninput = () => {
  const q = $("chatSearch").value.trim().toLowerCase();
  [...$("chatLog").children].forEach((el) => {
    el.style.display = chatMatches(el, q) ? "" : "none";
  });
  syncChatEmpty();
};
function chatMatches(el, q) {
  if (!q) return true;
  if (q[0] === "@") {
    const who = el.querySelector(".who");
    return (who ? who.textContent : "").toLowerCase().includes(q.slice(1));
  }
  return el.textContent.toLowerCase().includes(q);
}
$("chatLog").addEventListener("click", (e) => {
  const pend = e.target.closest(".pend");
  if (pend) { retryMsg(pend.closest(".msg")); return; }
  const txt = e.target.closest(".msg .txt");
  if (!txt) return;
  const t = txt.textContent;
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => toast("COPIED")).catch(() => {});
});
function retryMsg(el) {
  if (!el) return;
  const text = el.dataset.text || "";
  const to = el.dataset.to || "*";
  if (!text) return;
  if (!send({ t: "chat", to, text, msg: text })) return toast("LINK DOWN");
  el.remove();
  syncChatEmpty();
  toast("RETRY SENT");
  logEvent("CHAT", "retry to " + to);
}
$("btnTz").onclick = () => {
  S.tz = S.tz === "utc" ? "local" : "utc";
  $("btnTz").textContent = S.tz === "utc" ? "TIME UTC" : "TIME LCL";
  saveUi();
  [...$("chatLog").children].forEach((el) => {
    const raw = +el.dataset.ts;
    const meta = el.querySelector(".meta");
    if (!meta || !raw) return;
    const newTs = fmtTs(raw);
    const extra = meta.dataset.extra || "";
    meta.dataset.ts = newTs;
    meta.innerHTML = newTs && extra ? newTs + " · " + extra : (newTs || extra);
  });
  toast("TIME " + (S.tz === "utc" ? "UTC" : "LOCAL"));
};
$("wptImportFile").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const doc = new DOMParser().parseFromString(r.result, "application/xml");
      const wpts = [...doc.getElementsByTagName("wpt")];
      let n = 0;
      wpts.forEach((el) => {
        const lat = parseFloat(el.getAttribute("lat")), lon = parseFloat(el.getAttribute("lon"));
        if (!isFinite(lat) || !isFinite(lon)) return;
        const nameEl = el.getElementsByTagName("name")[0];
        const name = (nameEl && nameEl.textContent ? nameEl.textContent : "MARK").trim().slice(0, 24) || "MARK";
        const cmtEl = el.getElementsByTagName("cmt")[0];
        const note = (cmtEl && cmtEl.textContent ? cmtEl.textContent : "").trim().slice(0, 80);
        const id = "w" + Date.now().toString(36) + n;
        const w = P.makeWay({ id, name, lat, lon, kind: "meet" });
        if (note) w.note = note;
        S.ways[id] = w; ExoStore.put("ways", w); n++;
      });
      renderWays(); syncGlobe();
      toast(n ? "IMPORTED " + n + " WAYPOINTS" : "NO WAYPOINTS IN FILE");
      if (n) logEvent("WAY", "imported " + n + " from GPX");
    } catch (err) { toast("BAD GPX FILE"); }
    e.target.value = "";
  };
  r.readAsText(f);
};
$("btnGpx").onclick = () => {
  const wpts = Object.keys(S.ways).map((i) => {
    const w = S.ways[i];
    return '  <wpt lat="' + w.lat + '" lon="' + w.lon + '"><name>' + esc(w.name) + "</name><desc>" + esc(w.kind) + "</desc>"
      + (w.note ? "<cmt>" + esc(w.note) + "</cmt>" : "") + "</wpt>";
  }).join("\n");
  const trk = S.trail.length > 1
    ? '  <trk><name>EXOpace trail</name><trkseg>\n' + S.trail.map((p) =>
        '    <trkpt lat="' + p[0] + '" lon="' + p[1] + '"><time>' + new Date(p[2] * 1000).toISOString() + "</time></trkpt>"
      ).join("\n") + "\n  </trkseg></trk>"
    : "";
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="EXOpace Radio" xmlns="http://www.topografix.com/GPX/1/1">\n'
    + wpts + (wpts && trk ? "\n" : "") + trk + "\n</gpx>\n";
  download("exopace.gpx", xml);
  toast("GPX EXPORTED");
};
$("btnSendTrack").onclick = () => {
  if (S.trail.length < 2) return toast("NO TRAIL");
  send(P.makeTrack({ id: S.myId || "me", pts: S.trail }));
  toast("TRACK TX");
};
$("btnTripReset").onclick = () => {
  if (!S.trail.length) return toast("NO TRAIL");
  if (!S.tripArmed) {
    S.tripArmed = true;
    $("btnTripReset").classList.add("primary");
    toast("TAP AGAIN TO CLEAR TRAIL");
    setTimeout(() => { S.tripArmed = false; $("btnTripReset").classList.remove("primary"); }, 4000);
    return;
  }
  S.tripArmed = false;
  $("btnTripReset").classList.remove("primary");
  S.trail = [];
  ExoStore.put("tracks", { id: "trail", pts: [] });
  syncGlobe(); renderStats();
  toast("TRIP RESET");
  logEvent("NAV", "trip reset");
};
$("btnTelemCsv").onclick = () => {
  if (!S.telemHist.length) return toast("NO TELEMETRY");
  const rows = S.telemHist.map((s) => new Date(s.ts * 1000).toISOString() + "," + (s.batt ?? "") + "," + (s.rssi ?? ""));
  download("exopace-telemetry.csv", "time,batt,rssi\n" + rows.join("\n"));
  toast("TELEMETRY CSV");
};
$("btnSendLoc").onclick = () => {
  const g = S.gps;
  if (!g || !g.fix) return toast("WAITING FOR FIX");
  const to = $("chatTo") ? $("chatTo").value : "*";
  const text = "POS " + (+g.lat).toFixed(5) + ", " + (+g.lon).toFixed(5);
  const went = send({ t: "chat", to, text, msg: text });
  if (!went) { echoOwnChat(text, to); return toast("NOT LINKED"); }
  logEvent("CHAT", "pos to " + to);
  toast("POSITION SENT");
};
$("btnWay").onclick = () => {
  const g = S.gps; if (!g || !g.fix) return toast("WAITING FOR FIX");
  dropWaypointAt(g.lat, g.lon);
};
function dropWaypointAt(lat, lon) {
  const id = "w" + Date.now().toString(36);
  const w = P.makeWay({ id, name: "MARK", lat, lon, kind: $("wayKind").value || "meet" });
  send(w); handle(w); toast("WAYPOINT");
  logEvent("WAY", "dropped " + w.name + " (" + w.kind + ")");
}
$("btnTapDrop").onclick = () => {
  S.tapDrop = !S.tapDrop;
  $("btnTapDrop").classList.toggle("primary", S.tapDrop);
  toast(S.tapDrop ? "TAP DROP ON — tap the globe" : "TAP DROP OFF");
};

async function ensureGlobe() {
  if (S.globe) { S.globe.setActive(true); syncGlobe(); return; }
  if (!window.THREE || !window.ExoGlobe) { toast("GLOBE ENGINE MISSING"); return; }
  try {
    S.globe = new ExoGlobe();
    await S.globe.mount($("globeC"));
    S.globe.onPick = (m, cx, cy) => {
      if (S.tapDrop) {
        const p = S.globe.pickLatLon(cx, cy);
        if (p) { dropWaypointAt(p.lat, p.lon); S.tapDrop = false; $("btnTapDrop").classList.remove("primary"); }
        return;
      }
      showDossier(m);
    };
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
    pts.push({ kind: w.kind === "sos" ? "sos" : "way", id: w.id, lat: w.lat, lon: w.lon, name: w.name, wayKind: w.kind, note: w.note, ts: wayTs(w), conf: 1 });
  });
  if ($("stPin").checked) pts.push({ kind: "st", lat: P.STATION.lat, lon: P.STATION.lon, name: "STATION", id: "STATION", conf: 1 });
  return pts;
}
function syncGlobe() {
  const pts = collectPts();
  if (S.globe) {
    S.globe.setMarkers(pts);
    S.globe.setTrail(S.trail, $("stTrail").checked);
    S.globe.setHeat($("stHeat").checked ? S.rf : []);
    S.globe.setRings(
      $("stRings").checked && S.gps && S.gps.fix ? S.gps.lat : null,
      $("stRings").checked && S.gps && S.gps.fix ? S.gps.lon : null,
      [5, 10, 25],
    );
    if (S.navTarget && S.navTarget.lat != null && S.navTarget.lon != null) {
      S.globe.setRing(+S.navTarget.lat, +S.navTarget.lon, (S.arriveR || 100) / 1000, 0xffb454);
    }
  }
  const noMe = !(S.gps && S.gps.fix);
  const noPeer = !Object.keys(S.nodes).some((i) => S.nodes[i].lat != null);
  const wc = Object.keys(S.ways).length;
  const wcEl = $("wpCount");
  if (wcEl) { wcEl.hidden = !wc; wcEl.textContent = wc + " waypoint" + (wc > 1 ? "s" : ""); }
  $("mapEmpty").textContent = [
    noMe ? "WAITING FOR FIX — walk outside" : "",
    noPeer ? "MESH QUIET — peer dots appear when nodes report position." : "",
  ].filter(Boolean).join("\n");
}
function bearingDist(lat1, lon1, lat2, lon2) {
  const R = 6371e3, toR = Math.PI / 180;
  const p1 = lat1 * toR, p2 = lat2 * toR;
  const dp = (lat2 - lat1) * toR, dl = (lon2 - lon1) * toR;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const distM = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  const brg = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return { distM, brg };
}
function fmtRange(bd) {
  if (!bd) return "—";
  const d = bd.distM < 1000 ? Math.round(bd.distM) + " m" : (bd.distM / 1000).toFixed(2) + " km";
  return d + " · " + Math.round(bd.brg) + "°";
}
function showDossier(m) {
  const tip = $("mapTip");
  if (!m) { tip.style.display = "none"; S.sel = null; return; }
  S.sel = m;
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
    m.note ? ("NOTE " + m.note) : "",
    m.ver ? ("FW " + m.ver) : "",
    m.ts ? ("CREATED " + fmtTs(m.ts)) : "",
  ].filter(Boolean);
  if (S.gps && S.gps.fix && m.lat != null && m.lon != null) {
    const bd = bearingDist(S.gps.lat, S.gps.lon, m.lat, m.lon);
    lines.push("RANGE " + (bd.distM / 1000).toFixed(2) + " km · BRG " + Math.round(bd.brg) + "°");
  }
  let acts = "";
  if (m.lat != null && m.lon != null) {
    acts = '<div class="tipActs"><button class="btn" id="tipNav">NAV</button><button class="btn" id="tipShare">SHARE</button></div>';
  }
  tip.innerHTML = '<div class="tipTxt">' + esc(lines.join("\n")) + "</div>" + acts;
  if (m.kind === "peer" && S.rssiHist[m.id] && S.rssiHist[m.id].length > 1) {
    tip.innerHTML += '<canvas id="rssiSpark" width="140" height="36" style="width:140px;height:36px;margin-top:6px"></canvas>';
    drawSpark($("rssiSpark"), S.rssiHist[m.id], -140, -60);
  }
  tip.style.display = "block";
}
$("mapTip").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || !S.sel) return;
  if (b.id === "tipNav") {
    if (S.globe) S.globe.recage(S.sel.lat, S.sel.lon);
    toast("NAV");
  } else if (b.id === "tipShare") {
    sharePoint(S.sel);
  }
});
$("stPin").onchange = () => { saveUi(); syncGlobe(); };
$("stTrail").onchange = () => { saveUi(); syncGlobe(); };
$("stRings").onchange = () => { saveUi(); syncGlobe(); };
$("stHeat").onchange = () => { saveUi(); syncGlobe(); };
$("btnSort").onclick = () => {
  S.sort = S.sort === "rssi" ? "name" : S.sort === "name" ? "batt" : S.sort === "batt" ? "newest" : "rssi";
  saveUi(); renderNodes();
};
$("btnWaySort").onclick = () => {
  S.waySort = S.waySort === "dist" ? "name" : S.waySort === "name" ? "newest" : "dist";
  if (S.waySort === "dist" && !(S.gps && S.gps.fix)) toast("DISTANCE NEEDS A FIX");
  saveUi(); renderWays();
};
let waysArmed = false;
$("btnWaysClear").onclick = () => {
  if (!Object.keys(S.ways).length) return toast("NO WAYPOINTS");
  if (!waysArmed) {
    waysArmed = true;
    $("btnWaysClear").classList.add("primary");
    toast("TAP AGAIN TO DELETE ALL");
    setTimeout(() => { waysArmed = false; $("btnWaysClear").classList.remove("primary"); }, 4000);
    return;
  }
  waysArmed = false;
  $("btnWaysClear").classList.remove("primary");
  const n = Object.keys(S.ways).length;
  Object.keys(S.ways).forEach((k) => ExoStore.del("ways", k));
  S.ways = {};
  renderWays(); syncGlobe();
  toast("ALL WAYPOINTS DELETED");
  logEvent("WAY", "deleted all (" + n + ")");
};
$("btnNodesCsv").onclick = () => {
  const rows = Object.keys(S.nodes).map((i) => {
    const n = P.applyPresence(S.nodes[i]);
    return [i, n.name || "", n.rssi ?? "", n.snr ?? "", n.batt ?? "", n.lat ?? "", n.lon ?? "", n.last ? new Date(n.last * 1000).toISOString() : ""].join(",");
  });
  if (!rows.length) return toast("NO NODES");
  download("exopace-nodes.csv", "id,name,rssi,snr,batt,lat,lon,last\n" + rows.join("\n"));
  toast("NODES CSV");
};
$("btnRecage").onclick = () => {
  if (!S.gps || !S.gps.fix) { toast("WAITING FOR FIX"); return; }
  if (!S.globe) return;
  S.globe.recage(S.gps.lat, S.gps.lon);
  toast("RECAGE");
};
function radioUp() { return !!($("pathLbl") && $("pathLbl").classList.contains("up")); }
function syncMapChrome() {
  const up = radioUp();
  const hasFix = !!(S.gps && S.gps.fix);
  const range = $("btnRange");
  if (range) {
    if (!up && S.rangeOn) { S.rangeOn = false; range.classList.remove("primary"); }
    range.hidden = !up;
    range.style.display = up ? "" : "none";
  }
  const way = $("btnWay");
  const kind = $("wayKind");
  if (way) { way.hidden = !hasFix; way.style.display = hasFix ? "" : "none"; }
  if (kind) { kind.hidden = !hasFix; kind.style.display = hasFix ? "" : "none"; }
  const copy = $("btnCopy");
  const share = $("btnShare");
  const maps = $("btnMaps");
  const mapsHint = $("mapsHint");
  if (copy) { copy.hidden = !hasFix; copy.style.display = hasFix ? "" : "none"; }
  if (share) { share.hidden = !hasFix; share.style.display = hasFix ? "" : "none"; }
  if (maps) { maps.hidden = !hasFix; maps.style.display = hasFix ? "" : "none"; }
  if (mapsHint) mapsHint.hidden = !hasFix;
  const compass = $("compass");
  if (compass) compass.hidden = !hasFix;
  const ll = $("posLL");
  const meta = $("posMeta");
  if (ll) { ll.hidden = !hasFix; ll.style.display = hasFix ? "" : "none"; }
  if (meta) { meta.hidden = !hasFix; meta.style.display = hasFix ? "" : "none"; }
}
$("btnRange").onclick = () => {
  if (!radioUp()) return;
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
function checkWaypoints() {
  const g = S.gps;
  if (!g || !g.fix) return;
  Object.keys(S.ways).forEach((i) => {
    const w = S.ways[i];
    if (w.lat == null || w.lon == null) return;
    const d = bearingDist(g.lat, g.lon, +w.lat, +w.lon).distM;
    const r = S.arriveR || 100;
    if (d < r && !w.arrived) {
      w.arrived = true;
      toast("ARRIVED · " + w.name);
      logEvent("NAV", "arrived " + w.name);
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } else if (d > r * 2.5 && w.arrived) {
      w.arrived = false;
    }
  });
}
function watchNodes() {
  const now = Date.now() / 1000;
  Object.keys(S.nodes).forEach((i) => {
    const n = P.applyPresence(S.nodes[i], now);
    const label = n.name || i;
    if (n.quiet) {
      if (!S.nodeWatch[i]) { S.nodeWatch[i] = true; toast("NODE LOST · " + label); sysNotify("EXOpace NODE LOST", label, "exo-node-" + i); logEvent("NODE", "lost " + label); }
    } else if (S.nodeWatch[i]) {
      S.nodeWatch[i] = false;
      toast("NODE BACK · " + label);
      logEvent("NODE", "back " + label);
    }
  });
}
function tickClock() {
  const d = new Date();
  $("vClock").textContent = d.toISOString().slice(11, 19) + " UTC";
  const nt = S.nodeTime;
  if (nt && nt.epoch != null) {
    const off = Math.round(nt.epoch - Date.now() / 1000);
    $("vClockOff").textContent = "node " + (off > 0 ? "+" : "") + off + "s · " + nt.mode;
  } else {
    $("vClockOff").textContent = "node time not synced";
  }
}
function logEvent(type, text) {
  const ev = { ts: Date.now() / 1000, type, text };
  S.events.push(ev);
  if (S.events.length > 200) S.events.shift();
  ExoStore.put("sys", ev);
  renderEvents();
}
function renderEvents() {
  const el = $("evLog");
  if (!el) return;
  if (!S.events.length) { el.innerHTML = '<div class="sub">No events yet.</div>'; return; }
  el.innerHTML = S.events.slice(-60).reverse().map((e) =>
    '<div class="evline"><span class="evt">' + esc(e.type) + '</span>' + esc(e.text) + '<span class="evago">' + ago(e.ts) + '</span></div>'
  ).join("");
}
$("btnEvExport").onclick = () => {
  if (!S.events.length) return toast("NO EVENTS");
  const rows = S.events.map((e) => new Date(e.ts * 1000).toISOString() + " [" + e.type + "] " + e.text);
  download("exopace-log.txt", "EXOpace Radio event log\n" + new Date().toISOString() + "\n\n" + rows.join("\n"));
  toast("LOG EXPORTED");
};
$("btnEvClear").onclick = () => {
  S.events = []; ExoStore.clear("sys"); renderEvents(); toast("LOG CLEARED");
};
function renderAbout() {
  if (!$("aboutVer")) return;
  const src = (document.querySelector('script[src*="app.js"]') || {}).src || "";
  const m = src.match(/app\.js\?v=(\d+)/);
  $("aboutVer").textContent = "EXOpace Radio v" + (m ? m[1] : "?") + " · protocol " + P.PROTOCOL_VER;
  $("aboutStore").textContent = [
    "chat " + $("chatLog").children.length,
    "ways " + Object.keys(S.ways).length,
    "nodes " + Object.keys(S.nodes).length,
    "rf " + S.rf.length,
    "telem " + S.telemHist.length,
    "events " + S.events.length,
  ].join(" · ");
}
$("btnAbout").onclick = () => { renderAbout(); toast("REFRESHED"); };
function applyNight() {
  document.body.classList.toggle("night", !!S.night);
  if ($("btnNight")) $("btnNight").classList.toggle("primary", !!S.night);
}
$("arriveR").onchange = () => {
  S.arriveR = +$("arriveR").value || 100;
  saveUi();
  toast("ARRIVAL " + S.arriveR + " m");
};
$("btnNight").onclick = () => {
  S.night = !S.night;
  saveUi(); applyNight();
  toast(S.night ? "NIGHT MODE ON" : "NIGHT MODE OFF");
};
$("btnBackup").onclick = () => {
  let ui = {};
  try { ui = JSON.parse(localStorage.getItem("exopace-ui") || "{}") || {}; } catch (e) { ui = {}; }
  download("exopace-backup.json", JSON.stringify({
    app: "exopace-radio", v: 1, ts: new Date().toISOString(),
    ways: S.ways, stars: S.stars, ui,
  }, null, 2));
  toast("BACKUP EXPORTED");
  logEvent("CFG", "backup exported");
};
$("backupFile").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    let d;
    try { d = JSON.parse(r.result); } catch (err) { return toast("BAD JSON"); }
    if (!d || d.app !== "exopace-radio") return toast("NOT A BACKUP");
    let n = 0;
    if (d.ways && typeof d.ways === "object") {
      Object.keys(d.ways).forEach((k) => {
        const w = d.ways[k];
        if (w && w.id && w.lat != null && w.lon != null) { S.ways[w.id] = w; ExoStore.put("ways", w); n++; }
      });
    }
    if (d.stars && typeof d.stars === "object") Object.assign(S.stars, d.stars);
    saveUi();
    renderWays(); renderNodes();
    toast("RESTORED " + n + " WAY");
    logEvent("CFG", "restore " + n + " way");
    e.target.value = "";
  };
  r.readAsText(f);
};
function nearestWay() {
  const g = S.gps;
  if (!g || !g.fix) return null;
  let best = null;
  Object.keys(S.ways).forEach((i) => {
    const w = S.ways[i];
    if (w.lat == null || w.lon == null) return;
    const bd = bearingDist(g.lat, g.lon, +w.lat, +w.lon);
    if (!best || bd.distM < best.distM) best = { name: w.name || i, distM: bd.distM, brg: bd.brg };
  });
  return best;
}
function renderStats() {
  const s = S.stats;
  $("stPkts").textContent = s.packets;
  $("stNodes").textContent = Object.keys(S.nodes).length;
  $("stUp").textContent = s.linkUpAt ? fmtUp(Date.now() / 1000 - s.linkUpAt) : "—";
  $("stLast").textContent = s.lastPktAt ? ago(s.lastPktAt) + " ago" : "—";
  const nt = S.nodeTime;
  if (nt && nt.epoch != null) {
    const off = Math.round(nt.epoch - Date.now() / 1000);
    $("stClock").textContent = (off > 0 ? "+" : "") + off + "s";
    $("stTime").textContent = nt.mode + (nt.rate && nt.rate !== 1 ? " " + nt.rate + "×" : "");
  } else {
    $("stClock").textContent = "—";
    $("stTime").textContent = "—";
  }
  const top = Object.keys(s.byType).sort((a, b) => s.byType[b] - s.byType[a]).slice(0, 5)
    .map((k) => k + " " + s.byType[k]).join(" · ");
  $("stByType").textContent = top ? top : "no packets yet";
  const near = nearestPeer();
  $("stNearest").textContent = near
    ? "nearest " + near.name + " · " + (near.distM / 1000).toFixed(2) + " km · BRG " + Math.round(near.brg) + "°"
    : "nearest —";
  const nw = nearestWay();
  $("stNearestWay").textContent = nw
    ? "nearest way " + nw.name + " · " + (nw.distM < 1000 ? Math.round(nw.distM) + " m" : (nw.distM / 1000).toFixed(2) + " km") + " · BRG " + Math.round(nw.brg) + "°"
    : "nearest way —";
  $("stTrip").textContent = fmtTrip();
}
function tripStats() {
  const t = S.trail;
  let dist = 0, maxD = 0;
  for (let i = 1; i < t.length; i++) {
    const d = bearingDist(t[i - 1][0], t[i - 1][1], t[i][0], t[i][1]).distM;
    dist += d;
  }
  if (t.length > 1) {
    const s0 = t[0];
    for (let i = 1; i < t.length; i++) {
      const d = bearingDist(s0[0], s0[1], t[i][0], t[i][1]).distM;
      if (d > maxD) maxD = d;
    }
  }
  const dur = t.length > 1 ? Math.max(0, t[t.length - 1][2] - t[0][2]) : 0;
  return { distM: dist, durS: dur, avgMps: dur > 0 ? dist / dur : 0, maxM: maxD };
}
function fmtTrip() {
  if (S.trail.length < 2) return "trip —";
  const s = tripStats();
  const d = s.distM < 1000 ? Math.round(s.distM) + " m" : (s.distM / 1000).toFixed(2) + " km";
  const m = Math.floor(s.durS / 60);
  const mx = s.maxM < 1000 ? Math.round(s.maxM) + " m" : (s.maxM / 1000).toFixed(2) + " km";
  return "trip " + d + " · " + m + "m · avg " + s.avgMps.toFixed(1) + " m/s · max " + mx;
}
function nearestPeer() {
  const g = S.gps;
  if (!g || !g.fix) return null;
  let best = null;
  Object.keys(S.nodes).forEach((i) => {
    const n = S.nodes[i];
    if (n.lat == null || n.lon == null) return;
    const bd = bearingDist(g.lat, g.lon, +n.lat, +n.lon);
    if (!best || bd.distM < best.distM) best = { name: n.name || i, distM: bd.distM, brg: bd.brg };
  });
  return best;
}
function renderNodes() {
  const ids = Object.keys(S.nodes).sort((a, b) => {
    const sa = S.stars[a] ? 1 : 0, sb = S.stars[b] ? 1 : 0;
    if (sa !== sb) return sb - sa;
    const A = P.applyPresence(S.nodes[a]), B = P.applyPresence(S.nodes[b]);
    if (S.sort === "name") return String(A.name || a).localeCompare(String(B.name || b));
    if (S.sort === "batt") return (B.batt == null ? -1 : B.batt) - (A.batt == null ? -1 : A.batt);
    if (S.sort === "newest") return (B.last || 0) - (A.last || 0);
    return (B.rssi == null ? -999 : B.rssi) - (A.rssi == null ? -999 : A.rssi);
  });
  const sel = $("chatTo"); const cur = sel.value !== "*" ? sel.value : (S.savedChatTo || "*");
  sel.innerHTML = '<option value="*">ALL</option>' + ids.map((i) => '<option value="' + i + '">' + esc(S.nodes[i].name || i) + "</option>").join("");
  sel.value = [...sel.options].some((o) => o.value === cur) ? cur : "*";
  const labels = { rssi: "SIGNAL", name: "NAME", batt: "BATTERY", newest: "NEWEST" };
  if ($("btnSort")) $("btnSort").textContent = "SORT · " + (labels[S.sort] || "SIGNAL");
  $("nodeList").innerHTML = ids.length ? ids.map((i) => {
    const n = P.applyPresence(S.nodes[i]);
    const fade = Math.round(n.conf * 100);
    warnBatt(n.name || i, n.batt);
    const acts = S.nodeSel === i
      ? '<div class="row" style="flex:1 0 100%;gap:6px;margin-top:8px">'
        + '<button class="btn" data-nact="nav" data-nid="' + i + '" style="width:auto;min-width:52px">NAV</button>'
        + '<button class="btn" data-nact="share" data-nid="' + i + '" style="width:auto;min-width:52px">SHARE</button>'
        + '<button class="btn" data-nact="info" data-nid="' + i + '" style="width:auto;min-width:52px">INFO</button>'
        + '<button class="btn" data-nact="msg" data-nid="' + i + '" style="width:auto;min-width:52px">MSG</button>'
        + '<button class="btn" data-nact="star" data-nid="' + i + '" style="width:auto;min-width:52px">' + (S.stars[i] ? "★" : "☆") + "</button>"
        + "</div>"
      : "";
    return '<div class="card node" data-nid="' + i + '" style="opacity:' + (0.35 + 0.65 * n.conf) + ';flex-wrap:wrap">'
      + '<div><div class="nm">' + esc(n.name || "?") + (S.stars[i] ? " ★" : "") + '</div><div class="id">' + i + " · " + fade + "%</div></div>"
      + '<div class="st">' + ago(n.last) + " ago<br>" + (n.batt != null ? n.batt + "%" : "") + "</div>" + bars(n.rssi ?? -140)
      + acts + "</div>";
  }).join("") : '<div class="card sub">MESH QUIET. Power up a second node — it announces itself.</div>';
  renderWays();
  renderStats();
  syncGlobe();
}
function wayTs(w) {
  if (w.ts) return +w.ts;
  const n = parseInt(String(w.id || "").slice(1), 36);
  return isFinite(n) ? n : 0;
}
function renderWays() {
  const el = $("wayList");
  if (!el) return;
  const ids = Object.keys(S.ways);
  const fix = S.gps && S.gps.fix;
  if (S.waySort === "dist" && fix) {
    const d = (i) => {
      const w = S.ways[i];
      return w.lat == null ? Infinity : bearingDist(S.gps.lat, S.gps.lon, +w.lat, +w.lon).distM;
    };
    ids.sort((a, b) => d(a) - d(b));
  } else if (S.waySort === "name") {
    ids.sort((a, b) => String(S.ways[a].name || "").localeCompare(String(S.ways[b].name || "")));
  } else {
    ids.sort((a, b) => wayTs(S.ways[b]) - wayTs(S.ways[a]));
  }
  const wayLbl = $("btnWaySort");
  if (wayLbl) wayLbl.textContent = "SORT · " + (S.waySort === "dist" ? "DISTANCE" : S.waySort === "name" ? "NAME" : "NEWEST");
  el.innerHTML = ids.length ? ids.map((i) => {
    const w = S.ways[i];
    if (S.renaming === i) {
      return '<div class="card node" style="flex-wrap:wrap"><div style="flex:1 0 100%"><input id="wayName-' + i + '" class="wayName" maxlength="24" value="' + esc(w.name) + '"></div>'
        + '<div style="flex:1 0 100%;margin-top:6px"><input id="wayNote-' + i + '" class="wayName" maxlength="80" placeholder="note (optional)" value="' + esc(w.note || "") + '"></div>'
        + '<select id="wayKind-' + i + '" class="wayName" style="flex:1 0 100%;margin-top:6px">'
        + ["meet", "hazard", "cache", "home"].map((k) => '<option value="' + k + '"' + (w.kind === k ? " selected" : "") + ">" + k.toUpperCase() + "</option>").join("")
        + "</select>"
        + '<button class="btn" data-act="save" data-wid="' + i + '" style="width:auto;min-width:64px;margin-top:6px">SAVE</button></div>';
    }
    const sub = esc(w.kind) + (w.note ? " · " + esc(w.note) : "") + (S.gps && S.gps.fix && w.lat != null && w.lon != null ? " · " + fmtRange(bearingDist(S.gps.lat, S.gps.lon, +w.lat, +w.lon)) : "");
    return '<div class="card node"><div><div class="nm">' + esc(w.name) + '</div><div class="id">' + sub + '</div></div>'
      + '<div class="row" style="gap:6px;margin-left:auto">'
      + '<button class="btn" data-act="nav" data-wid="' + i + '" style="width:auto;min-width:56px">NAV</button>'
      + '<button class="btn" data-act="share" data-wid="' + i + '" style="width:auto;min-width:56px">SHARE</button>'
      + '<button class="btn" data-act="ren" data-wid="' + i + '" style="width:auto;min-width:56px">REN</button>'
      + '<button class="btn" data-act="del" data-wid="' + i + '" style="width:auto;min-width:56px">DEL</button>'
      + "</div></div>";
  }).join("") : '<div class="card sub">NO WAYPOINTS. Drop one from MAP when you have a fix.</div>';
}
$("wayList").addEventListener("click", (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.wid;
  if (!id) return;
  if (btn.dataset.act === "del") deleteWay(id);
  else if (btn.dataset.act === "ren") startRename(id);
  else if (btn.dataset.act === "save") saveRename(id);
  else if (btn.dataset.act === "nav") navToWay(id);
  else if (btn.dataset.act === "share") { const w = S.ways[id]; if (w) sharePoint(w); }
});
function setNav(t) {
  S.navTarget = t || null;
  saveUi();
  renderNavHud();
}
function startHeading() {
  if (!("DeviceOrientationEvent" in window)) return;
  const cb = (e) => {
    if (e.webkitCompassHeading != null) S.hdg = e.webkitCompassHeading;
    else if (e.alpha != null) S.hdg = (360 - e.alpha) % 360;
  };
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission().then((p) => { if (p === "granted") window.addEventListener("deviceorientation", cb); }).catch(() => {});
  } else {
    window.addEventListener("deviceorientation", cb);
  }
}
function renderNavHud() {
  const el = $("navHud");
  if (!el) return;
  const t = S.navTarget;
  if (!t) { el.hidden = true; return; }
  el.hidden = false;
  $("navName").textContent = t.name || "TARGET";
  if (S.gps && S.gps.fix && t.lat != null && t.lon != null) {
    const bd = bearingDist(S.gps.lat, S.gps.lon, +t.lat, +t.lon);
    if (S.hdg != null) {
      const rel = ((bd.brg - S.hdg + 540) % 360) - 180;
      $("navDist").textContent = fmtRange(bd) + " · HDG " + Math.round(S.hdg) + "°";
      $("navArrow").style.transform = "rotate(" + rel + "deg)";
    } else {
      $("navDist").textContent = fmtRange(bd);
      $("navArrow").style.transform = "rotate(" + bd.brg + "deg)";
    }
    if (bd.distM < 25) { toast("ARRIVED · " + (t.name || "TARGET")); logEvent("NAV", "arrived " + (t.name || t.id)); setNav(null); }
  } else {
    $("navDist").textContent = "waiting for fix";
    $("navArrow").style.transform = "rotate(0deg)";
  }
}
$("navStop").onclick = () => { setNav(null); toast("NAV STOPPED"); };
function navToWay(id) {
  const w = S.ways[id];
  if (!w) return;
  if (S.globe) S.globe.recage(w.lat, w.lon);
  const b = document.querySelector('nav button[data-s="map"]');
  if (b) b.click();
  setNav({ id: w.id, name: w.name, lat: w.lat, lon: w.lon, kind: w.kind });
  if (S.gps && S.gps.fix) {
    const bd = bearingDist(S.gps.lat, S.gps.lon, w.lat, w.lon);
    toast(w.name + " · " + (bd.distM / 1000).toFixed(2) + " km · BRG " + Math.round(bd.brg) + "°");
  } else {
    toast("NAV " + w.name);
  }
}
$("nodeList").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-nact]");
  if (btn) {
    const id = btn.dataset.nid;
    const n = S.nodes[id];
    if (!n) return;
      if (btn.dataset.nact === "nav") {
      if (n.lat != null && n.lon != null && S.globe) S.globe.recage(+n.lat, +n.lon);
      if (n.lat != null && n.lon != null) setNav({ id: id, name: n.name || id, lat: +n.lat, lon: +n.lon });
      const b = document.querySelector('nav button[data-s="map"]');
      if (b) b.click();
      toast("NAV " + (n.name || id));
    } else if (btn.dataset.nact === "share") {
      if (n.lat == null || n.lon == null) return toast("NO POSITION");
      sharePoint({ name: n.name || id, id, lat: +n.lat, lon: +n.lon });
    } else if (btn.dataset.nact === "info") {
      const b = document.querySelector('nav button[data-s="map"]');
      if (b) b.click();
      showDossier({
        kind: "peer", id, name: n.name, lat: n.lat != null ? +n.lat : null, lon: n.lon != null ? +n.lon : null,
        alt: n.alt, rssi: n.rssi, snr: n.snr, bat: n.batt, last: n.last, conf: P.applyPresence(n).conf,
      });
    } else if (btn.dataset.nact === "star") {
      if (S.stars[id]) delete S.stars[id]; else S.stars[id] = 1;
      saveUi(); renderNodes();
    } else if (btn.dataset.nact === "msg") {
      const b = document.querySelector('nav button[data-s="chat"]');
      if (b) b.click();
      const sel = $("chatTo");
      if ([...sel.options].some((o) => o.value === id)) sel.value = id;
      $("chatText").focus();
    }
    return;
  }
  const card = e.target.closest(".card[data-nid]");
  if (!card) return;
  const id = card.dataset.nid;
  S.nodeSel = S.nodeSel === id ? null : id;
  renderNodes();
});
function deleteWay(id) {
  const w = S.ways[id];
  delete S.ways[id];
  ExoStore.del("ways", id);
  renderWays(); syncGlobe();
  toast("WAYPOINT DELETED");
  logEvent("WAY", "deleted " + (w ? w.name : id));
}
function startRename(id) {
  S.renaming = id;
  renderWays();
}
function saveRename(id) {
  const ni = $("wayName-" + id);
  const no = $("wayNote-" + id);
  const nk = $("wayKind-" + id);
  const name = ni ? ni.value.trim() : "";
  const note = no ? no.value.trim() : "";
  if (S.ways[id]) {
    if (name) S.ways[id].name = name;
    S.ways[id].note = note;
    if (nk && nk.value) S.ways[id].kind = nk.value;
    ExoStore.put("ways", S.ways[id]);
    logEvent("WAY", "saved " + (S.ways[id].name || id));
  }
  S.renaming = null;
  renderWays(); syncGlobe();
}

function syncTelemEmpty(has) {
  const g = $("telemGrid"), e = $("telemEmpty");
  if (g) { g.hidden = !has; g.style.display = has ? "" : "none"; }
  if (e) e.style.display = has ? "none" : "";
}
function renderTelem(d) {
  syncTelemEmpty(true);
  $("vBatt").textContent = (d.batt ?? "-") + "%"; $("vVolt").textContent = (d.vbat ?? 0).toFixed(2) + " V";
  $("vUp").textContent = fmtUp(d.up); $("vHeap").textContent = "heap " + Math.round((d.heap || 0) / 1024) + " KB";
  $("vRssi").textContent = (d.rssi ?? "-") + " dBm " + rssiArrow(d.rssi); $("vSnr").textContent = "SNR " + (d.snr ?? "-") + " dB";
  $("vTx").textContent = (d.txp ?? "-") + " dBm"; $("vFreq").textContent = (d.freq ?? "-") + " MHz";
  const m = bars(d.rssi ?? -140); $("hMeter").outerHTML = m.replace('class="meter"', 'class="meter" id="hMeter"');
  syncHeaderMeter();
  S.batt.push(d.batt || 0); if (S.batt.length > 60) S.batt.shift();
  if (d.rssi != null) S.lastRssi = d.rssi;
  if (d.snr != null) S.lastSnr = d.snr;
  S.rssiSpark.push(d.rssi ?? -120); if (S.rssiSpark.length > 48) S.rssiSpark.shift();
  S.telemHist.push({ ts: Date.now() / 1000, batt: d.batt, rssi: d.rssi });
  if (S.telemHist.length > 120) S.telemHist.shift();
  ExoStore.put("telem", { id: "hist", samples: S.telemHist });
  warnBatt("NODE", d.batt);
  warnRssi(d.rssi);
  drawBatt(); drawRssiChart();
}
function rssiArrow(rssi) {
  if (rssi == null) return "";
  let a = "";
  if (S.prevRssi != null) {
    const d = rssi - S.prevRssi;
    if (d >= 2) a = "▲";
    else if (d <= -2) a = "▼";
  }
  S.prevRssi = rssi;
  return a;
}
function warnRssi(rssi) {
  if (rssi == null) return;
  if (rssi < -120) {
    if (!S.rssiWarned) { S.rssiWarned = true; toast("WEAK LINK · " + rssi + " dBm"); logEvent("RF", "weak link " + rssi + " dBm"); }
  } else if (rssi > -114) {
    S.rssiWarned = false;
  }
}
function warnBatt(id, batt) {
  if (batt == null) return;
  if (batt < 20) {
    if (!S.lowBattWarned[id]) { S.lowBattWarned[id] = true; toast("LOW BATTERY · " + id); }
  } else if (batt >= 25) {
    S.lowBattWarned[id] = false;
  }
}
function fmtUp(s) { s = s || 0; const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h + "h " + m + "m"; }
function syncChartEmpty(canvasId, emptyId, has) {
  const c = $(canvasId), e = $(emptyId);
  if (c) { c.hidden = !has; c.style.display = has ? "" : "none"; }
  if (e) e.style.display = has ? "none" : "";
}
function drawBatt() {
  const c = $("battChart"); if (!c) return;
  const has = S.batt.length > 0;
  syncChartEmpty("battChart", "battEmpty", has);
  if (!has) return;
  const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = "#ffb454"; x.lineWidth = 3; x.beginPath();
  S.batt.forEach((v, i) => {
    const px = i / (Math.max(S.batt.length - 1, 1)) * c.width, py = c.height - (v / 100) * c.height;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }); x.stroke();
}
function drawRssiChart() {
  const has = S.rssiSpark.length > 0;
  syncChartEmpty("rssiChart", "rssiEmpty", has);
drawRssiChart();
}
function drawSpark(c, data, lo, hi) {
  if (!c || !data || data.length < 2) return;
  const x = c.getContext("2d"); x.clearRect(0, 0, c.width, c.height);
  x.strokeStyle = "#7ee0ff"; x.lineWidth = 2; x.beginPath();
  data.forEach((v, i) => {
    const px = i / (Math.max(data.length - 1, 1)) * c.width;
    const py = c.height - ((v - (lo || -140)) / ((hi || -60) - (lo || -140))) * c.height;
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
    $("passHint").textContent = "Node still has the factory AP password — change it on the radio before field use.";
    $("passHint").style.display = "";
  } else {
    $("passHint").style.display = c.pass ? "none" : "";
  }
}
$("cfgKey").addEventListener("input", () => { S.keyDirty = true; S.keyClear = false; });
$("cfgPass").addEventListener("input", () => {
  if ($("cfgPass").value === "nodelink") {
    $("passHint").textContent = "Node still has the factory AP password — change it on the radio before field use.";
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
  const freq = parseFloat($("cfgFreq").value);
  const sf = parseInt($("cfgSf").value);
  const txp = parseInt($("cfgTx").value);
  const pass = $("cfgPass").value;
  const gpsInt = parseInt($("cfgGpsInt").value) || 30;
  const errs = [];
  if (!(freq >= 400 && freq <= 1000)) errs.push("frequency");
  if (!(sf >= 7 && sf <= 12)) errs.push("spreading factor");
  if (!(txp >= 2 && txp <= 22)) errs.push("TX power 2-22 dBm");
  if (pass && pass.length < 8) errs.push("AP password min 8");
  if (!(gpsInt >= 5 && gpsInt <= 300)) errs.push("GPS interval 5-300s");
  if (errs.length) return toast("CHECK " + errs[0].toUpperCase());
  const cfg = {
    name: $("cfgName").value.trim().slice(0, 12) || "NODE", freq: freq,
    sf: sf, txp: txp, pass: pass,
    gpsRx: parseInt($("cfgGpsRx").value), gpsTx: parseInt($("cfgGpsTx").value), gpsPwr: parseInt($("cfgGpsPwr").value),
    gpsInt: gpsInt,
  };
  if (S.keyClear) cfg.clearKey = true;
  else if (S.keyDirty) { const k = $("cfgKey").value; if (k) cfg.key = k; }
  toast("SAVED — RADIO REBOOTING");
  logEvent("CFG", "saved " + cfg.name + " · " + cfg.freq + " MHz SF" + cfg.sf);
  send({ t: "setcfg", cfg });
};
$("cfgRefresh").onclick = () => {
  send({ t: "getcfg" });
  toast("REFRESH REQUESTED");
};
$("btnCfgExport").onclick = () => {
  const c = S.lastCfg || {};
  const out = {
    name: c.name || $("cfgName").value.trim(),
    freq: c.freq != null ? c.freq : parseFloat($("cfgFreq").value),
    sf: c.sf != null ? c.sf : parseInt($("cfgSf").value),
    txp: c.txp != null ? c.txp : parseInt($("cfgTx").value),
    gpsInt: c.gpsInt != null ? c.gpsInt : parseInt($("cfgGpsInt").value),
    gpsRx: c.gpsRx != null ? c.gpsRx : parseInt($("cfgGpsRx").value),
    gpsTx: c.gpsTx != null ? c.gpsTx : parseInt($("cfgGpsTx").value),
    gpsPwr: c.gpsPwr != null ? c.gpsPwr : parseInt($("cfgGpsPwr").value),
  };
  download("exopace-config.json", JSON.stringify(out, null, 2));
  toast("CONFIG EXPORTED");
};
$("cfgImportFile").onchange = (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const c = JSON.parse(r.result);
      if (c.name != null) $("cfgName").value = String(c.name).slice(0, 12);
      if (c.freq != null) {
        const m = [...$("cfgFreq").options].find((o) => parseFloat(o.value) === +c.freq);
        if (m) $("cfgFreq").value = m.value;
      }
      if (c.sf != null && [...$("cfgSf").options].some((o) => +o.value === +c.sf)) $("cfgSf").value = String(c.sf);
      if (c.txp != null) $("cfgTx").value = c.txp;
      if (c.gpsInt != null) $("cfgGpsInt").value = c.gpsInt;
      if (c.gpsRx != null) $("cfgGpsRx").value = c.gpsRx;
      if (c.gpsTx != null) $("cfgGpsTx").value = c.gpsTx;
      if (c.gpsPwr != null) $("cfgGpsPwr").value = c.gpsPwr;
      toast("CONFIG LOADED — REVIEW + SAVE");
    } catch (err) { toast("BAD CONFIG FILE"); }
    e.target.value = "";
  };
  r.readAsText(f);
};

function startDemo() {
  if (!window.exoAllowDemo || !window.exoAllowDemo()) { return; }
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
const INSTALL_HINT_HIDE = "exopace-radio-hide-install";
function isiOS() { return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isStandalone() { return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true; }
function installHintDismissed() {
  try { return localStorage.getItem(INSTALL_HINT_HIDE) === "1"; } catch (e) { return false; }
}
function showInstallCard() {
  const card = $("installHint");
  if (!card) return;
  card.hidden = false;
  card.style.display = "";
  card.style.pointerEvents = "";
}
function hideInstallHint(persist) {
  const inst = $("btnInst2");
  const hideBtn = $("btnHintHide");
  showInstallCard();
  if (inst) {
    inst.hidden = true;
    inst.style.display = "none";
    inst.style.pointerEvents = "none";
  }
  if (hideBtn) {
    hideBtn.hidden = true;
    hideBtn.style.display = "none";
    hideBtn.style.pointerEvents = "none";
  }
  if (persist) {
    try { localStorage.setItem(INSTALL_HINT_HIDE, "1"); } catch (e) {}
  }
}
function syncInstallHint() {
  showInstallCard();
  if (installHintDismissed()) {
    hideInstallHint(false);
    return;
  }
  const hideBtn = $("btnHintHide");
  if (hideBtn) {
    hideBtn.hidden = false;
    hideBtn.style.display = "";
    hideBtn.style.pointerEvents = "";
  }
  const inst = $("btnInst2");
  if (inst) {
    const show = !!deferredPrompt && !isStandalone();
    inst.hidden = !show;
    inst.style.display = show ? "" : "none";
    inst.style.pointerEvents = show ? "" : "none";
  }
}
function showInstallHow() { toast(isiOS() ? "SHARE → ADD TO HOME SCREEN" : "CHROME MENU → INSTALL APP"); }
function tryInstall() {
  if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt.userChoice.finally(() => { deferredPrompt = null; }); return; }
  showInstallHow();
}
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; syncInstallHint(); });
window.addEventListener("appinstalled", () => { deferredPrompt = null; hideInstallHint(true); toast("INSTALLED"); });
if ($("btnInst")) $("btnInst").onclick = tryInstall;
$("btnInst2").onclick = tryInstall;
$("btnHintHide").onclick = () => { hideInstallHint(true); };
syncInstallHint();
if (isiOS() && !isStandalone()) $("installTxt").textContent = "Safari: Share → Add to Home Screen.";

renderNodes();
(async function restore() {
  try {
    const chats = await ExoStore.all("chat");
    chats.slice(-40).forEach((m) => { if (m.t === "chat" || m.text) addMsg(m); });
    const ways = await ExoStore.all("ways");
    ways.forEach((w) => { if (w.id) S.ways[w.id] = w; });
    const rf = await ExoStore.all("rf");
    S.rf = rf.slice(-200);
    const tracks = await ExoStore.all("tracks");
    const trail = tracks.find((t) => t.id === "trail");
    if (trail && Array.isArray(trail.pts)) S.trail = trail.pts.slice(-200);
    const telem = await ExoStore.all("telem");
    const hist = telem.find((t) => t.id === "hist");
    if (hist && Array.isArray(hist.samples)) {
      S.telemHist = hist.samples.slice(-120);
      S.batt = S.telemHist.map((s) => s.batt || 0).slice(-60);
      S.rssiSpark = S.telemHist.map((s) => (s.rssi == null ? -120 : s.rssi)).slice(-48);
      drawBatt(); drawRssiChart();
    }
    const sys = await ExoStore.all("sys");
    S.events = sys.slice(-200);
    renderEvents();
  } catch (e) {}
  renderNodes();
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
  if (!card) return;
  if (!onNode) {
    card.remove();
    return;
  }
  card.hidden = false;
  card.dataset.node = "1";
  if ($("btnRangeCsv")) $("btnRangeCsv").onclick = () => { location.href = "/range.csv"; };
  if ($("btnRangeCsv0")) $("btnRangeCsv0").onclick = () => { location.href = "/range0.csv"; };
})();

loadUi();
$("chatTo").onchange = () => { S.savedChatTo = $("chatTo").value; saveUi(); };
drawBatt();
drawSpark($("rssiChart"), S.rssiSpark, -140, -60);
syncMapChrome();
syncChatSend();
syncBadge();
tickClock();
renderAbout();
applyNight();
if ($("arriveR")) $("arriveR").value = String(S.arriveR);
startHeading();
renderNavHud();
setInterval(renderStats, 1000);
setInterval(renderNavHud, 1000);
setInterval(tickClock, 1000);
setInterval(watchNodes, 5000);
document.addEventListener("keydown", (e) => {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "input" || tag === "select" || tag === "textarea") return;
  const tabs = ["chat", "map", "nodes", "vitals", "setup"];
  if (e.key >= "1" && e.key <= "5") {
    const b = document.querySelector('nav button[data-s="' + tabs[+e.key - 1] + '"]');
    if (b) b.click();
  } else if (e.key === "Escape") {
    if (S.sos) dismissSos();
    else if (S.nodeSel) { S.nodeSel = null; renderNodes(); }
  }
});
