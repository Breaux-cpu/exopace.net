/* Aircraft, ships, and Locate me on the Mission Control globe. */
(function () {
  const AIR = "https://cams.exopace.net/api/traffic/air";
  const SEA = "https://cams.exopace.net/api/traffic/sea";
  let airOn = true;
  let seaOn = true;
  let airPlanes = null;
  let seaPoints = null;
  let airColor = null;
  let airPick = null;
  let seaColor = null;
  let planeImage = null;
  let planeScale = null;
  let loading = false;
  let pending = false;
  let hooked = false;
  let selected = null;
  const airTrack = new Map();

  function colors() {
    if (airColor || !window.Cesium) return;
    airColor = Cesium.Color.fromCssColorString("#7ee0ff");
    airPick = Cesium.Color.fromCssColorString("#ffe08a");
    seaColor = Cesium.Color.fromCssColorString("#ffe08a");
    planeScale = new Cesium.NearFarScalar(8.0e5, 1, 1.5e7, 0.55);
  }

  function points(viewer) {
    const bag = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    bag._exo = new Map();
    return bag;
  }

  function planes(viewer) {
    const bag = viewer.scene.primitives.add(new Cesium.BillboardCollection());
    bag._exo = new Map();
    return bag;
  }

  function planeMark() {
    if (planeImage) return planeImage;
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const pen = canvas.getContext("2d");
    function shape() {
      pen.beginPath();
      pen.moveTo(32, 5);
      pen.lineTo(36, 20);
      pen.lineTo(58, 32);
      pen.lineTo(58, 37);
      pen.lineTo(37, 33);
      pen.lineTo(37, 46);
      pen.lineTo(48, 54);
      pen.lineTo(48, 58);
      pen.lineTo(32, 51);
      pen.lineTo(16, 58);
      pen.lineTo(16, 54);
      pen.lineTo(27, 46);
      pen.lineTo(27, 33);
      pen.lineTo(6, 37);
      pen.lineTo(6, 32);
      pen.lineTo(28, 20);
      pen.closePath();
    }
    pen.fillStyle = "#061018";
    pen.save();
    pen.translate(0, 1.5);
    shape();
    pen.fill();
    pen.restore();
    pen.fillStyle = "#ffffff";
    shape();
    pen.fill();
    planeImage = canvas;
    return canvas;
  }

  // Screen rotation for a nose-up icon. Positive Cesium rotation is counter-clockwise.
  function nose(lon, lat, headingDeg, camera) {
    const rad = Math.PI / 180;
    const lonRad = lon * rad;
    const latRad = lat * rad;
    const sinLon = Math.sin(lonRad);
    const cosLon = Math.cos(lonRad);
    const sinLat = Math.sin(latRad);
    const cosLat = Math.cos(latRad);
    const heading = headingDeg * rad;
    const sinH = Math.sin(heading);
    const cosH = Math.cos(heading);
    const x = -sinLon * sinH - sinLat * cosLon * cosH;
    const y = cosLon * sinH - sinLat * sinLon * cosH;
    const z = cosLat * cosH;
    const right = camera.right;
    const up = camera.up;
    const dx = x * right.x + y * right.y + z * right.z;
    const dy = x * up.x + y * up.y + z * up.z;
    if (dx * dx + dy * dy < 1e-8) return 0;
    return -Math.atan2(dx, dy);
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
    if (!seaPoints) seaPoints = points(viewer);
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

  function pointSize(point) {
    const size = point.pixelSize;
    if (size == null) return 0;
    return typeof size.getValue === "function" ? size.getValue() : size;
  }

  function pointColor(point) {
    const color = point.color;
    if (!color) return null;
    if (typeof color.getValue === "function") return color.getValue(Cesium.JulianDate.now());
    return color;
  }

  function shrinkSats(viewer) {
    const list = viewer.entities && viewer.entities.values;
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const ent = list[i];
      if (!ent || typeof ent.id !== "string" || ent.id.slice(0, 4) !== "sat:" || !ent.point) continue;
      const color = pointColor(ent.point);
      const picked = color && color.red > 0.95 && color.green > 0.75 && color.blue < 0.7;
      const want = picked ? 4 : 2;
      if (pointSize(ent.point) !== want) ent.point.pixelSize = want;
    }
  }

  function step() {
    const viewer = window.EXOPACE_VIEWER;
    if (!viewer || !window.Cesium) return;
    shrinkSats(viewer);
    const card = document.getElementById("exo-craft");
    const shown = selected ? airTrack.get(selected) : null;
    if (card) {
      if (!shown || !airOn) card.hidden = true;
      else {
        card.hidden = false;
        const feet = Math.round(shown.alt * 3.28084).toLocaleString("en-US");
        card.textContent = shown.call + " · " + feet + " ft";
      }
    }
    if (!airOn) return;
    colors();
    if (!airPlanes) airPlanes = planes(viewer);
    const live = airPlanes._exo;
    const image = planeMark();
    const seen = new Set();
    const now = Date.now();
    for (const track of airTrack.values()) {
      seen.add(track.id);
      const at = pose(track, now);
      const position = Cesium.Cartesian3.fromDegrees(at.lon, at.lat, at.alt);
      const picked = selected === track.id;
      const size = picked ? 22 : 15;
      const prim = live.get(track.id);
      if (prim) {
        prim.position = position;
        prim.rotation = nose(at.lon, at.lat, track.heading, viewer.camera);
        prim.width = size;
        prim.height = size;
        prim.color = picked ? airPick : airColor;
      } else {
        live.set(track.id, airPlanes.add({
          id: track.id,
          position,
          image,
          width: size,
          height: size,
          rotation: nose(at.lon, at.lat, track.heading, viewer.camera),
          color: picked ? airPick : airColor,
          scaleByDistance: planeScale,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        }));
      }
    }
    for (const [id, prim] of live) {
      if (seen.has(id)) continue;
      airPlanes.remove(prim);
      live.delete(id);
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
        clearBag(airPlanes);
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
