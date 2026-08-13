/* EXOpace FEEDS — provenance, cache, retry, diagnostics. No secrets. */
(function (g) {
  const PROV = ["LIVE", "CACHED", "SYNTHETIC", "MESH", "BRIDGE", "RID", "ADSB", "AIS", "SENSOR"];
  const KEY = {
    tle: "exopace-tle-cache",
    air: "exopace-air-cache",
    sea: "exopace-sea-cache",
    watch: "exopace-watchlist",
  };

  function now() { return Date.now(); }
  function read(k) {
    try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }

  const feeds = {
    tle: { id: "tle", label: "TLE / GP", status: "idle", provenance: "SYNTHETIC", cors: "unknown", key: "no", count: 0, err: "", at: 0, ms: 0 },
    air: { id: "air", label: "AIR", status: "idle", provenance: "SYNTHETIC", cors: "unknown", key: "no", count: 0, err: "", at: 0, ms: 0 },
    sea: { id: "sea", label: "SEA", status: "idle", provenance: "SYNTHETIC", cors: "unknown", key: "no", count: 0, err: "", at: 0, ms: 0 },
    imagery: { id: "imagery", label: "IMAGERY", status: "bundled", provenance: "SYNTHETIC", cors: "n/a", key: "no", count: 0, err: "shipped blue marble", at: 0, ms: 0, mode: "satellite" },
    mesh: { id: "mesh", label: "MESH", status: "idle", provenance: "ERROR", cors: "n/a", key: "no", count: 0, err: "no mesh ingest", at: 0, ms: 0 },
    rf: { id: "rf", label: "RF", status: "idle", provenance: "ERROR", cors: "n/a", key: "no", count: 0, err: "NO RF SAMPLES", at: 0, ms: 0 },
  };
  const listeners = [];
  function emit() { listeners.forEach((fn) => { try { fn(snapshot()); } catch (e) {} }); }
  function snapshot() {
    return {
      at: now(),
      online: navigator.onLine,
      feeds: JSON.parse(JSON.stringify(feeds)),
    };
  }

  function mark(id, patch) {
    Object.assign(feeds[id], patch, { at: now() });
    emit();
  }

  async function timed(fn, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const t0 = now();
    try {
      const r = await fn(ctrl.signal);
      return { ok: true, r, ms: now() - t0 };
    } catch (e) {
      return { ok: false, err: String(e && e.name === "AbortError" ? "timeout" : (e && e.message) || e), ms: now() - t0 };
    } finally { clearTimeout(t); }
  }

  /* ---------- TLE ---------- */
  async function fetchTle() {
    mark("tle", { status: "fetch" });
    const cached = read(KEY.tle);
    if (cached && cached.tle && cached.at && now() - cached.at < 12 * 3600 * 1000) {
      mark("tle", { status: "ok", provenance: "CACHED", count: (cached.tle.match(/^1 /gm) || []).length, cors: "n/a" });
    }
    const urls = [
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
      "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle",
    ];
    const parts = [];
    let cors = "yes";
    for (const u of urls) {
      const res = await timed((signal) => fetch(u, { signal, cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error("http " + r.status);
        return r.text();
      }), 8000);
      if (!res.ok) { cors = res.err === "timeout" ? "timeout" : "fail"; continue; }
      parts.push(res.r);
    }
    if (parts.length) {
      const tle = parts.join("\n");
      write(KEY.tle, { tle, at: now() });
      mark("tle", { status: "ok", provenance: "LIVE", cors, count: (tle.match(/^1 /gm) || []).length, err: "", ms: 0, key: "no" });
      return { text: tle, provenance: "LIVE" };
    }
    if (cached && cached.tle) {
      mark("tle", { status: "degraded", provenance: "CACHED", cors, err: "live fail · using last successful pull", key: "no", lastOk: cached.at });
      return { text: cached.tle, provenance: "CACHED" };
    }
    mark("tle", { status: "error", provenance: "ERROR", cors, err: "FEED ERROR · no live TLE · no prior snapshot", key: "no" });
    return { text: "", provenance: "ERROR" };
  }

  /* ---------- AIR (OpenSky try → cache → synthetic) ---------- */
  function synthAir(t) {
    t = t || now();
    const routes = [
      { id: "AAL-DFW-LHR", call: "AAL72", from: [32.9, -97.0], to: [51.47, -0.45], fl: 370, spd: 250 },
      { id: "FDX-MEM-ANC", call: "FDX16", from: [35.04, -89.98], to: [61.17, -150.0], fl: 350, spd: 230 },
      { id: "FDX-MEM-CDG", call: "FDX8", from: [35.04, -89.98], to: [49.01, 2.55], fl: 360, spd: 240 },
      { id: "SWA-MDW-DEN", call: "SWA441", from: [41.78, -87.75], to: [39.86, -104.67], fl: 380, spd: 220 },
      { id: "DAL-ATL-AMS", call: "DAL70", from: [33.64, -84.43], to: [52.31, 4.76], fl: 390, spd: 245 },
      { id: "UAL-SFO-NRT", call: "UAL837", from: [37.62, -122.38], to: [35.77, 140.39], fl: 400, spd: 255 },
      { id: "JBU-BOS-FLL", call: "JBU501", from: [42.36, -71.01], to: [26.07, -80.15], fl: 360, spd: 210 },
      { id: "ASA-SEA-ANC", call: "ASA107", from: [47.45, -122.31], to: [61.17, -150.0], fl: 340, spd: 200 },
      { id: "MEM-LOCAL-1", call: "N35EX", from: [35.05, -90.1], to: [35.25, -89.7], fl: 45, spd: 70 },
      { id: "MEM-LOCAL-2", call: "N90GS", from: [35.2, -90.2], to: [34.95, -89.85], fl: 28, spd: 55 },
    ];
    const day = 86400000;
    return routes.map((r, i) => {
      const u = ((t / 60000 + i * 17) % 90) / 90;
      const lat = r.from[0] + (r.to[0] - r.from[0]) * u;
      const lon = r.from[1] + (r.to[1] - r.from[1]) * u;
      const hdg = Math.atan2(r.to[1] - r.from[1], r.to[0] - r.from[0]) * 180 / Math.PI;
      return {
        id: r.id, name: r.call, kind: "air",
        lat, lon, alt: r.fl * 0.03048, vel: r.spd / 1000,
        hdg, provenance: "SYNTHETIC", icao: r.id,
      };
    });
  }

  async function fetchAir() {
    mark("air", { status: "fetch" });
    const cached = read(KEY.air);
    // CONUS bbox — keep payload small
    const url = "https://opensky-network.org/api/states/all?lamin=24&lomin=-125&lamax=50&lomax=-66";
    const res = await timed((signal) => fetch(url, { signal }).then((r) => {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    }), 7000);
    if (res.ok && res.r && Array.isArray(res.r.states)) {
      const list = res.r.states.slice(0, 180).map((s) => ({
        id: s[0] || s[1], name: (s[1] || s[0] || "AC").trim(),
        kind: "air", lat: s[6], lon: s[5],
        alt: (s[7] || s[13] || 8000) / 1000,
        vel: (s[9] || 0) / 1000, hdg: s[10] || 0,
        provenance: "LIVE", icao: s[0],
      })).filter((a) => a.lat != null && a.lon != null);
      write(KEY.air, { list, at: now(), live: true });
      mark("air", { status: "ok", provenance: "LIVE", cors: "yes", count: list.length, err: "", ms: res.ms, key: "no" });
      return { list, provenance: "LIVE" };
    }
    // OpenSky ACAO is opensky-network.org only — browser from exopace.net cannot be LIVE.
    const cors = /Failed|Network|CORS|TypeError|abort/i.test(res.err) ? "blocked" : "fail";
    if (cached && cached.list && cached.list.length && cached.live === true) {
      mark("air", { status: "degraded", provenance: "CACHED", cors, count: cached.list.length, err: res.err + " · last live snapshot", key: "no" });
      return { list: cached.list, provenance: "CACHED" };
    }
    mark("air", { status: "error", provenance: "ERROR", cors, count: 0, err: "FEED ERROR · " + (res.err || "OpenSky not usable from this origin"), key: "no" });
    return { list: [], provenance: "ERROR" };
  }

  /* ---------- SEA ---------- */
  function synthSea(t) {
    t = t || now();
    const hulls = [
      { id: "MEM-BGE-1", name: "DEMO MISSISSIPPI", lat: 35.12, lon: -90.07, dlat: 0.004, dlon: -0.002 },
      { id: "MEM-BGE-2", name: "DEMO WOLF RIVER", lat: 35.16, lon: -90.02, dlat: 0.001, dlon: 0.003 },
      { id: "GULF-TNK-1", name: "DEMO GULF TANKER", lat: 29.1, lon: -89.4, dlat: 0.01, dlon: 0.02 },
      { id: "GULF-CNT-1", name: "DEMO GULF BOX", lat: 28.6, lon: -90.1, dlat: -0.008, dlon: 0.015 },
      { id: "NO-FERRY", name: "DEMO CRESCENT", lat: 29.93, lon: -90.06, dlat: 0.002, dlon: -0.001 },
    ];
    return hulls.map((h, i) => {
      const w = Math.sin(t / 180000 + i);
      return {
        id: h.id, name: h.name, kind: "ship",
        lat: h.lat + h.dlat * w, lon: h.lon + h.dlon * w,
        alt: 0.02, vel: 0.006, hdg: 40 + i * 20,
        provenance: "SYNTHETIC",
      };
    });
  }

  async function fetchSea() {
    mark("sea", { status: "fetch" });
    const cached = read(KEY.sea);
    // Public Pages has no AIS key. Try optional local COP (session) — fail closed to synthetic.
    const bridge = localStorage.getItem("exopace-bridge") || "";
    if (bridge) {
      const res = await timed((signal) => fetch(bridge.replace(/\/$/, "") + "/ships", { signal, credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      }), 5000);
      if (res.ok && res.r) {
        const raw = res.r.ships || res.r.list || res.r;
        const list = (Array.isArray(raw) ? raw : []).slice(0, 80).map((s, i) => ({
          id: s.mmsi || s.id || ("ship-" + i),
          name: s.name || s.mmsi || "SHIP",
          kind: "ship", lat: s.lat, lon: s.lon, alt: 0.02,
          vel: (s.sog || 0) / 1000, hdg: s.cog || 0,
          provenance: s.provider === "demo_fallback" ? "SYNTHETIC" : "LIVE",
        })).filter((s) => s.lat != null);
        if (list.length) {
          const live = list.some((s) => s.provenance === "LIVE");
          if (!live) {
            mark("sea", { status: "error", provenance: "ERROR", cors: "yes", count: 0, key: "bridge", err: "FEED ERROR · bridge returned demo_fallback" });
            return { list: [], provenance: "ERROR" };
          }
          write(KEY.sea, { list, at: now(), live: true });
          mark("sea", { status: "ok", provenance: "LIVE", cors: "yes", count: list.length, key: "bridge", ms: res.ms });
          return { list, provenance: "LIVE" };
        }
      }
    }
    if (cached && cached.list && cached.list.length && cached.live === true) {
      mark("sea", { status: "degraded", provenance: "CACHED", cors: "n/a", count: cached.list.length, key: "no", err: "no live AIS · last live snapshot" });
      return { list: cached.list, provenance: "CACHED" };
    }
    mark("sea", { status: "error", provenance: "ERROR", cors: "n/a", count: 0, key: "no", err: "FEED ERROR · no AIS key / bridge" });
    return { list: [], provenance: "ERROR" };
  }

  function watchlist() { return read(KEY.watch) || []; }
  function watchAdd(item) {
    const w = watchlist().filter((x) => x.id !== item.id);
    w.unshift({ id: item.id, name: item.name, norad: item.norad || item.id });
    write(KEY.watch, w.slice(0, 24));
    return watchlist();
  }
  function watchDel(id) {
    write(KEY.watch, watchlist().filter((x) => x.id !== id));
    return watchlist();
  }

  function diagnostics() {
    const snap = snapshot();
    return {
      generated: new Date().toISOString(),
      host: location.host,
      online: snap.online,
      ua: navigator.userAgent,
      feeds: snap.feeds,
      note: "No secrets. key field is yes/no/bridge only.",
    };
  }

  function exportDiag() {
    const blob = new Blob([JSON.stringify(diagnostics(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "exopace-feeds-" + Date.now() + ".json";
    a.click();
  }

  g.ExoFeeds = {
    PROV, feeds, snapshot, on: (fn) => listeners.push(fn),
    fetchTle, fetchAir, fetchSea, synthAir, synthSea,
    watchlist, watchAdd, watchDel, diagnostics, exportDiag, mark, retryAll,
  };

  async function retryAll() {
    const out = {};
    out.tle = await fetchTle();
    out.air = await fetchAir();
    out.sea = await fetchSea();
    return out;
  }
})(window);
