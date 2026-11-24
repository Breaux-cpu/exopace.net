/* Bearings and RSSI only from the points the operator or a real rf packet supplies. */
(function (root) {
  function wrap(deg) {
    return (deg % 360 + 360) % 360;
  }

  function trueBearing(magnetic, declination) {
    if (!Number.isFinite(magnetic) || !Number.isFinite(declination)) return null;
    return wrap(magnetic + declination);
  }

  function destination(lat, lon, bearing, meters) {
    var R = 6371000;
    var b = bearing * Math.PI / 180;
    var p1 = lat * Math.PI / 180;
    var l1 = lon * Math.PI / 180;
    var d = meters / R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    var l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 * 180 / Math.PI, lon: ((l2 * 180 / Math.PI + 540) % 360) - 180 };
  }

  function project(lat, lon) {
    var latR = lat * Math.PI / 180;
    return { x: lon * Math.PI / 180 * Math.cos(latR), y: latR };
  }

  function lob(stations) {
    var rays = stations.filter(function (row) {
      return Number.isFinite(row.lat) && Number.isFinite(row.lon) && Number.isFinite(row.bearingTrue);
    });
    if (rays.length < 2) return null;
    var a = rays[0];
    var b = rays[1];
    var a0 = project(a.lat, a.lon);
    var b0 = project(b.lat, b.lon);
    var ad = { x: Math.sin(a.bearingTrue * Math.PI / 180), y: Math.cos(a.bearingTrue * Math.PI / 180) };
    var bd = { x: Math.sin(b.bearingTrue * Math.PI / 180), y: Math.cos(b.bearingTrue * Math.PI / 180) };
    var det = ad.x * bd.y - ad.y * bd.x;
    if (Math.abs(det) < 1e-8) return null;
    var dx = b0.x - a0.x;
    var dy = b0.y - a0.y;
    var t = (dx * bd.y - dy * bd.x) / det;
    if (t < 0) return null;
    var lat = (a0.y + ad.y * t) * 180 / Math.PI;
    var lon = (a0.x + ad.x * t) / Math.cos(lat * Math.PI / 180) * 180 / Math.PI;
    var far = destination(a.lat, a.lon, a.bearingTrue, 30000);
    return { lat: lat, lon: lon, ray: [a, far] };
  }

  function rssi(nodes) {
    var rows = nodes.filter(function (row) {
      return Number.isFinite(row.lat) && Number.isFinite(row.lon) && Number.isFinite(row.rssi);
    });
    if (rows.length < 2) return null;
    var weight = 0;
    var lat = 0;
    var lon = 0;
    rows.forEach(function (row) {
      var w = Math.pow(10, row.rssi / 20);
      weight += w;
      lat += row.lat * w;
      lon += row.lon * w;
    });
    if (weight <= 0) return null;
    var point = { lat: lat / weight, lon: lon / weight };
    var spread = 0;
    rows.forEach(function (row) {
      var dLat = (row.lat - point.lat) * 111320;
      var dLon = (row.lon - point.lon) * 111320 * Math.cos(point.lat * Math.PI / 180);
      spread += dLat * dLat + dLon * dLon;
    });
    return { lat: point.lat, lon: point.lon, cepM: Math.sqrt(spread / rows.length) };
  }

  root.EXO = root.EXO || {};
  root.EXO.df = { wrap: wrap, trueBearing: trueBearing, destination: destination, lob: lob, rssi: rssi };
})(typeof globalThis !== "undefined" ? globalThis : window);
