import { epochAgeDays, feedState } from "./exo-watch.js";

const MARK = " · NOT EXACT";

export function catalogFeed(text, now = Date.now()) {
  const lines = String(text || "").split(/\r?\n/);
  let age = null;
  let sawLine = false;
  for (const line of lines) {
    if (!line.startsWith("1 ")) continue;
    sawLine = true;
    const rowAge = epochAgeDays(line, now);
    if (rowAge == null) continue;
    const norad = line.slice(2, 7).trim();
    if (norad === "25544") return { state: feedState(rowAge), age: rowAge };
    if (age == null || rowAge < age) age = rowAge;
  }
  if (!sawLine || age == null) return { state: "ERROR", age: null };
  return { state: feedState(age), age };
}

export function feedLabel(state, age) {
  if (state === "ERROR" || age == null || !Number.isFinite(age)) return "FEED ERROR";
  return `FEED ${state} · ${age.toFixed(1)} D`;
}

function bare(text) {
  return String(text || "").replace(/ · NOT EXACT$/, "");
}

export function paintFeed(root, result) {
  const label = feedLabel(result.state, result.age);
  const inexact = result.state === "STALE" || result.state === "ERROR";
  for (const node of root.querySelectorAll("span.chip")) {
    if (!bare(node.textContent).startsWith("FEED")) continue;
    if (node.textContent !== label) node.textContent = label;
    if (node.classList) {
      if (result.state === "ERROR") node.classList.add("err");
      else node.classList.remove("err");
    }
  }
  for (const node of root.querySelectorAll(".passlist .pt, span")) {
    const text = bare(node.textContent);
    if (!/^AOS\b|^LOS T-/.test(text)) continue;
    const next = inexact ? text + MARK : text;
    if (node.textContent !== next) node.textContent = next;
  }
}

async function readCatalog() {
  try {
    const response = await fetch("/tle/stations.txt", { cache: "no-store" });
    if (!response.ok) return { state: "ERROR", age: null };
    return catalogFeed(await response.text());
  } catch {
    return { state: "ERROR", age: null };
  }
}

export function startFeed(doc) {
  let result = { state: "ERROR", age: null };
  let queued = false;
  const paint = () => {
    queued = false;
    paintFeed(doc, result);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    const view = doc.defaultView;
    if (view && view.requestAnimationFrame) view.requestAnimationFrame(paint);
    else paint();
  };
  const observer = new MutationObserver(schedule);
  observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
  readCatalog().then((next) => {
    result = next;
    schedule();
  });
  return observer;
}

if (typeof document !== "undefined") startFeed(document);
