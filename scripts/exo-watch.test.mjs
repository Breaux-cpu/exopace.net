import { readFileSync } from "node:fs";
import { catalogNote, epochAgeDays, haversineMeters, insideFence, validWatch } from "../assets/exo-watch.js";
import { parseTle } from "../assets/exo-orbit.js";

let failed = 0;
function check(name, ok) {
  if (!ok) { failed += 1; console.log("FAIL " + name); }
  else console.log("PASS " + name);
}

const text = readFileSync(new URL("../tle/stations.txt", import.meta.url), "utf8");
const birds = parseTle(text);
const iss = birds.find((row) => row.norad === "25544");
check("iss cached", catalogNote(birds, "25544") === "CACHED" && iss && iss.l1.startsWith("1 25544"));
check("unknown norad", catalogNote(birds, "99999") === "NOT IN CACHED TLE");
const age = epochAgeDays(iss.l1, Date.parse("2026-11-23T00:00:00Z"));
check("epoch age", age > 70 && age < 120);

const a = { lat: 47.6, lon: -122.3 };
const near = { lat: 47.601, lon: -122.3 };
const far = { lat: 40.7, lon: -74.0 };
const fence = { lat: a.lat, lon: a.lon, radiusM: 5000 };
check("near inside", insideFence(fence, near) && haversineMeters(a, near) < 5000);
check("far outside", !insideFence(fence, far));
check("watch shapes", validWatch("norad", "25544") && validWatch("icao", "a1b2c3") && !validWatch("icao", "zz") && !validWatch("norad", "ISS"));

if (failed) process.exit(1);
