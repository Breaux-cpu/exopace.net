/* After-action archive from events the operator already recorded. */
(function (root) {
  function dossier(session) {
    var rows = session.events || [];
    var html = "<!doctype html><meta charset=utf-8><title>EXOpace AAR</title><body style=\"background:#04070D;color:#d5dde2;font-family:IBM Plex Mono,monospace\">";
    html += "<h1 style=\"color:#7EE0FF\">EXOPACE AAR</h1>";
    html += "<p>" + (session.title || "FIELD SESSION") + "</p><ol>";
    rows.forEach(function (row) {
      html += "<li>" + (row.t || "") + " · " + (row.kind || "NOTE") + " · " + (row.text || "") + "</li>";
    });
    html += "</ol></body>";
    return html;
  }

  function kml(session) {
    var marks = (session.waypoints || []).map(function (point) {
      return "<Placemark><name>" + (point.label || "WAY") + "</name><Point><coordinates>"
        + point.lon + "," + point.lat + ",0</coordinates></Point></Placemark>";
    }).join("");
    return "<?xml version=\"1.0\" encoding=\"UTF-8\"?><kml xmlns=\"http://www.opengis.net/kml/2.2\"><Document>" + marks + "</Document></kml>";
  }

  function json(session) {
    return JSON.stringify({ title: session.title || "FIELD SESSION", events: session.events || [], waypoints: session.waypoints || [] });
  }

  root.EXO = root.EXO || {};
  root.EXO.aar = { dossier: dossier, kml: kml, json: json };
})(typeof globalThis !== "undefined" ? globalThis : window);
