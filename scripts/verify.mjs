#!/usr/bin/env node
/**
 * EXOpace ship-tree checks. No npm deps.
 *   node scripts/verify.mjs
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = [];
const ok = [];
function assert(cond, msg) {
  if (cond) ok.push(msg);
  else fail.push(msg);
}
function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}
function json(rel) {
  return JSON.parse(read(rel));
}

// --- env: prod cannot enable Demo ---
for (const rel of ["env.js", "radio/env.js"]) {
  const src = read(rel);
  assert(/EXOPACE_ENV\s*=\s*"prod"/.test(src), `${rel} EXOPACE_ENV=prod`);
  assert(/EXOPACE_ALLOW_DEMO\s*=\s*false/.test(src), `${rel} EXOPACE_ALLOW_DEMO=false`);
  assert(/isExoProd/.test(src) && /exoAllowDemo/.test(src), `${rel} demo lock helpers`);
}

// --- real files the SPA must not swallow ---
for (const rel of [
  "FIRMWARE.md",
  "radio/index.html",
  "radio/app.js",
  "radio/textures/earth-day.jpg",
  "radio/textures/earth-night.jpg",
  "radio/textures/earth-water.png",
  "cesium/Cesium.js",
  "assets/index-B5yAHF7-.js",
  "assets/sat-CIpmmEb5.js",
  "assets/index-Cvdw9vO_.css",
  "icon-192.png",
  "icon-512.png",
  "icon.svg",
  "icon-maskable.svg",
  "apple-touch-icon.png",
  "pwa-install.js",
]) {
  assert(existsSync(join(root, rel)) && statSync(join(root, rel)).size > 0, `exists ${rel}`);
}

// --- first-paint: boot-void outside #root so React cannot wipe it ---
const index = read("index.html");
assert(/<div id="boot-void">/.test(index), "index.html has #boot-void");
assert(/<div id="root"[^>]*>\s*<\/div>/.test(index), "index.html #root is empty");
assert(index.indexOf('id="boot-void"') < index.indexOf('id="root"'), "boot-void precedes #root");
assert(!/<div id="root">[\s\S]*id="boot-void"/.test(index), "boot-void is not nested in #root");
assert(index.includes("CHECKING PIPELINE"), "boot status text is last-child compatible");
assert(index.includes("z-index: 200") && index.includes("transitionend"), "splash sits above HUD and hides after fade");
assert(!/#boot-void\.out \{[^}]*pointer-events:\s*none/.test(index), "splash .out still eats taps during fade");
assert(index.includes('class="exo-booting"') && index.includes("inert"), "html.exo-booting + #root inert until splash hide");
assert(index.includes("stopImmediatePropagation") && index.includes('["click", "auxclick"'), "splash capture-phase eats pointer events");
assert(/<div id="root"[^>]*inert/.test(index), "#root is inert in markup before React mounts");
assert(index.includes("/env.js") && index.includes("/cesium/Cesium.js"), "env + Cesium load before app");
assert(
  index.indexOf('<script src="/env.js">') < index.indexOf('<script type="module"'),
  "env.js script runs before MOC module",
);
assert(index.includes('rel="manifest"') && index.includes("apple-mobile-web-app-capable"), "MOC PWA metas");
assert(index.includes("pwa-install.js"), "MOC install chip script");
assert(index.includes('id="exo-install"'), "MOC INSTALL APP control");

const four = read("404.html");
assert(four.includes("404") && four.includes("NO SUCH ROUTE"), "404.html is a real 404");
assert(!four.includes("index-B5yAHF7-") && !four.includes("boot-void"), "404.html is not Mission Control");
assert(index.includes("moc-phone.css"), "index.html loads phone HUD clip");
assert(existsSync(join(root, "moc-phone.css")), "exists moc-phone.css");
assert(read("moc-phone.css").includes("z-index: 16") && read("moc-phone.css").includes(".search"), "phone CSS lifts camstrip over dossier + restores search");
assert(read("moc-phone.css").includes("z-index: 40"), "LAYERS panel stacks above Cesium canvas");
assert(read("moc-phone.css").includes("hud:has(.layers.open)"), "RADIO route is inert while LAYERS is open");
assert(read("moc-phone.css").includes("cesium-viewer-bottom"), "Cesium credits are moved off LIVE/HOLD");
assert(read("moc-phone.css").includes("top: 42%") && read("moc-phone.css").includes("bottom: 4px"), "Ion credits park mid-right on phone and bottom-left on desktop");
assert(read("moc-phone.css").includes("transform-origin: top right"), "phone Ion credits scale from the right so the container stays inside 390");
assert(read("moc-phone.css").includes("contain: paint") && read("moc-phone.css").includes("transform: none !important"), "phone scales only the outer Ion box so the inner strip cannot paint past 390");
assert(read("moc-phone.css").includes("html:has(.dossier button)") && read("moc-phone.css").includes("bottom: calc(268px"), "phone Ion credits leave the locked dossier");
assert(read("moc-phone.css").includes("cesium-credit-logoContainer img") && read("moc-phone.css").includes("max-width: 100% !important"), "phone Ion logo cannot lay out past the credits box");
assert(read("moc-phone.css").includes("#exo-install") && read("moc-phone.css").includes("right: 56px"), "desktop INSTALL sits left of the zoom column");
assert(read("moc-phone.css").includes("50vw - 160px"), "desktop camstrip stays left of LIVE");
assert(read("moc-phone.css").includes("flex-wrap: nowrap"), "desktop .tl stays one row so RADIO does not sit on the dossier");
assert(read("moc-phone.css").includes("bottom: calc(310px") && read("moc-phone.css").includes(".station"), "phone STATION panel stops above INSTALL + camstrip");
assert(read("moc-phone.css").includes("hud:has(.station)") && read("moc-phone.css").includes(".dossier"), "phone SELECTION hides while STATION is open");
assert(read("moc-phone.css").includes("nth-child(5)"), "FOLLOW is isolated above later camstrip siblings");
assert(read("moc-phone.css").includes("#exo-install"), "INSTALL APP is moved off the 390 camstrip");
assert(read("moc-phone.css").includes("span.chip:nth-child(n + 3)"), "phone .tl hides IMG/WEBGL so search stays clear");

// --- manifests ---
const mocM = json("manifest.json");
const radM = json("radio/manifest.json");
assert(mocM.start_url === "/" && mocM.display === "standalone", "MOC manifest standalone /");
assert(radM.start_url === "./" && radM.scope === "./", "Radio manifest scoped to /radio/");
assert(mocM.icons.some((i) => i.purpose === "maskable"), "MOC maskable icon");
assert(radM.icons.some((i) => String(i.purpose).includes("maskable")), "Radio maskable icon");

// --- service workers ---
const mocSw = read("sw.js");
const radSw = read("radio/sw.js");
assert(mocSw.includes('"/radio"') || mocSw.includes("/radio/"), "MOC SW skips /radio/");
assert(mocSw.includes("/cesium/"), "MOC SW skips /cesium/");
assert(mocSw.includes('p === "/env.js"') && !/const ASSETS = \[[^\]]*"\/env\.js"/.test(mocSw), "MOC SW no-stores env.js and does not pin it");
assert(mocSw.includes("exopace-moc-v20"), "MOC SW cache bumped");
assert(mocSw.includes('cache: "no-store"') && mocSw.includes("noStore"), "MOC SW fetches HUD overlay without HTTP cache");
assert(!/const ASSETS = \[[^\]]*"\/moc-phone\.css"/.test(mocSw), "MOC SW does not precache moc-phone.css");
assert(!/const ASSETS = \[[^\]]*["']\/index\.html["']/.test(mocSw) && !/const ASSETS = \[[^\]]*["']\/["']/.test(mocSw), "MOC SW does not precache index.html or /");
assert(mocSw.includes('p === "/index.html"') && mocSw.includes('p === "/"'), "MOC SW no-stores document so first paint is not a pinned ?v=");
assert(read("index.html").includes("z-index: 200") && read("index.html").includes("transitionend"), "splash eats taps until fade hides it");
assert(radSw.includes("location.origin"), "Radio SW same-origin only");
assert(radSw.includes("exopace-radio-v17"), "Radio SW cache bumped");
assert(radSw.includes('cache: "no-store"') && radSw.includes("noStore"), "Radio SW fetches in-place JS without HTTP cache");
assert(!/const ASSETS = \[[^\]]*"app\.js"/.test(radSw), "Radio SW does not precache app.js");
assert(!radSw.includes("e.respondWith") || radSw.includes("url.origin"), "Radio SW does not intercept foreign hosts");

// --- redirects keep radio + firmware as real files ---
const redir = read("_redirects");
assert(redir.includes("/radio/*") && redir.includes("/FIRMWARE.md"), "_redirects keeps radio + firmware");
assert(redir.includes("/lock/*"), "_redirects SPA-falls /lock/*");
assert(!redir.split("\n").some((l) => l.trim() === "/*              /index.html 200" || l.trim().startsWith("/* ")), "_redirects has no SPA catch-all");
for (const route of ["/about", "/mission", "/ops", "/login", "/app"]) {
  assert(redir.includes(`${route} `) && /404/.test(redir.split("\n").find((l) => l.includes(route)) || ""), `_redirects 404 ${route}`);
}
assert(!redir.includes("WORLD_DATA.md") && !redir.includes("sgp4.worker.js"), "_redirects dropped dead paths");
assert(existsSync(join(root, "_headers")), "_headers present");
const headers = read("_headers");
assert(headers.includes("/moc-phone.css") && headers.includes("/assets/index-B5yAHF7-.js"), "in-place HUD files are no-cache");
assert(headers.includes("/radio/app.js"), "Radio app.js is no-cache");
assert(read("index.html").includes("moc-phone.css?v=20"), "index cache-busts moc-phone.css");
assert(read("index.html").includes("index-B5yAHF7-.js?v=20"), "index cache-busts hashed MOC bundle");
assert(read("moc-phone.css").includes("cesium-credit-textContainer") && read("moc-phone.css").includes("display: none"), "phone hides Ion Upgrade-for-commercial text");
assert(!/max-width: 820px\)[\s\S]*cesium-viewer-bottom[\s\S]*top: 4px/.test(read("moc-phone.css")), "phone credits are not parked at top:4px on UTC");
assert(read("moc-phone.css").includes("html.exo-booting") && read("moc-phone.css").includes("a.radio-link"), "overlay freezes HUD + RADIO while splash is up");
assert(read("moc-phone.css").includes("#globe .cesium-widget canvas") && read("moc-phone.css").includes("z-index: 0 !important"), "Cesium canvas stays under .hud at every viewport");

// --- protocol ESM ---
const proto = await import(pathToFileURL(join(root, "protocol/index.js")).href);
assert(proto.PROTOCOL_VER === "3.0", "protocol ver 3.0");
assert(proto.BLE.namePrefix === "EXOpace", "BLE namePrefix EXOpace");
assert(proto.BLE.service.startsWith("6e400001"), "Nordic UART service");
assert(proto.WIFI.apPassDefault === "nodelink" && proto.WIFI.apHost === "192.168.4.1", "Wi-Fi AP contract");
assert(proto.TYPES.includes("sos") && proto.TYPES.includes("presence") && proto.TYPES.includes("getcfg"), "extended types present");

const line = proto.encode(proto.makeSos({ id: "7b52f8e3", lat: 35.15, lon: -90.05 }));
assert(line.endsWith("\n"), "encode is newline-delimited");
const parsed = proto.parseLine(line);
assert(parsed && parsed.t === "sos" && parsed.id === "7b52f8e3", "parse sos");
assert(proto.parseLine("not-json") === null, "parse junk → null");
assert(proto.parseLine('{"msg":"no type"}') === null, "parse missing t → null");

const chat = proto.parseLine(proto.encode({ t: "chat", msg: "On station" }));
assert(chat.text === "On station", "chat msg→text normalize");
const gps = proto.parseLine('{"t":"gps","lat":35.1,"lon":-90.0,"fix":1}');
assert(gps.g && gps.g.fix === true && gps.g.lat === 35.1, "gps lat/lon→g");
const pres = proto.applyPresence({ id: "a", last: proto.nowSec() - 200 });
assert(pres.conf > 0 && pres.conf < 1 && pres.quiet === false, "presence fade, not drop at 200s");
const quiet = proto.applyPresence({ id: "a", last: proto.nowSec() - 2000 });
assert(quiet.quiet === true, "presence drop after 1800s");
assert(proto.WAY_KINDS.join(",") === "meet,hazard,cache,home", "way kinds");
assert(proto.STATION.id === "MILLINGTON", "station Millington");

const demo = proto.demoMesh();
assert(demo.peers.length === 4 && demo.ways.length === 3, "demo mesh shape (DEV helper only)");

// --- radio IIFE mirrors canonical constants ---
const iife = read("radio/protocol.js");
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(iife, ctx);
const R = ctx.window.ExoProto;
assert(R && R.PROTOCOL_VER === proto.PROTOCOL_VER, "IIFE PROTOCOL_VER matches");
assert(R.BLE.namePrefix === proto.BLE.namePrefix && R.BLE.service === proto.BLE.service, "IIFE BLE matches");
assert(R.STATION.lat === proto.STATION.lat && R.MEMPHIS.lon === proto.MEMPHIS.lon, "IIFE station/memphis match");
assert(typeof R.makeSos === "function" && typeof R.makePresence === "function", "IIFE factories");
const rChat = R.parseLine(R.encode({ t: "chat", msg: "Moving" }));
assert(rChat.text === "Moving", "IIFE chat normalize");

// --- radio install path + no eager globe + demo stays locked ---
const radioHtml = read("radio/index.html");
const radioApp = read("radio/app.js");
assert(radioHtml.includes('rel="manifest"') && radioHtml.includes("apple-touch-icon"), "Radio PWA head");
assert(radioHtml.includes('rel="icon"'), "Radio favicon");
assert(radioHtml.includes("exopace.net/radio"), "Radio install copy names /radio/");
assert(radioApp.includes("beforeinstallprompt"), "Radio install prompt");
assert(radioApp.includes("BLUETOOTH NOT AVAILABLE IN THIS BROWSER"), "Radio HTTPS does not claim it needs HTTPS");
assert(radioApp.includes("if (navigator.bluetooth) return;"), "Radio only disables BLE when the browser has no Bluetooth");
assert(radioApp.includes("exoAllowDemo"), "Radio demo helper stays gated");
assert(!radioHtml.includes("optDemo") && !/Demo Dev only/i.test(radioHtml), "prod Radio HTML has no Demo option");
assert(!radioHtml.includes("relay.example") && !radioHtml.includes("optRemote"), "prod Radio HTML has no example.com remote stub");
assert(!/AP EXOpace-XXXX \/ nodelink/.test(radioHtml), "CONNECT sheet does not paint factory AP password");
assert(!radioHtml.includes("Factory AP password is nodelink"), "SET does not treat this PWA as the node AP");
assert(!/ensureGlobe\(\);\s*$/.test(radioApp.trim()), "Radio does not eager-mount globe on chat");
assert(radioApp.includes("rangeCard") || radioHtml.includes("rangeCard"), "range CSV gated to node AP");
assert(radioApp.includes("walk outside") && !radioApp.includes("run DEMO"), "map empty state has no Demo nudge");
assert(!radioApp.includes("DEMO DISABLED IN PROD"), "prod Radio does not toast a Demo CTA");
assert(radioHtml.includes("walk outside") && !/run DEMO/i.test(radioHtml), "MAP first paint has no Demo CTA");
assert(radioHtml.includes("app.js?v=17") && radioHtml.includes("env.js?v=17"), "Radio index cache-busts in-place JS");
assert(!radioHtml.includes("FIRMWARE.md") && !radioHtml.includes("this PWA is not the AP"), "SET pairing does not dump FIRMWARE.md or PWA-is-not-the-AP");
assert(!radioApp.includes("FIRMWARE.md"), "Radio app does not point guests at FIRMWARE.md");
assert(!radioHtml.includes("Not a Pages route") && !radioApp.includes("Not served from exopace.net"), "rangeHint has no Pages-implementation dump");
assert(/#composer input\{flex:1;min-width:0/.test(radioHtml) && /#composer\{[^}]*min-width:0/.test(radioHtml), "Radio CHAT composer shrinks so TX stays on 360");
assert(/#pathLbl\{[^}]*flex:0 0 auto/.test(radioHtml) && /#pathLbl\{[^}]*width:max-content/.test(radioHtml) && /#pathLbl\{[^}]*overflow:visible/.test(radioHtml), "Radio pathLbl shows full LINK DOWN at 360/390");
assert(!radioHtml.includes("unsafely-treat-insecure-origin-as-secure"), "HTTPS Radio SET has no Chrome flags recipe");
assert(!/const ASSETS = \[[^\]]*"index\.html"/.test(radSw), "Radio SW does not precache index.html");
assert(radioApp.includes("if (b.dataset.s === \"map\")") && radioApp.includes("syncGlobe()"), "MAP tab paints quiet empty state before globe");

// --- shipped MOC still has palette + quality + deep link (bundle, no Vite source) ---
const moc = read("assets/index-B5yAHF7-.js");
assert(moc.includes("lock ISS") && moc.includes("quality PERF") && moc.includes("run cinematic"), "MOC palette commands");
assert(moc.includes("ULTRA") && moc.includes("exopace-quality"), "MOC quality tiers");
assert(moc.includes("/lock/") && moc.includes("serviceWorker") && moc.includes("/sw.js"), "MOC deep link + SW register");
assert(moc.includes("lock ISS · layer radio · quality PERF"), "palette placeholder matches real commands");
assert(moc.includes("exoAllowDemo"), "MOC demo helper (prod still false)");
assert(!moc.includes("BASECAMP") && !moc.includes("RIG-1") && !moc.includes("TRK-2"), "MOC live bundle has no demo station fixtures");
assert(!moc.includes("PASS · MILLINGTON") && !moc.includes("EL · MILLINGTON") && !moc.includes("FACILITY · MILLINGTON"), "MOC guest chrome does not name MILLINGTON");
assert(moc.includes("FACILITY · EXOPACE GS") && moc.includes("NEXT PASS · EXOPACE GS"), "MOC guest chrome keeps EXOPACE GS");
assert(!moc.includes('pass:"nodelink"'), "MOC live bundle does not ship a factory AP named nodelink");
assert(!read("radio/protocol.js").includes("BASECAMP") && !read("radio/protocol.js").includes("RIG-1") && !read("radio/protocol.js").includes("TRK-2"), "Radio protocol has no BASECAMP / RIG-1 / TRK-2 fixtures");
assert(!read("protocol/index.js").includes("BASECAMP") && !read("protocol/index.js").includes("RIG-1"), "canonical protocol demo helper dropped BASECAMP / RIG-1 names");
assert(!moc.includes('?"AUDIO":"TICKS"') && !moc.includes('"TICKS"'), "MOC sound chip is never labeled TICKS");
assert(moc.includes('children:"AUDIO"'), "MOC sound chip stays AUDIO either way");
assert(moc.includes('feed:"WAIT"'), "MOC initial feed is WAIT not ERROR");
assert(moc.includes("FEED WAIT"), "MOC paints FEED WAIT while CelesTrak loads");
assert(!moc.includes('feed:"ERROR",imagery'), "MOC does not first-paint FEED ERROR");
assert(!moc.includes("exopase.com"), "MOC bundle does not poll exopase.com");
assert(!moc.includes("EXOPACE_BRIDGE unset") && !moc.includes("NO BRIDGE · EXOPACE_BRIDGE"), "MOC guest stoff does not leak EXOPACE_BRIDGE");
assert(moc.includes('Wo("NO BRIDGE")'), "empty bridge stays OFFLINE · NO BRIDGE");
assert(!read("radio/app.js").includes("EXOPACE_BRIDGE unset") && !read("radio/app.js").includes("unset in /env.js"), "Radio does not paint env-file leaks");
assert(!moc.includes("unset in /env.js") && !moc.includes("EXOPACE_IMAGERY.ION_TOKEN"), "MOC imagery note does not leak /env.js");
assert(moc.includes('_setImagery("ESRI FALLBACK")'), "empty imagery keys stay ESRI FALLBACK without a config dump");
assert(moc.includes('_setImagery("REQUEST FAILED")'), "failed imagery request stays guest REQUEST FAILED");
assert(!moc.includes("ERROR(${"), "MOC does not wrap library request text as ERROR(...)");
assert(!moc.includes("IMAGERY INIT FAILED"), "imagery catch no longer dumps IMAGERY INIT FAILED");
assert(moc.includes("function Wt(") && moc.includes("children:Wt(z.msg)"), "STATION log sanitizes ERROR(...) / request-failed wraps");
assert(moc.includes('Ie("IMAGERY REQUEST FAILED")'), "imagery toast is guest words, not ERROR(...)");
assert(!moc.includes('hostname==="exopace.net"'), "MOC has no live-host typo-bridge fallback");
assert(!read("env.js").includes("exopase"), "env.js has no exopase.com");
assert(read("moc-phone.css").includes("min-width: 821px") && read("moc-phone.css").includes("left: 158px"), "1280 search sits left of UTC clock");
assert(/overflow-x:\s*hidden/.test(radioHtml), "Radio clips horizontal overflow");
assert(/#battChart,#rssiChart\{width:100%;max-width:100%;min-width:0/.test(radioHtml), "Radio rssiChart scales to the NODE pane");
assert(/\.card\{[^}]*overflow:hidden/.test(radioHtml), "Radio NODE cards cannot grow past the pane");
assert(!existsSync(join(root, "package.json")), "no fake Vite package.json");
assert(!existsSync(join(root, "src")), "no invented moc/src tree");
assert(!existsSync(join(root, "sdr-agent")), "no invented sdr-agent tree");
assert(read("SDR_AGENT.md").includes("wss://exopace.net/bridge/sensor") && read("SDR_AGENT.md").includes("not a Pages route"), "SDR contract: public bridge is not a Pages route");
assert(read("SDR_AGENT.md").includes("/mnt/gsdata/exopace/sdr-agent"), "SDR contract: Python lives off-tree");
assert(read("SDR_AGENT.md").includes("jessy") && read("SDR_AGENT.md").includes("/dev/bus/usb"), "SDR contract: dongle is on jessy, not this VM");
assert(read("README.md").includes("never pushed here") || read("README.md").includes("never committed"), "README says moc source never landed in git");

// --- same-origin TLE snapshot (guest Celestrak 403) ---
assert(read("env.js").includes("/tle/stations.txt") && read("env.js").includes("/tle/visual.txt") && read("env.js").includes("/tle/weather.txt"), "env TLE URLs are same-origin snapshots");
assert(!/EXOPACE_TLE_URLS\s*=\s*\[[^\]]*celestrak\.org/.test(read("env.js")), "env TLE list does not send guests to celestrak.org");
for (const rel of ["tle/stations.txt", "tle/visual.txt", "tle/weather.txt"]) {
  assert(existsSync(join(root, rel)) && statSync(join(root, rel)).size > 200, `exists ${rel}`);
}
assert(read("tle/stations.txt").includes("ISS (ZARYA)") && read("tle/stations.txt").includes("1 25544U"), "stations snapshot has ISS");
assert(read("tle/README.md").includes("2026-09-03") && read("tle/README.md").includes("FEED CACHED"), "TLE snapshot is dated and labeled CACHED");
assert(read("assets/index-B5yAHF7-.js").includes("celestrak\\.org") && read("assets/index-B5yAHF7-.js").includes('?"LIVE":"CACHED"'), "MOC labels same-origin TLE CACHED not LIVE");
assert(read("_redirects").includes("/tle/*"), "_redirects keeps /tle/ as real files");
assert(read("sw.js").includes("/tle/"), "MOC SW skips /tle/ so the snapshot is not pinned");

if (fail.length) {
  console.error("FAIL");
  for (const f of fail) console.error("  -", f);
  console.error(`\n${ok.length} passed, ${fail.length} failed`);
  process.exit(1);
}
console.log(`OK  ${ok.length} checks`);
for (const m of ok) console.log("  +", m);
