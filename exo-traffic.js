/* Aircraft and ships on the Mission Control globe. Positions come from EXOpace Cams. */
(function () {
  const AIR = "https://cams.exopace.net/api/traffic/air";
  const SEA = "https://cams.exopace.net/api/traffic/sea";
  let airOn = true;
  let seaOn = true;
  let airPoints = null;
  let seaPoints = null;

  function collection(viewer, color) {
    const points = viewer.scene.primitives.add(new Cesium.PointPrimitiveCollection());
    points._exoColor = color;
    return points;
  }

  function draw(viewer, bag, rows, color, altOf) {
    if (!bag) bag = collection(viewer, color);
    bag.removeAll();
    if (!rows) return bag;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      bag.add({
        position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat, altOf(row)),
        pixelSize: 4,
        color: color,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    }
    return bag;
  }

  async function load() {
    const viewer = window.EXOPACE_VIEWER;
    if (!viewer || !window.Cesium) return;
    try {
      if (airOn) {
        const body = await (await fetch(AIR)).json();
        airPoints = draw(viewer, airPoints, body.aircraft, Cesium.Color.fromCssColorString("#7ee0ff"), (row) => Math.max(row.alt || 0, 100));
      } else if (airPoints) airPoints.removeAll();
      if (seaOn) {
        const body = await (await fetch(SEA)).json();
        seaPoints = draw(viewer, seaPoints, body.ships, Cesium.Color.fromCssColorString("#ffe08a"), () => 0);
      } else if (seaPoints) seaPoints.removeAll();
    } catch (err) {
      /* a failed feed leaves the last points in place */
    }
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
    bar.style.left = "16px";
    bar.style.bottom = "52px";
    bar.style.zIndex = "5";
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
    hud.append(bar);
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
