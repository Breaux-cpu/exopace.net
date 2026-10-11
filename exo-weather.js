/* Storm and radar catalogs for Mission Control. Data only — drawing is in exo-traffic. */
(function () {
  var STORMS = "https://cams.exopace.net/api/weather/storms";
  var RADAR = "https://cams.exopace.net/api/weather/radar";
  var storms = [];
  var radar = { host: "", frames: [], attribution: "", tileUrl: "" };

  function loadStorms() {
    return fetch(STORMS, {
      credentials: "omit",
      cache: "no-store",
    }).then(function (res) {
      if (!res.ok) {
        throw new Error("storms " + res.status);
      }
      return res.json();
    }).then(function (data) {
      if (Array.isArray(data)) {
        storms = data;
      } else if (data && Array.isArray(data.storms)) {
        storms = data.storms;
      } else if (data && Array.isArray(data.features)) {
        storms = data.features;
      } else {
        storms = [];
      }
      api.storms = storms;
      return storms;
    });
  }

  /* Latest observed frame. Tile path matches the weather service:
     {host}{path}/256/{z}/{x}/{y}/2/1_1.png — RainViewer only, zoom 0–7. */
  function tileUrl(data) {
    var host = data && typeof data.host === "string" ? data.host : "";
    var frames = data && Array.isArray(data.frames) ? data.frames : [];
    if (!host || !frames.length) return "";
    var hostname = "";
    try {
      hostname = new URL(host).hostname;
    } catch (e) {
      return "";
    }
    if (!/(^|\.)rainviewer\.com$/i.test(hostname)) return "";
    var frame = null;
    for (var i = 0; i < frames.length; i++) {
      if (frames[i] && frames[i].path && !frames[i].forecast) frame = frames[i];
    }
    if (!frame) frame = frames[frames.length - 1];
    if (!frame || !frame.path) return "";
    var path = String(frame.path);
    if (path.charAt(0) !== "/") path = "/" + path;
    if (host.charAt(host.length - 1) === "/") host = host.slice(0, -1);
    return host + path + "/256/{z}/{x}/{y}/2/1_1.png";
  }

  function loadRadar() {
    return fetch(RADAR, {
      credentials: "omit",
      cache: "no-store",
    }).then(function (res) {
      if (!res.ok) {
        throw new Error("radar " + res.status);
      }
      return res.json();
    }).then(function (data) {
      radar = {
        host: data && typeof data.host === "string" ? data.host : "",
        frames: data && Array.isArray(data.frames) ? data.frames : [],
        attribution: data && typeof data.attribution === "string" ? data.attribution : "",
        tileUrl: tileUrl(data),
      };
      api.radar = radar;
      return radar;
    }).catch(function () {
      return api.radar;
    });
  }

  var api = {
    loadStorms: loadStorms,
    loadRadar: loadRadar,
    storms: storms,
    radar: radar,
  };

  window.EXOPACE_WEATHER = api;
})();
