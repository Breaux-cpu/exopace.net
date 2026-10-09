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

  function sync(viewer, bag, rows, color, altOf) {
    if (!bag) bag = collection(viewer);
    const live = bag._exo;
    const seen = new Set();
    const list = rows || [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!Number.isFinite(row.lon) || !Number.isFinite(row.lat)) continue;
      const id = row.id ? String(row.id) : "i" + i;
      seen.add(id);
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat, altOf(row));
      const prim = live.get(id);
      if (prim) {
        prim.position = position;
      } else {
        live.set(id, bag.add({ position: position, pixelSize: 7, color: color }));
      }
    }
    for (const [id, prim] of live) {
      if (seen.has(id)) continue;
      bag.remove(prim);
      live.delete(id);
    }
    return bag;
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
    try {
      if (airOn) {
        const body = await (await fetch(AIR)).json();
        airPoints = sync(viewer, airPoints, body.aircraft, airColor, (row) => Math.max(row.alt || 0, 400));
      } else clearBag(airPoints);
      if (seaOn) {
        const body = await (await fetch(SEA)).json();
        seaPoints = sync(viewer, seaPoints, body.ships, seaColor, () => 80);
      } else clearBag(seaPoints);
      viewer.scene.requestRender();
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
    hud.append(bar, locateBtn);
    return true;
  }

  const timer = setInterval(() => {
    if (mount()) void load();
  }, 1000);
  setInterval(() => {
    if (window.EXOPACE_VIEWER) void load();
  }, 30000);
  setTimeout(() => clearInterval(timer), 20000);
})();
