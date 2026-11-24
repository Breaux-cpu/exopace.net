/* Multi-vehicle sectors, 3D separation, and ADS-B proximity. No invented vehicles. */
(function (root) {
  function finite(n) {
    return typeof n === "number" && Number.isFinite(n);
  }

  function meters(a, b) {
    var radius = 6371000;
    var p1 = a.lat * Math.PI / 180;
    var p2 = b.lat * Math.PI / 180;
    var dp = (b.lat - a.lat) * Math.PI / 180;
    var dl = (b.lon - a.lon) * Math.PI / 180;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function latest(list) {
    var byId = {};
    var order = [];
    var rows = list || [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      if (!row || !finite(row.sysid) || !finite(row.lat) || !finite(row.lon)) continue;
      if (!byId[row.sysid]) order.push(row.sysid);
      byId[row.sysid] = {
        sysid: row.sysid,
        lat: row.lat,
        lon: row.lon,
        altM: finite(row.altM) ? row.altM : null,
      };
    }
    var vehicles = [];
    for (var n = 0; n < order.length; n++) vehicles.push(byId[order[n]]);
    return vehicles;
  }

  function quadrant(vehicle, center) {
    var north = vehicle.lat >= center.lat;
    var east = vehicle.lon >= center.lon;
    if (north && east) return "NE";
    if (north) return "NW";
    if (east) return "SE";
    return "SW";
  }

  function orchestrate(list, traffic, opts) {
    var vehicles = latest(list);
    if (!vehicles.length) {
      return { status: "NO VEHICLES", vehicles: [], sectors: [], conflicts: [], traffic: [] };
    }
    var lat = 0;
    var lon = 0;
    for (var i = 0; i < vehicles.length; i++) {
      lat += vehicles[i].lat;
      lon += vehicles[i].lon;
    }
    var center = { lat: lat / vehicles.length, lon: lon / vehicles.length };
    var separation = opts && finite(opts.separationM) && opts.separationM > 0 ? opts.separationM : 50;
    var avoidM = opts && finite(opts.avoidM) && opts.avoidM > 0 ? opts.avoidM : 500;
    var sectors = [];
    for (var s = 0; s < vehicles.length; s++) {
      sectors.push({ sysid: vehicles[s].sysid, sector: quadrant(vehicles[s], center) });
    }
    var conflicts = [];
    for (var a = 0; a < vehicles.length; a++) {
      for (var b = a + 1; b < vehicles.length; b++) {
        if (vehicles[a].altM == null || vehicles[b].altM == null) continue;
        var ground = meters(vehicles[a], vehicles[b]);
        var dz = vehicles[a].altM - vehicles[b].altM;
        var dist = Math.sqrt(ground * ground + dz * dz);
        if (dist < separation) conflicts.push({ a: vehicles[a].sysid, b: vehicles[b].sysid, meters: dist });
      }
    }
    var alerts = [];
    var craft = traffic || [];
    for (var t = 0; t < craft.length; t++) {
      var hit = craft[t];
      if (!hit || !finite(hit.lat) || !finite(hit.lon)) continue;
      for (var v = 0; v < vehicles.length; v++) {
        var gap = meters(vehicles[v], hit);
        if (gap < avoidM) alerts.push({ sysid: vehicles[v].sysid, icao: hit.icao || null, meters: gap });
      }
    }
    return { status: "ASSIGNED", vehicles: vehicles, sectors: sectors, conflicts: conflicts, traffic: alerts, center: center };
  }

  function mount(doc) {
    var documentRef = doc || (typeof document !== "undefined" ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== "function") return;
    var run = function () {
      var host = documentRef.getElementById("exo-swarm");
      if (host) host.textContent = "NO VEHICLES";
    };
    if (documentRef.readyState === "loading" && typeof documentRef.addEventListener === "function") {
      documentRef.addEventListener("DOMContentLoaded", run);
      return;
    }
    run();
  }

  root.EXO = root.EXO || {};
  root.EXO.swarm = { orchestrate: orchestrate, mount: mount };
  if (typeof document !== "undefined") mount(document);
})(typeof globalThis !== "undefined" ? globalThis : this);
