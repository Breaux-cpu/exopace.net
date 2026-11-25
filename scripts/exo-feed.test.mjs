import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { catalogFeed, feedLabel, paintFeed } from "../assets/exo-feed.js";

const now = Date.parse("2026-11-25T00:00:00Z");
const stations = readFileSync(new URL("../tle/stations.txt", import.meta.url), "utf8");

function node(text, className) {
  const classes = new Set(String(className || "").split(/\s+/).filter(Boolean));
  return {
    textContent: text,
    className,
    classList: {
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      has(name) { return classes.has(name); },
    },
  };
}

function root(chips, passes) {
  return {
    querySelectorAll(selector) {
      if (selector === "span.chip") return chips;
      return passes;
    },
  };
}

test("the current ISS catalog is LIVE and shows its age", () => {
  const feed = catalogFeed(stations, now);
  assert.equal(feed.state, "LIVE");
  assert.ok(feed.age > 0 && feed.age <= 7);
  assert.equal(feedLabel(feed.state, feed.age), `FEED LIVE · ${feed.age.toFixed(1)} D`);
});

test("an aged catalog is STALE and the pass is not exact", () => {
  const old = "OLD BIRD\n1 25544U 98067A   26245.46626010  .00004070  00000+0  82080-4 0  9996\n2 25544  51.6313 277.6073 0005029  99.7358 260.4199 15.48970443583732\n";
  const feed = catalogFeed(old, now);
  assert.equal(feed.state, "STALE");
  assert.ok(feed.age > 7);
  const pass = node("AOS T-02:10", "pt");
  const next = node("AOS 2026-11-25T01:54:45Z AZ 12° · EXOPACE GS");
  paintFeed(root([node("FEED CELESTRAK CACHED", "chip")], [pass, next]), feed);
  assert.equal(pass.textContent, "AOS T-02:10 · NOT EXACT");
  assert.match(next.textContent, / · NOT EXACT$/);
  assert.match(feedLabel(feed.state, feed.age), /^FEED STALE · \d+\.\d D$/);
});

test("a missing or invalid catalog is ERROR", () => {
  assert.equal(catalogFeed("", now).state, "ERROR");
  assert.equal(catalogFeed("1 25544U 98067A   not-epoch\n", now).state, "ERROR");
  assert.equal(feedLabel("ERROR", null), "FEED ERROR");
  const pass = node("LOS T-00:40", "pt");
  paintFeed(root([node("FEED CELESTRAK CACHED", "chip")], [pass]), { state: "ERROR", age: null });
  assert.equal(pass.textContent, "LOS T-00:40 · NOT EXACT");
});
