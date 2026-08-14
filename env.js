/* Compile/ship-time environment. PROD cannot enable Demo.
   Deploy writes EXOPACE_ENV=prod. Dev copies must set EXOPACE_ENV=dev. */
window.EXOPACE_ENV = "prod";
window.EXOPACE_ALLOW_DEMO = false;
window.EXOPACE_TLE_URLS = [
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle",
  "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle",
];
window.EXOPACE_BRIDGE = ""; // set to ingest origin, e.g. https://exopase.com or http://127.0.0.1:8210
/* Imagery keys — owner-filled AFTER deploy; empty = Esri World Imagery fallback (still real satellite tiles). ION_TOKEN: Cesium ion token -> ION LIVE. GOOGLE_TILES_KEY: Google Map Tiles API -> photorealistic 3D. */
window.EXOPACE_IMAGERY = {
  ION_TOKEN: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJjY2Y2Yzg0OS03NjA0LTQ4ODYtOGE5YS1jNmEyN2M1NjdmMzQiLCJpZCI6NDY3OTg4LCJzdWIiOiJleG9wYWNlIiwiaXNzIjoiaHR0cHM6Ly9hcGkuY2VzaXVtLmNvbSIsImF1ZCI6ImV4b3BhY2UtbmV0IiwiaWF0IjoxNzg2NzA4OTU4fQ.q7NOI2xhEMaWaVsw_R2cFcbDNhwYiPfsdW82PhJYD0Y",
  GOOGLE_TILES_KEY: "",
};
window.isExoProd = function () {
  var e = String(window.EXOPACE_ENV || "prod").toLowerCase();
  return e === "prod" || e === "production";
};
window.exoAllowDemo = function () {
  if (window.isExoProd()) return false;
  return window.EXOPACE_ALLOW_DEMO === true;
};
