/* Aircraft, ships, and Locate me on the Mission Control globe. */
(function () {
  const AIR = "https://cams.exopace.net/api/traffic/air";
  const SEA = "https://cams.exopace.net/api/traffic/sea";
  let airOn = true;
  let seaOn = true;
  let airPoints = null;
  let seaPoints = null;
  let airColor = null;
  let seaColor = null;
  let loading = false;
  let pending = false;
  let hooked = false;
  let selected = null;
  const airTrack = new Map();

  function colors() {
    if (airColor || !window.Cesium) return;
    airColor = Cesium.Color.fromCssColorString("#7ee0ff");
    seaColor = Cesium.Color.fromCssColorString("#ffe08a");
  }

  function collection(viewer) {
    const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    points._exo = new Map();
    return points;
  }

  function meters(lon1, lat1, lon2, lat2) {
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  function bearing(lon1, lat1, lon2, lat2) {
    const rad = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  function remember(rows, now) {
    const seen = new Set();
    const list = rows || [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat)) continue;
      const id = row.id ? String(row.id) : "";
      if (!id) continue;
      seen.add(id);
      const prev = airTrack.get(id);
      let speed = Number(row.speed);
      let heading = Number(row.heading);
      if (prev && now > prev.sample) {
        const dt = (now - prev.sample) / 1000;
        const moved = meters(prev.lon, prev.lat, row.lon, row.lat);
        if (!Number.isFinite(speed) || speed <= 0) speed = dt > 2 && dt < 90 ? moved / dt : prev.speed;
        if (!Number.isFinite(heading) || heading === 0) heading = moved > 30 ? bearing(prev.lon, prev.lat, row.lon, row.lat) : prev.heading;
      }
      airTrack.set(id, {
        id,
        call: (row.call && String(row.call).trim()) || id,
        lon: row.lon,
        lat: row.lat,
        alt: Math.max(Number(row.alt) || 0, 400),
        heading: Number.isFinite(heading) ? heading : 0,
        speed: Number.isFinite(speed) ? Math.min(Math.max(speed, 0), 320) : 0,
        sample: now,
      });
    }
    for (const id of airTrack.keys()) {
      if (!seen.has(id)) airTrack.delete(id);
    }
    if (selected && !airTrack.has(selected)) selected = null;
  }

  function pose(track, now) {
    const dt = Math.min(40, Math.max(0, (now - track.sample) / 1000));
    const dist = track.speed * dt;
    const rad = (track.heading * Math.PI) / 180;
    const dLat = (dist * Math.cos(rad)) / 111320;
    const cos = Math.cos((track.lat * Math.PI) / 180) || 0.2;
    const dLon = (dist * Math.sin(rad)) / (111320 * cos);
    return { lon: track.lon + dLon, lat: track.lat + dLat, alt: track.alt };
  }

  function syncShips(viewer, rows) {
    if (!seaPoints) seaPoints = collection(viewer);
    const live = seaPoints._exo;
    const seen = new Set();
    const list = rows || [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat)) continue;
      const id = row.id ? String(row.id) : "s" + i;
      seen.add(id);
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat, 80);
      const prim = live.get(id);
      if (prim) prim.position = position;
      else live.set(id, seaPoints.add({ id, position, pixelSize: 7, color: seaColor }));
    }
    for (const [id, prim] of live) {
      if (seen.has(id)) continue;
      seaPoints.remove(prim);
      live.delete(id);
    }
  }

  function step() {
    const viewer = window.EXOPACE_VIEWER;
    if (!viewer || !window.Cesium || !airOn) return;
    colors();
    if (!airPoints) airPoints = collection(viewer);
    const live = airPoints._exo;
    const seen = new Set();
    const now = Date.now();
    for (const track of airTrack.values()) {
      seen.add(track.id);
      const at = pose(track, now);
      const position = Cesium.Cartesian3.fromDegrees(at.lon, at.lat, at.alt);
      const prim = live.get(track.id);
      const size = selected === track.id ? 12 : 8;
      if (prim) {
        prim.position = position;
        prim.pixelSize = size;
      } else {
        live.set(track.id, airPoints.add({ id: track.id, position, pixelSize: size, color: airColor }));
      }
    }
    for (const [id, prim] of live) {
      if (seen.has(id)) continue;
      airPoints.remove(prim);
      live.delete(id);
    }
    const card = document.getElementById("exo-craft");
    const track = selected ? airTrack.get(selected) : null;
    if (card) {
      if (!track) card.hidden = true;
      else {
        card.hidden = false;
        const feet = Math.round(track.alt * 3.28084).toLocaleString("en-US");
        card.textContent = track.call + " · " + feet + " ft";
      }
    }
    if (viewer.scene.requestRenderMode) viewer.scene.requestRender();
  }

  function hook(viewer) {
    if (hooked) return;
    hooked = true;
    viewer.scene.preRender.addEventListener(step);
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const hit = viewer.scene.pick(click.position);
      const id = hit && (typeof hit.id === "string" ? hit.id : hit.primitive && hit.primitive.id);
      selected = id && airTrack.has(String(id)) ? String(id) : null;
      step();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  }

  function clearBag(bag) {
    if (!bag) return;
    bag.removeAll();
    bag._exo = new Map();
  }

  async function load() {
    const viewer = window.EXOPACE_VIEWER;
    if (!viewer || !window.Cesium) return;
    if (loading) {
      pending = true;
      return;
    }
    loading = true;
    colors();
    hook(viewer);
    try {
      if (airOn) {
        const body = await (await fetch(AIR)).json();
        remember(body.aircraft, Date.now());
      } else {
        airTrack.clear();
        selected = null;
        clearBag(airPoints);
      }
      if (seaOn) {
        const body = await (await fetch(SEA)).json();
        syncShips(viewer, body.ships);
      } else clearBag(seaPoints);
      step();
    } catch (err) {
      /* a failed feed leaves the last points in place */
    } finally {
      loading = false;
      if (pending) {
        pending = false;
        void load();
      }
    }
  }

  function locate() {
    const viewer = window.EXOPACE_VIEWER;
    const node = document.getElementById("exo-locate");
    if (!viewer || !window.Cesium || !navigator.geolocation) {
      if (node) node.textContent = "UNAVAILABLE";
      return;
    }
    if (node) node.textContent = "LOCATING";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        viewer.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(pos.coords.longitude, pos.coords.latitude, 28000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-90),
            roll: 0,
          },
          duration: 1.5,
        });
        if (node) node.textContent = "LOCATE ME";
      },
      () => {
        if (node) node.textContent = "BLOCKED";
        setTimeout(() => {
          if (node) node.textContent = "LOCATE ME";
        }, 2200);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 },
    );
  }

  function button(label, onClick) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "btn on";
    node.textContent = label;
    node.style.marginLeft = "6px";
    node.addEventListener("click", () => {
      const on = onClick();
      node.className = "btn" + (on ? " on" : "");
    });
    return node;
  }

  function mount() {
    const hud = document.querySelector(".hud");
    if (!hud || document.getElementById("exo-traffic")) return false;
    const bar = document.createElement("div");
    bar.id = "exo-traffic";
    bar.style.position = "absolute";
    bar.style.left = "14px";
    bar.style.bottom = "calc(112px + env(safe-area-inset-bottom))";
    bar.style.zIndex = "6";
    bar.style.display = "flex";
    bar.style.gap = "4px";
    bar.append(
      button("AIRCRAFT", () => {
        airOn = !airOn;
        void load();
        return airOn;
      }),
      button("SHIPS", () => {
        seaOn = !seaOn;
        void load();
        return seaOn;
      }),
    );
    const card = document.createElement("div");
    card.id = "exo-craft";
    card.hidden = true;
    card.style.position = "absolute";
    card.style.left = "14px";
    card.style.bottom = "calc(156px + env(safe-area-inset-bottom))";
    card.style.zIndex = "6";
    card.style.padding = "6px 10px";
    card.style.border = "1px solid rgba(126,224,255,.45)";
    card.style.background = "rgba(3,6,11,.9)";
    card.style.color = "#e6f0ea";
    card.style.font = "12px IBM Plex Mono, ui-monospace, monospace";
    const locateBtn = document.createElement("button");
    locateBtn.id = "exo-locate";
    locateBtn.type = "button";
    locateBtn.className = "btn";
    locateBtn.textContent = "LOCATE ME";
    locateBtn.title = "Move the globe to where you are";
    locateBtn.style.position = "absolute";
    locateBtn.style.right = "14px";
    locateBtn.style.bottom = "calc(120px + env(safe-area-inset-bottom))";
    locateBtn.style.zIndex = "6";
    locateBtn.addEventListener("click", locate);
    hud.append(bar, card, locateBtn);
    return true;
  }

  const timer = setInterval(() => {
    if (mount()) void load();
  }, 1000);
  setInterval(() => {
    if (window.EXOPACE_VIEWER) void load();
  }, 20000);
  setTimeout(() => clearInterval(timer), 20000);
})();
