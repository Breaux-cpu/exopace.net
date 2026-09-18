window.EXOPACE_ENV = "prod";
window.EXOPACE_ALLOW_DEMO = false;
window.EXOPACE_BRIDGE = "";
window.EXOPACE_INGEST_TOKEN = ""; // operator sets in SET, never shipped
window.isExoProd = function () {
  var e = String(window.EXOPACE_ENV || "prod").toLowerCase();
  return e === "prod" || e === "production";
};
window.exoAllowDemo = function () {
  if (window.isExoProd()) return false;
  return window.EXOPACE_ALLOW_DEMO === true;
};
