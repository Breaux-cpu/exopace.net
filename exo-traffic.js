/* Aircraft, ships, radar, storms, cameras, and Locate me on the Mission Control globe. */
(function () {
  const AIR = "https://cams.exopace.net/api/traffic/air";
  const SEA = "https://cams.exopace.net/api/traffic/sea";
  const STORM_URL = "https://cams.exopace.net/api/weather/storms";
  const CAMS = "https://cams.exopace.net/api/cameras.geojson";
  const RADAR_CREDIT = "Radar © RainViewer";
  const RADAR_SUFFIX = "/256/{z}/{x}/{y}/2/1_1.png";
  const LEGEND = "Planes are aircraft, dots are satellites, amber points are ships.";
  let airOn = true;
  let seaOn = true;
  let radarOn = true;
  let stormOn = true;
  let camsOn = false;
  let airPlanes = null;
  let seaPoints = null;
  let stormPoints = null;
  let camPoints = null;
  let radarLayer = null;
  let radarUrl = "";
  let radarFrames = [];
  let radarIndex = 0;
  let radarPlaying = false;
  let radarTimer = null;
  let radarHold = false;
  let airColor = null;
  let airPick = null;
  let seaColor = null;
  let stormColor = null;
  let camColor = null;
  let trackColor = null;
  let coneColor = null;
  let planeImage = null;
  let planeScale = null;
  let stormSelected = null;
  let stormCardId = "";
  let stormQueryApplied = false;
  let seaRegion = "Baltic";
  const stormMeta = new Map();
  let stormShapeIds = [];
  let loading = false;
  let pending = false;
  let hooked = false;
  let selected = null;
  let camToken = 0;
  let camWait = 0;
  const airTrack = new Map();

  function colors() {
    if (airColor || !window.Cesium) return;
    airColor = Cesium.Color.fromCssColorString("#7ee0ff");
    airPick = Cesium.Color.fromCssColorString("#ffe08a");
    seaColor = Cesium.Color.fromCssColorString("#ffe08a");
    stormColor = Cesium.Color.fromCssColorString("#ff7043");
    camColor = Cesium.Color.fromCssColorString("#7ee0ff");
    trackColor = Cesium.Color.fromCssColorString("#ffe08a");
    coneColor = trackColor.withAlpha(0.2);
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

  function bearing(lon1, lat1, lon2, lat2) {
    const rad = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * rad) * Math.cos(lat2 * rad);
    const x = Math.cos(lat1 * rad) * Math.sin(lat2 * rad) - Math.sin(lat1 * rad) * Math.cos(lat2 * rad) * Math.cos((lon2 - lon1) * rad);
    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  function wrapLon(lon) {
    let x = lon;
    while (x > 180) x -= 360;
    while (x < -180) x += 360;
    return x;
  }

  function headingOf(value) {
    if (!Number.isFinite(value)) return 0;
    return ((value % 360) + 360) % 360;
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
      const alt = Math.max(Number(row.alt) || 0, 400);
      const call = (row.call && String(row.call).trim()) || id;
      const prev = airTrack.get(id);
      let heading = Number(row.heading);
      const moved = prev && (prev.lon !== row.lon || prev.lat !== row.lat);
      if (prev && moved) {
        const at = pose(prev, now);
        const gap = now - (prev.received || now);
        const span = Math.min(20000, Math.max(800, gap));
        if (!Number.isFinite(heading) || heading === 0) heading = bearing(at.lon, at.lat, row.lon, row.lat);
        airTrack.set(id, {
          id,
          call,
          fromLon: at.lon,
          fromLat: at.lat,
          fromAlt: at.alt,
          fromSample: now,
          lon: row.lon,
          lat: row.lat,
          alt,
          sample: now + span,
          received: now,
          heading: headingOf(heading),
        });
      } else if (prev) {
        prev.call = call;
        prev.alt = alt;
        if (Number.isFinite(heading) && heading !== 0) prev.heading = headingOf(heading);
        prev.received = prev.received || now;
      } else {
        airTrack.set(id, {
          id,
          call,
          fromLon: row.lon,
          fromLat: row.lat,
          fromAlt: alt,
          fromSample: now,
          lon: row.lon,
          lat: row.lat,
          alt,
          sample: now,
          received: now,
          heading: headingOf(heading),
        });
      }
    }
    for (const id of airTrack.keys()) {
      if (!seen.has(id)) airTrack.delete(id);
    }
    if (selected && !airTrack.has(selected)) selected = null;
  }

  // Between the previous fix and the latest fix, then hold. No coast past the latest.
  function pose(track, now) {
    const start = track.fromSample;
    const end = track.sample;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || now >= end) {
      return { lon: track.lon, lat: track.lat, alt: track.alt };
    }
    if (now <= start) {
      return { lon: track.fromLon, lat: track.fromLat, alt: track.fromAlt };
    }
    const u = (now - start) / (end - start);
    let dLon = track.lon - track.fromLon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    return {
      lon: wrapLon(track.fromLon + dLon * u),
      lat: track.fromLat + (track.lat - track.fromLat) * u,
      alt: track.fromAlt + (track.alt - track.fromAlt) * u,
    };
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

  function hideFacility(viewer) {
    const ent = viewer.entities && viewer.entities.getById && viewer.entities.getById("facility:gs");
    if (!ent) return;
    ent.show = false;
    if (ent.point) ent.point.show = false;
    if (ent.label) ent.label.show = false;
  }

  function featureList(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.features)) return data.features;
    if (data && Array.isArray(data.storms)) return data.storms;
    return [];
  }

  function pointOf(feature) {
    const geom = feature.geometry;
    if (geom && geom.type === "Point" && Array.isArray(geom.coordinates)) {
      const lon = Number(geom.coordinates[0]);
      const lat = Number(geom.coordinates[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) return { lon, lat };
    }
    if (Number.isFinite(Number(feature.lon)) && Number.isFinite(Number(feature.lat))) {
      return { lon: Number(feature.lon), lat: Number(feature.lat) };
    }
    return null;
  }

  function matchesStorm(props, row) {
    const name = props.name ? String(props.name).trim().toLowerCase() : "";
    const id = props.id ? String(props.id).trim().toLowerCase() : "";
    if (name && row.name && name === String(row.name).trim().toLowerCase()) return true;
    if (id && row.sourceId && id === String(row.sourceId).trim().toLowerCase()) return true;
    return false;
  }

  function polyGeom(geom) {
    if (!geom || !geom.coordinates) return null;
    if (geom.type !== "Polygon" && geom.type !== "MultiPolygon") return null;
    return geom;
  }

  function coneGeom(feature, props) {
    const kind = String(props.kind || "").toLowerCase();
    if (kind === "warning") return null;
    if (kind.indexOf("cone") !== -1) {
      const named = polyGeom(feature.geometry);
      if (named) return named;
    }
    const extra = props.cone || props.forecastCone || props.trackCone || feature.cone;
    if (!extra || typeof extra !== "object") return null;
    return polyGeom(extra);
  }

  function trackLines(feature, props) {
    const kind = String(props.kind || "").toLowerCase();
    if (kind !== "track" && kind !== "forecast-track") return [];
    const geom = feature.geometry;
    if (!geom) return [];
    if (geom.type === "LineString" && Array.isArray(geom.coordinates)) return [geom.coordinates];
    if (geom.type === "MultiLineString" && Array.isArray(geom.coordinates)) return geom.coordinates;
    return [];
  }

  function readStorms(data) {
    const list = featureList(data);
    const rows = [];
    const tracks = [];
    const cones = [];
    const products = [];
    for (let i = 0; i < list.length; i++) {
      const feature = list[i];
      if (!feature) continue;
      const props = feature.properties || feature;
      const kind = String(props.kind || "");
      if (!kind || kind === "storm") {
        const point = pointOf(feature);
        if (point) {
          rows.push({
            id: "storm:" + i + ":" + String(props.id || props.name || ""),
            sourceId: props.id ? String(props.id) : "",
            name: props.name ? String(props.name) : "Storm",
            type: props.label ? String(props.label) : kind || "Storm",
            wind: props.wind ? String(props.wind) : "",
            pressure: props.pressure ? String(props.pressure) : "",
            when: props.when ? String(props.when) : "",
            lon: point.lon,
            lat: point.lat,
            hasCone: false,
          });
        }
      }
      const lines = trackLines(feature, props);
      if (lines.length) tracks.push({ props, lines });
      const cone = coneGeom(feature, props);
      if (cone) cones.push({ props, geom: cone });
      const productKind = String(props.kind || "");
      if (productKind === "wsp34" || productKind === "wsp50" || productKind === "wsp64" || productKind === "arrival-early" || productKind === "arrival-likely" || productKind === "outlook-2d" || productKind === "outlook-7d") {
        const geom = polyGeom(feature.geometry);
        if (geom) products.push({ props, geom, kind: productKind, shape: "polygon" });
        const geomLine = feature.geometry;
        if (geomLine && geomLine.type === "LineString" && Array.isArray(geomLine.coordinates)) {
          products.push({ props, lines: [geomLine.coordinates], kind: productKind, shape: "line" });
        }
      }
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (let c = 0; c < cones.length; c++) {
        if (!matchesStorm(cones[c].props, row)) continue;
        row.hasCone = true;
        break;
      }
    }
    return { rows, tracks, cones, products };
  }

  function flatRing(ring) {
    const flat = [];
    if (!Array.isArray(ring)) return flat;
    for (let i = 0; i < ring.length; i++) {
      const pair = ring[i];
      if (!Array.isArray(pair)) continue;
      const lon = Number(pair[0]);
      const lat = Number(pair[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 360) continue;
      flat.push(lon, lat);
    }
    return flat;
  }

  function raised(flat, height) {
    const out = [];
    for (let i = 0; i < flat.length; i += 2) out.push(flat[i], flat[i + 1], height);
    return Cesium.Cartesian3.fromDegreesArrayHeights(out);
  }

  function clearStormShapes(viewer) {
    if (viewer && viewer.entities) {
      for (let i = 0; i < stormShapeIds.length; i++) {
        const ent = viewer.entities.getById(stormShapeIds[i]);
        if (ent) viewer.entities.remove(ent);
      }
    }
    stormShapeIds = [];
  }

  function addTrack(viewer, id, coords) {
    const flat = flatRing(coords);
    if (flat.length < 4) return;
    const ent = viewer.entities.add({
      id,
      polyline: {
        positions: raised(flat, 900),
        width: 2,
        material: trackColor,
        arcType: Cesium.ArcType.GEODESIC,
      },
    });
    stormShapeIds.push(ent.id);
  }

  function addCone(viewer, id, geom) {
    const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
    if (!Array.isArray(polys)) return;
    for (let p = 0; p < polys.length; p++) {
      const rings = polys[p];
      if (!Array.isArray(rings) || !rings.length) continue;
      const outerFlat = flatRing(rings[0]);
      if (outerFlat.length < 6) continue;
      const holes = [];
      for (let h = 1; h < rings.length; h++) {
        const holeFlat = flatRing(rings[h]);
        if (holeFlat.length < 6) continue;
        holes.push(new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(holeFlat)));
      }
      const ent = viewer.entities.add({
        id: id + ":" + p,
        polygon: {
          hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(outerFlat), holes),
          material: coneColor,
          outline: true,
          outlineColor: trackColor,
          height: 400,
          arcType: Cesium.ArcType.GEODESIC,
        },
      });
      stormShapeIds.push(ent.id);
    }
  }

  function shapeOwner(props, rows) {
    for (let i = 0; i < rows.length; i++) {
      if (matchesStorm(props, rows[i])) return rows[i].id;
    }
    return "";
  }

  function drawStormShapes(viewer, pack) {
    clearStormShapes(viewer);
    if (!viewer || !viewer.entities) return;
    colors();
    let n = 0;
    for (let i = 0; i < pack.cones.length; i++) {
      const owner = encodeURIComponent(shapeOwner(pack.cones[i].props, pack.rows));
      n += 1;
      addCone(viewer, "stormcone:" + owner + ":" + n, pack.cones[i].geom);
    }
    const productColors = {
      wsp34: Cesium.Color.fromCssColorString("#7ee0ff").withAlpha(0.28),
      wsp50: Cesium.Color.fromCssColorString("#1490d0").withAlpha(0.32),
      wsp64: Cesium.Color.fromCssColorString("#0e78b8").withAlpha(0.36),
      "arrival-early": Cesium.Color.fromCssColorString("#ffe08a").withAlpha(0.16),
      "arrival-likely": Cesium.Color.fromCssColorString("#ffe08a").withAlpha(0.3),
      "outlook-2d": Cesium.Color.fromCssColorString("#e6c56a").withAlpha(0.18),
      "outlook-7d": Cesium.Color.fromCssColorString("#b0893e").withAlpha(0.16),
    };
    const savedCone = coneColor;
    const savedTrack = trackColor;
    for (let i = 0; i < (pack.products || []).length; i++) {
      const item = pack.products[i];
      n += 1;
      if (item.shape === "line" && item.lines) {
        trackColor = productColors[item.kind] || savedTrack;
        for (let k = 0; k < item.lines.length; k++) addTrack(viewer, "stormproduct:" + item.kind + ":" + n + ":" + k, item.lines[k]);
        continue;
      }
      if (!item.geom) continue;
      coneColor = productColors[item.kind] || savedCone;
      addCone(viewer, "stormproduct:" + item.kind + ":" + n, item.geom);
    }
    coneColor = savedCone;
    trackColor = savedTrack;
    for (let i = 0; i < pack.tracks.length; i++) {
      const owner = encodeURIComponent(shapeOwner(pack.tracks[i].props, pack.rows));
      const lines = pack.tracks[i].lines;
      for (let k = 0; k < lines.length; k++) {
        n += 1;
        addTrack(viewer, "stormtrack:" + owner + ":" + n, lines[k]);
      }
    }
  }

  function syncStorms(viewer, data) {
    if (!stormPoints) stormPoints = points(viewer);
    const live = stormPoints._exo;
    const seen = new Set();
    const pack = readStorms(data);
    const rows = pack.rows;
    stormMeta.clear();
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      seen.add(row.id);
      stormMeta.set(row.id, row);
      const position = Cesium.Cartesian3.fromDegrees(row.lon, row.lat, 150);
      const prim = live.get(row.id);
      if (prim) prim.position = position;
      else {
        live.set(row.id, stormPoints.add({
          id: row.id,
          position,
          pixelSize: 9,
          color: stormColor,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 1,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }));
      }
    }
    for (const [id, prim] of live) {
      if (seen.has(id)) continue;
      stormPoints.remove(prim);
      live.delete(id);
    }
    drawStormShapes(viewer, pack);
    if (stormSelected && !stormMeta.has(stormSelected)) stormSelected = null;
    openStormQuery();
  }

  function stormWanted() {
    try {
      return (new URLSearchParams(window.location.search).get("storm") || "").trim().toLowerCase();
    } catch (err) {
      return "";
    }
  }

  function openStormQuery() {
    if (stormQueryApplied) return;
    const want = stormWanted();
    if (!want) {
      stormQueryApplied = true;
      return;
    }
    for (const row of stormMeta.values()) {
      if (String(row.name || "").trim().toLowerCase() !== want) continue;
      stormSelected = row.id;
      selected = null;
      stormQueryApplied = true;
      return;
    }
  }

  function rainHost(host) {
    if (!host || typeof host !== "string") return "";
    let hostname = "";
    try {
      hostname = new URL(host).hostname;
    } catch (err) {
      return "";
    }
    if (!/(^|\.)rainviewer\.com$/i.test(hostname)) return "";
    return host.charAt(host.length - 1) === "/" ? host.slice(0, -1) : host;
  }

  function pastUrl(host, frame) {
    if (!host || !frame || frame.forecast) return "";
    const path = frame.path ? String(frame.path) : "";
    if (!path || /infrared|satellite|nowcast/i.test(path)) return "";
    if (path.indexOf("/radar/") === -1) return "";
    return host + (path.charAt(0) === "/" ? path : "/" + path) + RADAR_SUFFIX;
  }

  function cleanPast(list) {
    const out = [];
    const rows = list || [];
    for (let i = 0; i < rows.length; i++) {
      const frame = rows[i];
      if (!frame || !frame.tileUrl) continue;
      const url = String(frame.tileUrl);
      if (!url.endsWith(RADAR_SUFFIX)) continue;
      if (/infrared|satellite|nowcast/i.test(url)) continue;
      try {
        if (!/(^|\.)rainviewer\.com$/i.test(new URL(url).hostname)) continue;
      } catch (err) {
        continue;
      }
      const time = Number(frame.time);
      out.push({ time: Number.isFinite(time) ? time : 0, tileUrl: url });
    }
    return out;
  }

  function collectPast(info) {
    if (!info) return [];
    if (Array.isArray(info.past)) {
      try {
        return cleanPast(info.past);
      } catch (err) {
        return [];
      }
    }
    const host = rainHost(info.host);
    const frames = Array.isArray(info.frames) ? info.frames : [];
    const out = [];
    if (!host) return out;
    for (let i = 0; i < frames.length; i++) {
      const url = pastUrl(host, frames[i]);
      if (!url) continue;
      const time = Number(frames[i].time);
      out.push({ time: Number.isFinite(time) ? time : 0, tileUrl: url });
    }
    return out;
  }

  function clearRadar(viewer) {
    if (radarLayer && viewer && viewer.imageryLayers) {
      viewer.imageryLayers.remove(radarLayer, true);
    }
    radarLayer = null;
    radarUrl = "";
  }

  function showRadar(viewer, url) {
    if (!url || !viewer) return;
    if (radarLayer && radarUrl === url) return;
    clearRadar(viewer);
    const provider = new Cesium.UrlTemplateImageryProvider({
      url,
      minimumLevel: 0,
      maximumLevel: 7,
      tileWidth: 256,
      tileHeight: 256,
      credit: RADAR_CREDIT,
    });
    radarLayer = viewer.imageryLayers.addImageryProvider(provider);
    radarLayer.alpha = 0.55;
    radarUrl = url;
    if (viewer.scene.requestRenderMode) viewer.scene.requestRender();
  }

  function zoneClock(ms) {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(new Date(ms));
    } catch (err) {
      return "";
    }
  }

  function setClockVisible(on) {
    const clock = document.getElementById("exo-radar-clock");
    if (!clock) return;
    clock.hidden = !on;
    clock.style.display = on ? "inline-flex" : "none";
  }

  function paintRadarClock() {
    const clock = document.getElementById("exo-radar-clock");
    if (!clock) return;
    setClockVisible(radarOn);
    const time = document.getElementById("exo-radar-time");
    const play = document.getElementById("exo-radar-play");
    const prev = document.getElementById("exo-radar-prev");
    const next = document.getElementById("exo-radar-next");
    const live = document.getElementById("exo-radar-live");
    const has = radarFrames.length > 0;
    const showPaused = radarHold || !has;
    if (prev) prev.disabled = !has;
    if (next) next.disabled = !has;
    if (play) {
      play.disabled = !has || radarFrames.length < 2;
      play.textContent = radarPlaying ? "STOP" : "PLAY";
      play.setAttribute("aria-pressed", radarPlaying ? "true" : "false");
    }
    if (live) live.hidden = showPaused || !has || radarIndex !== radarFrames.length - 1;
    if (time) {
      if (showPaused) time.textContent = "Radar paused";
      else {
        const ms = Number(radarFrames[radarIndex].time) * 1000;
        time.textContent = Number.isFinite(ms) && ms > 0 ? zoneClock(ms) : "Radar";
      }
    }
  }

  function stopRadarPlay() {
    radarPlaying = false;
    if (radarTimer) {
      clearInterval(radarTimer);
      radarTimer = null;
    }
  }

  function startRadarPlay() {
    if (radarPlaying || radarHold || radarFrames.length < 2) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    radarPlaying = true;
    radarTimer = setInterval(() => {
      if (!radarOn || radarHold || radarFrames.length < 2) {
        stopRadarPlay();
        paintRadarClock();
        return;
      }
      stepRadar(1);
    }, 2200);
    paintRadarClock();
  }

  function stepRadar(dir) {
    if (!radarFrames.length) return;
    radarHold = false;
    radarIndex = (radarIndex + dir + radarFrames.length) % radarFrames.length;
    const viewer = window.EXOPACE_VIEWER;
    if (viewer) showRadar(viewer, radarFrames[radarIndex].tileUrl);
    paintRadarClock();
    step();
  }

  function adoptRadar(viewer, info) {
    const past = collectPast(info);
    if (!past.length) {
      radarHold = true;
      stopRadarPlay();
      paintRadarClock();
      return;
    }
    radarHold = false;
    const prev = radarFrames[radarIndex];
    radarFrames = past;
    let idx = -1;
    if (prev) {
      for (let i = 0; i < radarFrames.length; i++) {
        if (radarFrames[i].time === prev.time) idx = i;
      }
    }
    if (idx < 0) idx = radarFrames.length - 1;
    radarIndex = idx;
    if (radarFrames.length < 2) stopRadarPlay();
    showRadar(viewer, radarFrames[radarIndex].tileUrl);
    paintRadarClock();
  }

  function cameraMax(viewer) {
    let cap = 2500;
    try {
      const carto = viewer.camera.positionCartographic;
      const height = carto && carto.height;
      if (Number.isFinite(height) && height > 8e6) cap = 2000;
    } catch (err) {
      cap = 2500;
    }
    return Math.min(cap, 2500);
  }

  function viewBox(viewer) {
    let rect = null;
    try {
      rect = viewer.camera.computeViewRectangle();
    } catch (err) {
      rect = null;
    }
    if (!rect) return null;
    return {
      west: Cesium.Math.toDegrees(rect.west),
      south: Cesium.Math.toDegrees(rect.south),
      east: Cesium.Math.toDegrees(rect.east),
      north: Cesium.Math.toDegrees(rect.north),
    };
  }

  function cameraId(feature) {
    const props = feature.properties || {};
    if (props.id) return String(props.id);
    if (feature.id != null && typeof feature.id !== "object") return String(feature.id);
    return "";
  }

  function drawCameras(viewer, data, max) {
    if (!camPoints) camPoints = points(viewer);
    const live = camPoints._exo;
    const seen = new Set();
    const features = data && Array.isArray(data.features) ? data.features : [];
    const limit = Math.min(features.length, max);
    for (let i = 0; i < limit; i++) {
      const feature = features[i];
      if (!feature) continue;
      const props = feature.properties || {};
      const mark = props.m ? String(props.m) : "";
      if (mark && mark !== "r" && mark !== "v") continue;
      const geom = feature.geometry;
      if (!geom || geom.type !== "Point" || !Array.isArray(geom.coordinates)) continue;
      const lon = Number(geom.coordinates[0]);
      const lat = Number(geom.coordinates[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      const raw = cameraId(feature);
      if (!raw) continue;
      const id = "cam:" + raw;
      seen.add(id);
      const position = Cesium.Cartesian3.fromDegrees(lon, lat, 120);
      const prim = live.get(id);
      if (prim) prim.position = position;
      else {
        live.set(id, camPoints.add({
          id,
          position,
          pixelSize: 6,
          color: camColor,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        }));
      }
    }
    for (const [id, prim] of live) {
      if (seen.has(id)) continue;
      camPoints.remove(prim);
      live.delete(id);
    }
    if (viewer.scene.requestRenderMode) viewer.scene.requestRender();
  }

  async function syncCameras(viewer) {
    if (!viewer || !window.Cesium || !camsOn) return;
    const token = ++camToken;
    const box = viewBox(viewer);
    if (!box) return;
    const max = cameraMax(viewer);
    const bbox = [box.west, box.south, box.east, box.north].map((n) => n.toFixed(3)).join(",");
    let data = null;
    try {
      const res = await fetch(CAMS + "?bbox=" + bbox + "&max=" + max + "&reachable=1", {
        credentials: "omit",
        cache: "no-store",
      });
      if (!res.ok) return;
      data = await res.json();
    } catch (err) {
      return;
    }
    if (token !== camToken || !camsOn || !data) return;
    colors();
    drawCameras(viewer, data, max);
  }

  function refreshCameras(immediate) {
    if (!camsOn) {
      camToken++;
      clearBag(camPoints);
      return;
    }
    window.clearTimeout(camWait);
    const run = () => {
      void syncCameras(window.EXOPACE_VIEWER);
    };
    if (immediate) run();
    else camWait = window.setTimeout(run, 500);
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

  function fixRadarLine(row) {
    const when = Date.parse(row.when || "");
    const fix = Number.isFinite(when) ? zoneClock(when) : "";
    const frame = radarOn && !radarHold ? radarFrames[radarIndex] : null;
    const radarMs = frame ? Number(frame.time) * 1000 : NaN;
    const radar = Number.isFinite(radarMs) && radarMs > 0 ? zoneClock(radarMs) : "";
    if (fix && radar) return "Fix " + fix + " · Radar " + radar;
    if (fix) return "Fix " + fix;
    if (radar) return "Radar " + radar;
    return "";
  }

  function fillStormCard(card, row) {
    card.replaceChildren();
    const name = document.createElement("div");
    name.textContent = row.name;
    const type = document.createElement("div");
    type.textContent = row.type;
    card.append(name, type);
    if (row.wind) {
      const wind = document.createElement("div");
      wind.textContent = row.wind;
      card.append(wind);
    }
    if (row.pressure) {
      const pressure = document.createElement("div");
      pressure.textContent = row.pressure;
      card.append(pressure);
    }
    if (!row.hasCone) {
      const note = document.createElement("div");
      note.textContent = "This advisory has no cone.";
      card.append(note);
    }
    const times = fixRadarLine(row);
    if (times) {
      const line = document.createElement("div");
      line.textContent = times;
      card.append(line);
    }
    const link = document.createElement("a");
    const stormName = row.name ? String(row.name).trim() : "";
    link.href = stormName
      ? "https://cams.exopace.net/map?storm=" + encodeURIComponent(stormName)
      : "https://cams.exopace.net/map";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open on Cams";
    link.style.color = "#7ee0ff";
    link.style.display = "inline-block";
    link.style.marginTop = "4px";
    card.append(link);
  }

  function step() {
    const viewer = window.EXOPACE_VIEWER;
    if (!viewer || !window.Cesium) return;
    hideFacility(viewer);
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
    const stormCard = document.getElementById("exo-storm");
    const storm = stormSelected ? stormMeta.get(stormSelected) : null;
    if (stormCard) {
      const frame = radarFrames[radarIndex];
      const stamp = storm ? storm.id + "|" + (frame ? frame.time : "") + "|" + (storm.hasCone ? "1" : "0") + "|" + (radarHold ? "h" : "") : "";
      if (!storm || !stormOn) {
        stormCard.hidden = true;
        stormCardId = "";
      } else if (stormCardId !== stamp) {
        stormCard.hidden = false;
        fillStormCard(stormCard, storm);
        stormCardId = stamp;
      } else stormCard.hidden = false;
    }
    if (!airOn) {
      if (viewer.scene.requestRenderMode) viewer.scene.requestRender();
      return;
    }
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

  function hitId(hit) {
    if (!hit) return "";
    if (typeof hit.id === "string") return hit.id;
    if (hit.id && typeof hit.id.id === "string") return hit.id.id;
    const prim = hit.primitive;
    if (!prim) return "";
    if (typeof prim.id === "string") return prim.id;
    if (prim.id && typeof prim.id.id === "string") return prim.id.id;
    return "";
  }

  function stormFromHit(id) {
    if (stormMeta.has(id)) return id;
    const match = /^(?:stormtrack|stormcone):([^:]*):\d+(?::\d+)?$/.exec(id);
    if (!match) return "";
    let stormId = "";
    try {
      stormId = decodeURIComponent(match[1]);
    } catch (err) {
      return "";
    }
    return stormMeta.has(stormId) ? stormId : "";
  }

  function openCamera(id) {
    const raw = id.slice(4);
    if (!raw) return;
    window.open("https://cams.exopace.net/map?camera=" + encodeURIComponent(raw), "_blank", "noopener,noreferrer");
  }

  function hook(viewer) {
    if (hooked) return;
    hooked = true;
    viewer.scene.preRender.addEventListener(step);
    viewer.camera.moveEnd.addEventListener(() => {
      if (camsOn) refreshCameras(false);
    });
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const id = hitId(viewer.scene.pick(click.position));
      if (id.indexOf("cam:") === 0) {
        openCamera(id);
        return;
      }
      const stormId = stormFromHit(id);
      if (stormId) {
        stormSelected = stormId;
        selected = null;
      } else {
        stormSelected = null;
        selected = id && airTrack.has(id) ? id : null;
      }
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
    refreshCameras(true);
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
        if (body && body.region) {
          seaRegion = String(body.region);
          const caption = document.getElementById("exo-sea-caption");
          if (caption) caption.textContent = seaRegion;
        }
        syncShips(viewer, body.ships);
      } else clearBag(seaPoints);
      step();
    } catch (err) {
      /* a failed feed leaves the last points in place */
    }
    try {
      const weather = window.EXOPACE_WEATHER;
      if (radarOn && weather && typeof weather.loadRadar === "function") {
        const info = await weather.loadRadar();
        if (radarOn) adoptRadar(viewer, info);
      } else {
        stopRadarPlay();
        radarFrames = [];
        radarHold = false;
        clearRadar(viewer);
        paintRadarClock();
      }
      if (stormOn) {
        let data = null;
        if (weather && typeof weather.loadStorms === "function") data = await weather.loadStorms();
        else {
          const res = await fetch(STORM_URL, { credentials: "omit", cache: "no-store" });
          if (res.ok) data = await res.json();
        }
        if (stormOn && data) syncStorms(viewer, data);
      } else {
        stormSelected = null;
        stormMeta.clear();
        clearBag(stormPoints);
        clearStormShapes(viewer);
      }
      step();
    } catch (err) {
      /* a failed weather feed leaves the last layer in place */
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

  function button(label, onClick, on) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "btn" + (on === false ? "" : " on");
    node.textContent = label;
    node.style.marginLeft = "6px";
    node.addEventListener("click", () => {
      const next = onClick();
      node.className = "btn" + (next ? " on" : "");
    });
    return node;
  }

  function clockButton(id, label) {
    const node = document.createElement("button");
    node.type = "button";
    node.className = "btn";
    node.id = id;
    node.textContent = label;
    return node;
  }

  function paintLegend() {
    const node = document.getElementById("exo-legend");
    if (!node) return;
    node.textContent = camsOn ? LEGEND + " Cyan dots are cameras." : LEGEND;
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
    bar.style.flexDirection = "column";
    bar.style.alignItems = "flex-start";
    bar.style.gap = "4px";
    bar.style.maxWidth = "calc(100vw - 28px)";
    const row = document.createElement("div");
    row.id = "exo-traffic-row";
    row.style.display = "flex";
    row.style.flexWrap = "wrap";
    row.style.gap = "4px";
    row.style.maxWidth = "100%";
    const seaCaption = document.createElement("span");
    seaCaption.id = "exo-sea-caption";
    seaCaption.textContent = seaRegion || "Baltic";
    seaCaption.style.alignSelf = "center";
    seaCaption.style.color = "#ffe08a";
    seaCaption.style.font = "10px IBM Plex Mono, ui-monospace, monospace";
    seaCaption.style.letterSpacing = "0.08em";
    const clock = document.createElement("div");
    clock.id = "exo-radar-clock";
    clock.hidden = true;
    clock.style.display = "none";
    clock.setAttribute("aria-label", "Radar frames");
    const prev = clockButton("exo-radar-prev", "PREV");
    const play = clockButton("exo-radar-play", "PLAY");
    const next = clockButton("exo-radar-next", "NEXT");
    prev.setAttribute("aria-label", "Previous radar frame");
    play.setAttribute("aria-label", "Play or stop radar");
    next.setAttribute("aria-label", "Next radar frame");
    const time = document.createElement("span");
    time.id = "exo-radar-time";
    time.textContent = "Radar paused";
    const live = document.createElement("span");
    live.id = "exo-radar-live";
    live.textContent = "Live";
    live.hidden = true;
    prev.addEventListener("click", () => stepRadar(-1));
    next.addEventListener("click", () => stepRadar(1));
    play.addEventListener("click", () => {
      if (radarPlaying) stopRadarPlay();
      else startRadarPlay();
      paintRadarClock();
    });
    clock.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
      ev.preventDefault();
      stepRadar(ev.key === "ArrowLeft" ? -1 : 1);
    });
    clock.append(prev, play, next, time, live);
    const cameras = document.createElement("a");
    cameras.className = "btn";
    cameras.href = "https://cams.exopace.net/map";
    cameras.target = "_blank";
    cameras.rel = "noopener noreferrer";
    cameras.textContent = "Cameras";
    cameras.style.marginLeft = "6px";
    cameras.style.textDecoration = "none";
    row.append(
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
      seaCaption,
      button("RADAR", () => {
        radarOn = !radarOn;
        void load();
        return radarOn;
      }),
      clock,
      button("STORMS", () => {
        stormOn = !stormOn;
        void load();
        return stormOn;
      }),
      button("CAMERAS", () => {
        camsOn = !camsOn;
        paintLegend();
        refreshCameras(true);
        return camsOn;
      }, false),
      cameras,
    );
    const legend = document.createElement("p");
    legend.id = "exo-legend";
    legend.textContent = LEGEND;
    legend.style.margin = "0";
    legend.style.color = "#7d9088";
    legend.style.font = "11px IBM Plex Sans, system-ui, sans-serif";
    legend.style.letterSpacing = "0";
    legend.style.whiteSpace = "nowrap";
    bar.append(row, legend);
    const card = document.createElement("div");
    card.id = "exo-craft";
    card.hidden = true;
    card.style.position = "absolute";
    card.style.left = "14px";
    card.style.bottom = "calc(188px + env(safe-area-inset-bottom))";
    card.style.zIndex = "6";
    card.style.padding = "6px 10px";
    card.style.border = "1px solid rgba(126,224,255,.45)";
    card.style.background = "rgba(3,6,11,.9)";
    card.style.color = "#e6f0ea";
    card.style.font = "12px IBM Plex Mono, ui-monospace, monospace";
    card.style.maxWidth = "min(220px, calc(100vw - 28px))";
    const stormCard = document.createElement("div");
    stormCard.id = "exo-storm";
    stormCard.hidden = true;
    stormCard.style.position = "absolute";
    stormCard.style.left = "14px";
    stormCard.style.bottom = "calc(210px + env(safe-area-inset-bottom))";
    stormCard.style.zIndex = "6";
    stormCard.style.padding = "6px 10px";
    stormCard.style.border = "1px solid rgba(126,224,255,.45)";
    stormCard.style.background = "rgba(3,6,11,.9)";
    stormCard.style.color = "#e6f0ea";
    stormCard.style.font = "12px IBM Plex Mono, ui-monospace, monospace";
    stormCard.style.maxWidth = "min(220px, calc(100vw - 28px))";
    stormCard.style.lineHeight = "1.35";
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
    hud.append(bar, card, stormCard, locateBtn);
    paintLegend();
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
