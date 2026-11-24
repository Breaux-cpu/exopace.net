import { onRequest as health } from "../functions/v1/health.js";

const res = await health();
const body = await res.json();
if (res.status !== 200 || body.data.status !== "operational" || body.version !== "1.0.0") {
  console.error("v1 health failed");
  process.exit(1);
}
console.log("v1 health operational");
