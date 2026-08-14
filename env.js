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
  ION_TOKEN: "",
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
