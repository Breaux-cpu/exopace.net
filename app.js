/* EXOpace MOC chrome */
(function () {
  const P = window.ExoProto;
  const hud = document.getElementById("hud");
  let engine = null;
  let muted = true;
  let layersOpen = false;

  hud.innerHTML = `
    <div class="word">EXOpace<small>MISSION CONTROL</small></div>
    <form class="search" id="searchForm"><input id="searchQ" placeholder="SAT NAME / NORAD  ·  / palette" /></form>
    <div class="tl">
      <span class="utc" id="utc"></span>
      <span class="chip" id="feedChip">FEED</span>
      <span class="chip" id="gpuChip">WEBGL2</span>
      <select class="chip" id="qSel"><option>ULTRA</option><option>HIGH</option><option>MED</option><option>PERF</option></select>
      <button class="btn" id="btnAudio">AUDIO</button>
      <a class="radio-link btn" href="/radio/">RADIO</a>
    </div>
    <div class="layers" id="layers"></div>
    <div class="camstrip" id="camstrip"></div>
    <div class="timebar">
      <button class="btn on" data-rate="1">LIVE</button>
      <button class="btn" data-rate="0">HOLD</button>
      <button class="btn" data-rate="10">10×</button>
      <button class="btn" data-rate="60">60×</button>
      <div class="rate" id="rateLbl">LIVE</div>
    </div>
    <div class="zoom">
      <button class="btn" id="btnHome" title="home">⌂</button>
      <button class="btn" id="btnIn">＋</button>
      <button class="btn" id="btnOut">－</button>
      <button class="btn" id="btnN">N</button>
      <button class="btn" id="btnSt">◎</button>
    </div>
    <aside class="dossier" id="dossier"></aside>
    <div class="toast" id="toast"></div>
    <div class="palette" id="palette"><input id="palQ" placeholder="lock ISS · layer aircraft · quality PERF" /><ul id="palList"></ul></div>
  `;

  const LAYERS = ["sats:SATELLITES", "orbits:ORBITS", "clouds:CLOUDS", "atmo:ATMO", "radio:RADIO", "air:AIRCRAFT", "ships:SHIPS"];
  const CAMS = [["moc", "⌂ MOC"], ["free", "FLY"], ["follow", "FOLLOW"], ["satcam", "SAT-CAM"], ["cinematic", "CINE"]];
  const layerEl = document.getElementById("layers");
  LAYERS.forEach((pair) => {
    const [id, lab] = pair.split(":");
    const b = document.createElement("button");
    b.className = "btn on"; b.dataset.layer = id; b.textContent = lab;
    b.onclick = () => {
      const on = !engine.layers[id];
      engine.setLayer(id, on);
      b.classList.toggle("on", on);
      if ((id === "air" || id === "ships") && on) toast(id.toUpperCase() + " · SIMULATED");
    };
    layerEl.appendChild(b);
  });
  const camEl = document.getElementById("camstrip");
  const layBtn = document.createElement("button");
  layBtn.className = "btn"; layBtn.textContent = "LAYERS";
  layBtn.onclick = () => { layersOpen = !layersOpen; layerEl.classList.toggle("open", layersOpen); };
  camEl.appendChild(layBtn);
  CAMS.forEach(([id, lab]) => {
    const b = document.createElement("button");
    b.className = "btn" + (id === "moc" ? " on" : ""); b.dataset.cam = id; b.textContent = lab;
    b.onclick = () => setCam(id);
    camEl.appendChild(b);
  });

  function toast(m) {
    const e = document.getElementById("toast");
    e.textContent = m; e.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => e.classList.remove("on"), 1800);
  }
  function tick(kind) {
    if (muted) return;
    try {
      const a = tick.ac || (tick.ac = new AudioContext());
      const o = a.createOscillator(), g = a.createGain();
      o.frequency.value = kind === "lock" ? 880 : 440;
      g.gain.value = 0.03; o.connect(g); g.connect(a.destination);
      o.start(); o.stop(a.currentTime + 0.08);
    } catch (e) {}
  }
  function writeLink(id, cam) {
    history.replaceState(null, "", "/lock/" + encodeURIComponent(id) + "?cam=" + cam + "&t=live");
  }
  function setCam(m) {
    if (!engine) return;
    if (m === "follow" && !engine.selected()) { toast("NO LOCK"); return; }
    if (m === "cinematic") {
      if (engine.rig.mode === "cinematic") { engine.rig.abortCinematic(); syncCam("moc"); toast("CINEMATIC ABORT"); return; }
      engine.rig.startCinematic(); syncCam("cinematic"); toast("CINEMATIC RUN"); tick("ui"); return;
    }
    engine.setMode(m); syncCam(m); tick("ui");
  }
  function syncCam(m) {
    document.querySelectorAll("[data-cam]").forEach((b) => b.classList.toggle("on", b.dataset.cam === m));
  }
  function lockQuery(q) {
    const b = engine.find(q);
    if (!b) { toast("NO LOCK"); return; }
    engine.setSelected(b.id);
    engine.setMode("follow");
    syncCam("follow");
    writeLink(b.id, "follow");
    tick("lock");
    toast("LOCK " + b.name);
    renderDossier(b, "NEXT PASS · MILLINGTON");
  }
  function renderDossier(b, next) {
    const el = document.getElementById("dossier");
    if (!b) {
      el.innerHTML = `<h3>SELECTION</h3><div class="empty">NO LOCK</div>
        <div class="kv" style="margin-top:10px"><b>OBJECTS</b><span id="satN">—</span><b>MESH</b><span id="meshN">QUIET</span><b>EVENT</b><span>${next || "NO LOCK"}</span></div>`;
      return;
    }
    el.innerHTML = `<h3>${esc(b.name)}</h3>
      <div class="kv">
        <b>NORAD</b><span>${esc(b.norad)}</span>
        <b>ALTITUDE</b><span>${b.alt >= 1000 ? (b.alt / 1000).toFixed(2) + " Mm" : b.alt.toFixed(1) + " km"}</span>
        <b>LAT / LON</b><span>${b.lat.toFixed(3)} / ${b.lon.toFixed(3)}</span>
        <b>VELOCITY</b><span>${b.vel.toFixed(2)} km/s</span>
        <b>PERIOD</b><span>${b.periodMin.toFixed(1)} min</span>
        <b>INCLINATION</b><span>${b.inc.toFixed(2)}°</span>
        <b>OPERATOR</b><span>${esc(b.operator)}</span>
        <b>SOURCE</b><span>${b.synthetic ? "SYNTHETIC TLE" : "CELESTRAK"}</span>
        <b>NEXT</b><span>${esc(next || "")}</span>
      </div>
      <div style="display:flex;gap:6px;margin-top:10px">
        <button class="btn" id="copyC">COPY COORDS</button>
        <button class="btn" id="clrL">CLEAR LOCK</button>
      </div>`;
    document.getElementById("copyC").onclick = () => {
      navigator.clipboard && navigator.clipboard.writeText(b.lat.toFixed(5) + "," + b.lon.toFixed(5));
      toast("COORDS COPIED");
    };
    document.getElementById("clrL").onclick = () => {
      engine.setSelected(null);
      engine.recageHome();
      history.replaceState(null, "", "/");
      syncCam("moc");
      toast("LOCK CLEARED");
      renderDossier(null);
    };
  }
  function esc(s) { return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c])); }

  document.getElementById("searchForm").onsubmit = (e) => { e.preventDefault(); lockQuery(document.getElementById("searchQ").value); };
  document.getElementById("qSel").onchange = (e) => { engine.setQuality(e.target.value); toast("QUALITY " + e.target.value); };
  document.getElementById("btnAudio").onclick = () => {
    muted = !muted;
    document.getElementById("btnAudio").classList.toggle("on", !muted);
    document.getElementById("btnAudio").textContent = muted ? "AUDIO" : "TICKS";
    toast(muted ? "MUTED" : "AUDIO");
  };
  document.querySelectorAll("[data-rate]").forEach((b) => {
    b.onclick = () => {
      const r = +b.dataset.rate;
      engine.setRate(r);
      document.querySelectorAll("[data-rate]").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  document.getElementById("btnHome").onclick = () => { engine.recageHome(); syncCam("moc"); };
  document.getElementById("btnIn").onclick = () => engine.rig.dolly(0.82);
  document.getElementById("btnOut").onclick = () => engine.rig.dolly(1.2);
  document.getElementById("btnN").onclick = () => engine.northUp();
  document.getElementById("btnSt").onclick = () => engine.recageStation();

  const pal = document.getElementById("palette");
  function cmds(q) {
    const base = [
      { k: "lock ISS", run: () => lockQuery("ISS") },
      { k: "lock Hubble", run: () => lockQuery("HST") },
      { k: "quality PERF", run: () => { engine.setQuality("PERF"); document.getElementById("qSel").value = "PERF"; } },
      { k: "quality ULTRA", run: () => { engine.setQuality("ULTRA"); document.getElementById("qSel").value = "ULTRA"; } },
      { k: "run cinematic", run: () => setCam("cinematic") },
      { k: "layer aircraft", run: () => { engine.setLayer("air", true); toast("AIRCRAFT · SIMULATED"); } },
      { k: "time 60x", run: () => engine.setRate(60) },
      { k: "time live", run: () => engine.setRate(1) },
      { k: "recage station", run: () => engine.recageStation() },
    ];
    (engine.bodies || []).slice(0, 40).forEach((b) => base.push({ k: "lock " + b.name, run: () => lockQuery(b.name) }));
    const s = (q || "").toLowerCase();
    return s ? base.filter((c) => c.k.toLowerCase().includes(s)) : base;
  }
  function renderPal() {
    const list = cmds(document.getElementById("palQ").value);
    document.getElementById("palList").innerHTML = list.slice(0, 16).map((c, i) => `<li data-i="${i}">${esc(c.k)}</li>`).join("");
    renderPal.list = list;
  }
  document.getElementById("palQ").oninput = renderPal;
  document.getElementById("palList").onmousedown = (e) => {
    const li = e.target.closest("li"); if (!li) return;
    renderPal.list[+li.dataset.i].run();
    pal.classList.remove("on");
  };
  addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (e.key === "/" && tag !== "INPUT") { e.preventDefault(); pal.classList.add("on"); renderPal(); document.getElementById("palQ").focus(); }
    if (e.key === "Escape") { engine && engine.rig.abortCinematic(); pal.classList.remove("on"); }
    if (e.key === "Enter" && pal.classList.contains("on") && renderPal.list && renderPal.list[0]) {
      renderPal.list[0].run(); pal.classList.remove("on");
    }
  });

  function liveMesh() {
    const d = P.demoMesh();
    const now = Date.now() / 1000;
    const nodes = [
      { id: d.me.id, name: d.me.name, lat: d.me.lat, lon: d.me.lon, conf: 1, kind: "me" },
      { id: P.STATION.id, name: P.STATION.name, lat: P.STATION.lat, lon: P.STATION.lon, conf: 1, kind: "way" },
    ];
    d.peers.forEach((p) => {
      const n = P.applyPresence({ ...p, last: now - p.ago });
      nodes.push({ id: n.id, name: n.name, lat: n.lat, lon: n.lon, conf: n.conf, kind: "peer" });
    });
    return nodes;
  }

  engine = new ExoEngine(document.getElementById("globe"), {
    onReady: ({ feed, count, quality }) => {
      document.getElementById("boot-void").classList.add("out");
      document.getElementById("feedChip").textContent =
        feed === "LIVE" ? "FEED CELESTRAK LIVE" : feed === "CACHED" ? "FEED CELESTRAK CACHED" : "FEED SYNTHETIC";
      document.getElementById("qSel").value = quality;
      toast(feed === "LIVE" ? "FEED CELESTRAK LIVE" : feed === "CACHED" ? "FEED CELESTRAK CACHED" : "FEED SYNTHETIC · OFFLINE FLEET");
      const path = location.pathname.match(/\/lock\/([^/?]+)/);
      const cam = new URLSearchParams(location.search).get("cam") || "follow";
      if (path) {
        const b = engine.find(decodeURIComponent(path[1]));
        if (b) {
          engine.setSelected(b.id);
          if (cam === "cinematic") engine.rig.startCinematic();
          else engine.setMode(cam);
          syncCam(cam);
        }
      }
      renderDossier(engine.selected());
      engine.setMesh(liveMesh());
    },
    onPick: (id) => {
      if (!id) { engine.setSelected(null); renderDossier(null); return; }
      engine.setSelected(id);
      const b = engine.selected();
      if (b) { writeLink(b.id, engine.rig.mode === "follow" ? "follow" : "moc"); tick("lock"); toast("LOCK " + b.name); }
      renderDossier(b);
    },
    onTick: (info) => {
      document.getElementById("utc").textContent = info.date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
      document.getElementById("rateLbl").textContent = info.rateLabel;
      const now = performance.now();
      if (!onTick._last || now - onTick._last > 400) {
        onTick._last = now;
        if (info.selected) renderDossier(info.selected, info.nextEvent);
        else {
          const n = document.getElementById("satN");
          if (n) { n.textContent = info.counts.sat; document.getElementById("meshN").textContent = info.counts.radio || "QUIET"; }
        }
      }
      if (onTick._cam !== info.cam) { onTick._cam = info.cam; syncCam(info.cam); }
    },
  });
  engine.init();
  setInterval(() => { if (engine) engine.setMesh(liveMesh()); }, 2000);

  if (location.protocol === "https:" && "serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
