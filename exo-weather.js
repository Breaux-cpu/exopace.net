/* Storm and radar catalogs for Mission Control. Data only — drawing is in exo-traffic. */
(function () {
  var STORMS = "/api/weather/storms";
  var RADAR = "/api/weather/radar";
  var RADAR_DIRECT = "https://api.rainviewer.com/public/weather-maps.json";
  var CREDIT = "Radar © RainViewer";
  var storms = [];
  var radar = { host: "", frames: [], past: [], attribution: CREDIT, tileUrl: "" };

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

  /* Past RainViewer frames only.
     {host}{path}/256/{z}/{x}/{y}/2/1_1.png — color 2, suffix 1_1, zoom 0–7.
     Nowcast and infrared paths are not turned into tile URLs. */
  function rainHost(data) {
    var host = data && typeof data.host === "string" ? data.host : "";
    if (!host) return "";
    var hostname = "";
    try {
      hostname = new URL(host).hostname;
    } catch (e) {
      return "";
    }
    if (!/(^|\.)rainviewer\.com$/i.test(hostname)) return "";
    if (host.charAt(host.length - 1) === "/") host = host.slice(0, -1);
    return host;
  }

  function frameUrl(host, frame) {
    if (!host || !frame || frame.forecast) return "";
    var path = frame.path ? String(frame.path) : "";
    if (!path || /infrared|satellite|nowcast/i.test(path)) return "";
    if (path.indexOf("/radar/") === -1) return "";
    if (path.charAt(0) !== "/") path = "/" + path;
    return host + path + "/256/{z}/{x}/{y}/2/1_1.png";
  }

  function frameList(data) {
    if (data && Array.isArray(data.frames)) return data.frames;
    if (data && data.radar && Array.isArray(data.radar.past)) return data.radar.past;
    return [];
  }

  function pastFrames(data) {
    var host = rainHost(data);
    var frames = frameList(data);
    var out = [];
    if (!host) return out;
    for (var i = 0; i < frames.length; i++) {
      var url = frameUrl(host, frames[i]);
      if (!url) continue;
      var time = Number(frames[i].time);
      out.push({ time: Number.isFinite(time) ? time : 0, tileUrl: url });
    }
    return out;
  }

  function loadRadar() {
    function pull(url) {
      return fetch(url, { credentials: "omit", cache: "no-store" }).then(function (res) {
        if (!res.ok) throw new Error("radar " + res.status);
        return res.json();
      });
    }
    return pull(RADAR).catch(function () {
      return pull(RADAR_DIRECT);
    }).then(function (data) {
      var past = pastFrames(data);
      radar = {
        host: rainHost(data),
        frames: data && Array.isArray(data.frames) ? data.frames : [],
        past: past,
        attribution: CREDIT,
        tileUrl: past.length ? past[past.length - 1].tileUrl : "",
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
