/* Sentinel web parity: watchlists, geofences, a fusion timeline, and an offline ack queue. */
(function (root) {
  var DB = "exopace-sentinel-hud";
  var memory = { watch: [], fence: [], obs: [], ack: [] };
  var dbp = null;
  var host = null;
  var pane = "";
  var gpsWatch = 0;

  function id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function openDb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      if (!root.indexedDB) { resolve(null); return; }
      var req = root.indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var d = req.result;
        ["watch", "fence", "obs", "ack"].forEach(function (name) {
          if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: "id" });
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
    return dbp;
  }

  function storeAll(name) {
    return openDb().then(function (d) {
      if (!d) return memory[name].slice();
      return new Promise(function (resolve) {
        var req = d.transaction(name).objectStore(name).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve(memory[name].slice()); };
      });
    });
  }

  function storePut(name, row) {
    memory[name] = memory[name].filter(function (item) { return item.id !== row.id; }).concat([row]);
    return openDb().then(function (d) {
      if (!d) return row;
      return new Promise(function (resolve) {
        var req = d.transaction(name, "readwrite").objectStore(name).put(row);
        req.onsuccess = function () { resolve(row); };
        req.onerror = function () { resolve(row); };
      });
    });
  }

  function storeDel(name, key) {
    memory[name] = memory[name].filter(function (item) { return item.id !== key; });
    return openDb().then(function (d) {
      if (!d) return;
      return new Promise(function (resolve) {
        var req = d.transaction(name, "readwrite").objectStore(name).delete(key);
        req.onsuccess = function () { resolve(); };
        req.onerror = function () { resolve(); };
      });
    });
  }

  function loadAll() {
    return Promise.all([storeAll("watch"), storeAll("fence"), storeAll("obs"), storeAll("ack")]).then(function (rows) {
      memory.watch = rows[0];
      memory.fence = rows[1];
      memory.obs = rows[2];
      memory.ack = rows[3];
      return memory;
    });
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function css() {
    if (document.getElementById("exo-sent-css")) return;
    var style = document.createElement("style");
    style.id = "exo-sent-css";
    style.textContent = ""
      + ".exo-sent,.exo-sent *{box-sizing:border-box}"
      + ".exo-sent{max-width:100%;min-width:0;color:#e7f4ef;font-family:\"IBM Plex Sans\",system-ui,sans-serif}"
      + ".exo-sent__panel{background:rgba(4,7,13,.72);border:1px solid rgba(126,224,255,.28);border-radius:16px;backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);padding:12px;min-width:0}"
      + ".exo-sent h3{margin:0 0 8px;font:600 11px/1.2 \"IBM Plex Mono\",ui-monospace,monospace;letter-spacing:.14em;color:#FFB84D}"
      + ".exo-sent__num{font-family:\"IBM Plex Mono\",ui-monospace,monospace;font-variant-numeric:tabular-nums;font-feature-settings:\"tnum\" 1;color:#7EE0FF}"
      + ".exo-sent__row{display:flex;gap:8px;align-items:center;min-width:0;margin-top:8px}"
      + ".exo-sent input,.exo-sent select{min-width:0;flex:1;min-height:44px;max-width:100%;background:#04070D;color:#e7f4ef;border:1px solid rgba(126,224,255,.35);border-radius:10px;padding:0 10px;font:15px \"IBM Plex Mono\",ui-monospace,monospace}"
      + ".exo-sent button{min-height:44px;border-radius:10px;border:1px solid rgba(126,224,255,.45);background:transparent;color:#7EE0FF;font:600 12px/1 \"IBM Plex Sans\",system-ui,sans-serif;letter-spacing:.06em;padding:0 12px;cursor:pointer}"
      + ".exo-sent button.is-on{background:rgba(255,184,77,.16);color:#FFB84D;border-color:#FFB84D}"
      + ".exo-sent__item{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid rgba(126,224,255,.16);min-width:0}"
      + ".exo-sent__item b{display:block;color:#FFB84D;font-weight:600}"
      + ".exo-sent__item span{min-width:0;overflow-wrap:anywhere}"
      + ".exo-sent__empty{color:#9eb0aa;font-size:13px;margin:8px 0 0}"
      + ".exo-sent__bento{display:grid;gap:10px}"
      + "@media (min-width:900px){.exo-sent__bento{grid-template-columns:1.15fr .85fr}.exo-sent__span{grid-column:1 / -1}.exo-sent__dock{display:none}}"
      + "@media (max-width:899px){"
      + ".exo-sent__bento section{display:none}"
      + "#sentinel.on .exo-sent__bento section.is-open{display:block;position:fixed;left:8px;right:8px;bottom:calc(76px + env(safe-area-inset-bottom));z-index:32;max-height:min(62vh,560px);overflow:auto}"
      + "#sentinel.on .exo-sent__dock{display:flex}"
      + ".exo-sent__dock{display:none;position:fixed;left:0;right:0;bottom:0;z-index:33;gap:6px;padding:8px 8px calc(8px + env(safe-area-inset-bottom));background:rgba(4,7,13,.88);border-top:1px solid rgba(126,224,255,.28);backdrop-filter:blur(16px)}"
      + ".exo-sent__dock button{flex:1;min-width:0}"
      + "#sentinel.on #exo-sentinel{padding-bottom:calc(84px + env(safe-area-inset-bottom))}"
      + "}";
    document.head.appendChild(style);
  }

  function kindOk(kind, value) {
    var v = String(value || "").trim();
    if (kind === "norad") return /^\d{1,6}$/.test(v);
    if (kind === "icao") return /^[0-9a-fA-F]{6}$/.test(v);
    if (kind === "mmsi") return /^\d{9}$/.test(v);
    if (kind === "rf") return /^(\d+(\.\d+)?)(\s*(Hz|kHz|MHz|GHz))?$/i.test(v);
    return false;
  }

  function haversine(a, b) {
    var r = 6371000;
    var p1 = a.lat * Math.PI / 180;
    var p2 = b.lat * Math.PI / 180;
    var dp = (b.lat - a.lat) * Math.PI / 180;
    var dl = (b.lon - a.lon) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function acked(obsId) {
    return memory.ack.some(function (row) { return row.obsId === obsId; });
  }

  function addObs(row) {
    row.id = row.id || id();
    row.t = row.t || Date.now();
    row.queued = true;
    return storePut("obs", row).then(function () {
      if (row.source === "FENCE") return null;
      return checkFences(row);
    }).then(function () {
      paint();
      return row;
    });
  }

  function checkFences(obs) {
    if (!Number.isFinite(obs.lat) || !Number.isFinite(obs.lon)) return Promise.resolve();
    var hits = memory.fence.filter(function (fence) {
      if (fence.enabled === false) return false;
      return haversine(obs, fence) <= Number(fence.radiusM);
    });
    return hits.reduce(function (chain, fence) {
      return chain.then(function () {
        var recent = memory.obs.some(function (item) {
          return item.source === "FENCE" && item.fenceId === fence.id && Date.now() - item.t < 600000;
        });
        if (recent) return;
        return addObs({
          source: "FENCE",
          kind: "geofence",
          value: fence.name,
          fenceId: fence.id,
          lat: obs.lat,
          lon: obs.lon,
          note: "INSIDE " + Math.round(fence.radiusM) + " m",
        });
      });
    }, Promise.resolve());
  }

  function paint() {
    if (!host) return;
    var watch = memory.watch.slice().sort(function (a, b) { return b.t - a.t; });
    var fence = memory.fence.slice().sort(function (a, b) { return b.t - a.t; });
    var obs = memory.obs.slice().sort(function (a, b) { return b.t - a.t; });
    var pending = obs.filter(function (row) { return !acked(row.id); });
    host.querySelector("[data-count='watch']").textContent = String(watch.length);
    host.querySelector("[data-count='fence']").textContent = String(fence.length);
    host.querySelector("[data-count='queue']").textContent = String(pending.length);
    host.querySelector("[data-list='watch']").innerHTML = watch.length ? watch.map(function (row) {
      return '<div class="exo-sent__item"><span><b>' + esc(row.kind.toUpperCase()) + '</b><span class="exo-sent__num">' + esc(row.value) + '</span> ' + esc(row.label || "") + '</span>'
        + '<span class="exo-sent__row"><button type="button" data-heard="' + esc(row.id) + '">HEARD</button><button type="button" data-del="watch" data-id="' + esc(row.id) + '">DROP</button></span></div>';
    }).join("") : '<p class="exo-sent__empty">No watchlist yet. Add a NORAD id, ICAO hex, MMSI, or RF frequency.</p>';
    host.querySelector("[data-list='fence']").innerHTML = fence.length ? fence.map(function (row) {
      return '<div class="exo-sent__item"><span><b>' + esc(row.name) + '</b><span class="exo-sent__num">' + Number(row.lat).toFixed(5) + ', ' + Number(row.lon).toFixed(5) + ' · ' + Math.round(row.radiusM) + ' m</span></span>'
        + '<button type="button" data-del="fence" data-id="' + esc(row.id) + '">DROP</button></div>';
    }).join("") : '<p class="exo-sent__empty">No geofence. A fix inside the radius raises an alert.</p>';
    host.querySelector("[data-list='time']").innerHTML = obs.length ? obs.slice(0, 40).map(function (row) {
      var when = new Date(row.t).toISOString().slice(11, 19) + "Z";
      return '<div class="exo-sent__item"><span><b>' + esc(row.source) + ' ' + esc(when) + '</b>' + esc(row.kind) + ' <span class="exo-sent__num">' + esc(row.value) + '</span> ' + esc(row.note || "") + '</span></div>';
    }).join("") : '<p class="exo-sent__empty">The timeline fills as GPS, manual marks, and heard watch items arrive.</p>';
    host.querySelector("[data-list='queue']").innerHTML = pending.length ? pending.slice(0, 30).map(function (row) {
      return '<div class="exo-sent__item"><span><b>QUEUED</b>' + esc(row.source) + ' <span class="exo-sent__num">' + esc(row.value) + '</span></span>'
        + '<button type="button" data-ack="' + esc(row.id) + '">ACK</button></div>';
    }).join("") : '<p class="exo-sent__empty">Ack queue is empty. Marks stay on this device until you ack or export them.</p>';
    var ackCount = host.querySelector("[data-count='ack']");
    if (ackCount) ackCount.textContent = String(memory.ack.length);
    host.querySelectorAll(".exo-sent__bento section").forEach(function (section) {
      section.classList.toggle("is-open", section.getAttribute("data-pane") === pane);
    });
    host.querySelectorAll(".exo-sent__dock button").forEach(function (btn) {
      btn.classList.toggle("is-on", btn.getAttribute("data-pane") === pane);
    });
  }

  function shell() {
    host.innerHTML = ''
      + '<div class="exo-sent">'
      + '<p class="exo-sent__num" style="margin:0 0 10px">WATCH <span data-count="watch">0</span> · FENCE <span data-count="fence">0</span> · QUEUE <span data-count="queue">0</span> · ACK <span data-count="ack">0</span></p>'
      + '<div class="exo-sent__bento">'
      + '<section class="exo-sent__panel" data-pane="watch"><h3>WATCHLIST</h3>'
      + '<div class="exo-sent__row"><select data-field="kind"><option value="norad">NORAD</option><option value="icao">ICAO</option><option value="mmsi">MMSI</option><option value="rf">RF</option></select>'
      + '<input data-field="value" placeholder="25544, A1B2C3, MMSI, or 145.800 MHz" aria-label="Watch value"></div>'
      + '<div class="exo-sent__row"><input data-field="label" placeholder="Label" aria-label="Watch label"><button type="button" data-act="add-watch">ADD</button></div>'
      + '<div data-list="watch"></div></section>'
      + '<section class="exo-sent__panel" data-pane="fence"><h3>GEOFENCE</h3>'
      + '<div class="exo-sent__row"><input data-field="fname" placeholder="Name" aria-label="Geofence name"><input data-field="radius" inputmode="decimal" value="250" aria-label="Radius meters"></div>'
      + '<div class="exo-sent__row"><input data-field="flat" inputmode="decimal" placeholder="Lat" aria-label="Geofence latitude"><input data-field="flon" inputmode="decimal" placeholder="Lon" aria-label="Geofence longitude"></div>'
      + '<div class="exo-sent__row"><button type="button" data-act="add-fence">ADD FENCE</button><button type="button" data-act="gps">ARM GPS</button></div>'
      + '<p class="exo-sent__empty" data-gps>GPS idle.</p><div data-list="fence"></div></section>'
      + '<section class="exo-sent__panel exo-sent__span" data-pane="time"><h3>SENSOR FUSION</h3>'
      + '<div class="exo-sent__row"><input data-field="onote" placeholder="Manual mark" aria-label="Manual observation"><button type="button" data-act="add-obs">MARK</button></div>'
      + '<div data-list="time"></div></section>'
      + '<section class="exo-sent__panel exo-sent__span" data-pane="queue"><h3>OFFLINE QUEUE</h3>'
      + '<div class="exo-sent__row"><button type="button" data-act="export">EXPORT QUEUE</button></div>'
      + '<div data-list="queue"></div></section>'
      + '</div>'
      + '<div class="exo-sent__dock">'
      + '<button type="button" data-pane="watch">WATCH</button>'
      + '<button type="button" data-pane="fence">FENCE</button>'
      + '<button type="button" data-pane="time">TIME</button>'
      + '<button type="button" data-pane="queue">QUEUE</button>'
      + '</div></div>';
  }

  function field(name) {
    return host.querySelector('[data-field="' + name + '"]');
  }

  function onClick(event) {
    var btn = event.target.closest("button");
    if (!btn || !host.contains(btn)) return;
    var paneName = btn.getAttribute("data-pane");
    if (paneName) { pane = pane === paneName ? "" : paneName; paint(); return; }
    var del = btn.getAttribute("data-del");
    if (del) { storeDel(del, btn.getAttribute("data-id")).then(paint); return; }
    var heard = btn.getAttribute("data-heard");
    if (heard) {
      var row = memory.watch.filter(function (item) { return item.id === heard; })[0];
      if (row) addObs({ source: "WATCH", kind: row.kind, value: row.value, note: row.label || "HEARD" });
      return;
    }
    var ack = btn.getAttribute("data-ack");
    if (ack) {
      storePut("ack", { id: id(), obsId: ack, t: Date.now(), queued: true }).then(function () { return loadAll(); }).then(paint);
      return;
    }
    var act = btn.getAttribute("data-act");
    if (act === "add-watch") {
      var kind = field("kind").value;
      var value = field("value").value.trim();
      if (!kindOk(kind, value)) return;
      var bus = root.EXO && root.EXO.bus;
      if (bus) bus.set({ kind: kind, id: value, label: field("label").value.trim() || value, norad: kind === "norad" ? value : "", freqMHz: kind === "rf" ? Number(value) : null });
      storePut("watch", { id: id(), t: Date.now(), kind: kind, value: kind === "icao" ? value.toUpperCase() : value, label: field("label").value.trim() }).then(function () {
        field("value").value = "";
        field("label").value = "";
        return loadAll();
      }).then(paint);
    } else if (act === "add-fence") {
      var lat = Number(field("flat").value);
      var lon = Number(field("flon").value);
      var radius = Number(field("radius").value);
      var name = field("fname").value.trim() || "FENCE";
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !(radius > 0)) return;
      storePut("fence", { id: id(), t: Date.now(), name: name, lat: lat, lon: lon, radiusM: radius, enabled: true }).then(loadAll).then(paint);
    } else if (act === "add-obs") {
      var note = field("onote").value.trim();
      if (!note) return;
      addObs({ source: "MANUAL", kind: "note", value: note, note: "" }).then(function () { field("onote").value = ""; });
    } else if (act === "gps") {
      armGps();
    } else if (act === "export") {
      var blob = new Blob([JSON.stringify({ watch: memory.watch, fence: memory.fence, obs: memory.obs, ack: memory.ack }, null, 2)], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "exopace-sentinel-queue.json";
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }
  }

  function armGps() {
    var note = host.querySelector("[data-gps]");
    if (!navigator.geolocation) { if (note) note.textContent = "This browser has no location."; return; }
    if (gpsWatch) {
      navigator.geolocation.clearWatch(gpsWatch);
      gpsWatch = 0;
      if (note) note.textContent = "GPS idle.";
      return;
    }
    if (note) note.textContent = "GPS armed.";
    gpsWatch = navigator.geolocation.watchPosition(function (pos) {
      addObs({
        source: "GPS",
        kind: "fix",
        value: pos.coords.latitude.toFixed(5) + ", " + pos.coords.longitude.toFixed(5),
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        note: Math.round(pos.coords.accuracy) + " m",
      });
    }, function () {
      if (note) note.textContent = "Allow location, then arm GPS again.";
      gpsWatch = 0;
    }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 });
  }

  function mount(el) {
    host = el;
    css();
    shell();
    host.addEventListener("click", onClick);
    root.addEventListener("exo-target", function (event) {
      var detail = event.detail || {};
      var lat = field("flat");
      var lon = field("flon");
      if (lat && detail.lat != null) lat.value = String(detail.lat);
      if (lon && detail.lon != null) lon.value = String(detail.lon);
    });
    loadAll().then(paint).catch(function () { paint(); });
  }

  function boot() {
    var el = document.getElementById("exo-sentinel");
    if (!el || el.dataset.exoSentinel) return;
    el.dataset.exoSentinel = "1";
    mount(el);
  }

  root.addEventListener("exo-observe", function (event) {
    var detail = event.detail || {};
    if (!detail.value) return;
    addObs({
      source: detail.source || "RF",
      kind: detail.kind || "rf",
      value: String(detail.value),
      lat: detail.lat,
      lon: detail.lon,
      note: detail.note || "",
    });
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  root.EXO_SENTINEL = { mount: mount, addObs: addObs };
})(typeof globalThis !== "undefined" ? globalThis : window);
