export const TOKENS = {
  void: "#04070d",
  glass: "rgba(10, 18, 30, 0.72)",
  cyan: "#7ee0ff",
  amber: "#ffb84d",
  text: "#f0f6fc",
  dim: "#9fb0b4",
  hairline: "rgba(126, 224, 255, 0.18)",
};

export const FEEDS = {
  air: "/api/traffic/air",
  sea: "/api/traffic/sea",
  cameras: "/api/cameras.geojson",
  tle: ["/tle/stations.txt", "/tle/weather.txt", "/tle/visual.txt"],
};

export const BLE = {
  namePrefix: "EXOpace",
  uart: "6e400001-b5a3-f393-e0a9-e50e24dcca9e",
};

export const DECIDE_URL = "";
export const DECIDE_MS = 800;

export const ROUTES = {
  mission: "/mission/",
  radio: "/radio/",
  maps: "/maps/",
  mesh: "/mesh/",
  cameras: "https://cams.exopace.net/map",
  sentinel: "/sentinel/",
};

globalThis.EXO_CONFIG = { TOKENS, FEEDS, BLE, DECIDE_URL, DECIDE_MS, ROUTES };
