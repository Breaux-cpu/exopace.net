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
for (const rel of ["env.js", "mesh/env.js"]) {
  const src = read(rel);
  assert(/EXOPACE_ENV\s*=\s*"prod"/.test(src), `${rel} EXOPACE_ENV=prod`);
  assert(/EXOPACE_ALLOW_DEMO\s*=\s*false/.test(src), `${rel} EXOPACE_ALLOW_DEMO=false`);
  assert(/isExoProd/.test(src) && /exoAllowDemo/.test(src), `${rel} demo lock helpers`);
}

// --- real files the SPA must not swallow ---
for (const rel of [
  "FIRMWARE.md",
  "mesh/index.html",
  "mesh/app.js",
  "mesh/textures/earth-day.jpg",
  "mesh/textures/earth-night.jpg",
  "mesh/textures/earth-water.png",
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
assert(/<div id="boot-void"[^>]*>/.test(index), "index.html has #boot-void");
assert(/<div id="root"[^>]*>\s*<\/div>/.test(index), "index.html #root is empty");
assert(index.indexOf('id="boot-void"') < index.indexOf('id="root"'), "boot-void precedes #root");
assert(!/<div id="root"[^>]*>[\s\S]*id="boot-void"/.test(index), "boot-void is not nested in #root");
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
assert(read("moc-phone.css").includes("top: 42%") && read("moc-phone.css").includes("bottom: 8px"), "Ion credits park mid-right on phone and bottom-left on desktop");
assert(read("moc-phone.css").includes("transform-origin: top right"), "phone Ion credits park from the right so the container stays inside 390");
assert(read("moc-phone.css").includes("contain: paint") && read("moc-phone.css").includes("cesium-credit-expand-link") && read("moc-phone.css").includes("min-height: 44px"), "phone Ion credit expand links are a real tap target");
assert(read("moc-phone.css").includes("#globe .cesium-widget-credits") && read("moc-phone.css").includes("gap: 8px"), "phone Ion credit links have a real gap");
assert(read("pwa-install.js").includes("if (!deferred)") && read("pwa-install.js").includes("btn.hidden = true"), "INSTALL APP is not a no-op chip without beforeinstallprompt");
assert(!read("pwa-install.js").includes("BROWSER MENU → INSTALL APP"), "INSTALL click does not swap in a dead recipe label");
assert(read("moc-phone.css").includes("html:has(.dossier button)") && read("moc-phone.css").includes("bottom: calc(248px"), "phone Ion credits leave the locked dossier");
assert(read("moc-phone.css").includes("cesium-credit-logoContainer img") && read("moc-phone.css").includes("max-width: 100% !important"), "phone Ion logo cannot lay out past the credits box");
assert(read("moc-phone.css").includes("#exo-install") && read("moc-phone.css").includes("right: 68px"), "desktop INSTALL sits left of the 44px zoom column");
assert(read("moc-phone.css").includes("50vw - 160px"), "desktop camstrip stays left of LIVE");
assert(read("moc-phone.css").includes("flex-wrap: nowrap"), "desktop .tl stays one row so RADIO does not sit on the dossier");
assert(read("moc-phone.css").includes("bottom: calc(330px") && read("moc-phone.css").includes(".station"), "phone STATION panel stops above INSTALL + camstrip");
assert(/@media \(max-width: 420px\)[\s\S]*\.station\s*\{[\s\S]*top:\s*calc\(164px/.test(read("moc-phone.css")), "phone STATION sits below wrapped RADIO at 360");
assert(read("moc-phone.css").includes("hud:has(.station)") && read("moc-phone.css").includes(".dossier"), "phone SELECTION hides while STATION is open");
assert(read("moc-phone.css").includes("nth-child(5)"), "FOLLOW is isolated above later camstrip siblings");
assert(read("moc-phone.css").includes("#exo-install"), "INSTALL APP is moved off the 390 camstrip");
assert(read("moc-phone.css").includes("span.chip:nth-child(n + 3)"), "phone .tl hides IMG/WEBGL so search stays clear");

// --- manifests ---
const mocM = json("manifest.json");
const meshM = json("mesh/manifest.json");
assert(mocM.start_url === "/" && mocM.display === "standalone", "MOC manifest standalone /");
assert(meshM.start_url === "./" && meshM.scope === "./", "Mesh manifest scoped to /mesh/");
assert(mocM.icons.some((i) => i.purpose === "maskable"), "MOC maskable icon");
assert(meshM.icons.some((i) => String(i.purpose).includes("maskable")), "Radio maskable icon");

// --- service workers ---
const mocSw = read("sw.js");
const meshSw = read("mesh/sw.js");
assert(mocSw.includes('"/mesh"') && mocSw.includes('"/radio"'), "MOC SW skips /mesh/ and /radio/");
assert(mocSw.includes("/cesium/"), "MOC SW skips /cesium/");
assert(mocSw.includes('p === "/env.js"') && !/const ASSETS = \[[^\]]*"\/env\.js"/.test(mocSw), "MOC SW no-stores env.js and does not pin it");
assert(mocSw.includes("exopace-moc-v69"), "MOC SW cache bumped");
assert(mocSw.includes('cache: "no-store"') && mocSw.includes("noStore"), "MOC SW fetches HUD overlay without HTTP cache");
assert(!/const ASSETS = \[[^\]]*"\/moc-phone\.css"/.test(mocSw), "MOC SW does not precache moc-phone.css");
assert(!/const ASSETS = \[[^\]]*["']\/index\.html["']/.test(mocSw) && !/const ASSETS = \[[^\]]*["']\/["']/.test(mocSw), "MOC SW does not precache index.html or /");
assert(mocSw.includes('p === "/index.html"') && mocSw.includes('p === "/"'), "MOC SW no-stores document so first paint is not a pinned ?v=");
assert(read("index.html").includes("z-index: 200") && read("index.html").includes("transitionend"), "splash eats taps until fade hides it");
assert(meshSw.includes("location.origin"), "Radio SW same-origin only");
assert(meshSw.includes("exopace-mesh-v60"), "Radio SW cache bumped");
assert(meshSw.includes('cache: "no-store"') && meshSw.includes("noStore"), "Radio SW fetches in-place JS without HTTP cache");
assert(!/const ASSETS = \[[^\]]*"app\.js"/.test(meshSw), "Radio SW does not precache app.js");
assert(!meshSw.includes("e.respondWith") || meshSw.includes("url.origin"), "Radio SW does not intercept foreign hosts");

// --- redirects keep mesh + radio + firmware as real files ---
const redir = read("_redirects");
assert(redir.includes("/mesh/*") && redir.includes("/radio/*") && redir.includes("/FIRMWARE.md"), "_redirects keeps mesh + radio + firmware");
assert(redir.includes("/lock/*") && redir.includes("/index.html"), "_redirects SPA-falls legacy /lock/* to index.html");
assert(!redir.split("\n").some((l) => l.trim() === "/*              /index.html 200" || l.trim().startsWith("/* ")), "_redirects has no SPA catch-all");
for (const route of ["/about", "/mission", "/ops", "/login", "/app"]) {
  assert(redir.includes(`${route} `) && /404/.test(redir.split("\n").find((l) => l.includes(route)) || ""), `_redirects 404 ${route}`);
}
assert(!redir.includes("WORLD_DATA.md") && !redir.includes("sgp4.worker.js"), "_redirects dropped dead paths");
assert(existsSync(join(root, "_headers")), "_headers present");
const headers = read("_headers");
assert(headers.includes("/moc-phone.css") && headers.includes("/assets/index-B5yAHF7-.js"), "in-place HUD files are no-cache");
assert(headers.includes("/mesh/app.js"), "Mesh app.js is no-cache");
assert(read("index.html").includes("moc-phone.css?v=69"), "index cache-busts moc-phone.css");
assert(read("index.html").includes("index-B5yAHF7-.js?v=69"), "index cache-busts hashed MOC bundle");
assert(/@media \(max-width: 420px\)[\s\S]*html:has\(\.dossier button\)[\s\S]*display: none/.test(read("moc-phone.css")), "360 locked-ISS Ion credits leave COPY / CLEAR");
assert(/@media \(max-width: 820px\)[\s\S]*\.dossier\s*\{[\s\S]*top:\s*calc\(164px/.test(read("moc-phone.css")), "phone SELECTION sits below wrapped RADIO");
assert(read("moc-phone.css").includes("cesium-credit-textContainer") && read("moc-phone.css").includes("display: none"), "phone hides Ion Upgrade-for-commercial text");
assert(read("moc-phone.css").includes('cesium.com/pricing') && read("moc-phone.css").includes("Upgrade for commercial use"), "1280 hides only the Ion pricing promo, not Data attribution");
assert(/@media \(min-width: 821px\)[\s\S]*cesium-credit-expand-link[\s\S]*min-height:\s*44px/.test(read("moc-phone.css")), "1280 Data attribution expand is a real ≥44 tap");
assert(/@media \(min-width: 821px\)[\s\S]*cesium-credit-expand-link[\s\S]*pointer-events:\s*auto/.test(read("moc-phone.css")), "1280 Data attribution hits the expand link, not the canvas");
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
const iife = read("mesh/protocol.js");
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
const meshHtml = read("mesh/index.html");
const meshApp = read("mesh/app.js");
assert(meshHtml.includes('rel="manifest"') && meshHtml.includes("apple-touch-icon"), "Radio PWA head");
assert(meshHtml.includes('rel="icon"'), "Radio favicon");
assert(meshHtml.includes("exopace.net/mesh"), "Mesh install copy names /mesh/");
assert(meshApp.includes("beforeinstallprompt"), "Radio install prompt");
assert(meshApp.includes("BLUETOOTH NOT AVAILABLE IN THIS BROWSER"), "Radio HTTPS does not claim it needs HTTPS");
assert(meshApp.includes("if (navigator.bluetooth) return;"), "Radio only disables BLE when the browser has no Bluetooth");
assert(meshApp.includes("exoAllowDemo"), "Radio demo helper stays gated");
assert(!meshHtml.includes("optDemo") && !/Demo Dev only/i.test(meshHtml), "prod Radio HTML has no Demo option");
assert(!meshHtml.includes("relay.example") && !meshHtml.includes("optRemote"), "prod Radio HTML has no example.com remote stub");
assert(!/AP EXOpace-XXXX \/ nodelink/.test(meshHtml), "CONNECT sheet does not paint factory AP password");
assert(!meshHtml.includes("Factory AP password is nodelink"), "SET does not treat this PWA as the node AP");
assert(!/ensureGlobe\(\);\s*$/.test(meshApp.trim()), "Radio does not eager-mount globe on chat");
assert(meshApp.includes("rangeCard") && meshApp.includes("card.remove()"), "guest NODE does not keep a Range logger card");
assert(!meshApp.includes("join EXOpace-XXXX") && !meshApp.includes("Range CSV lives on the node"), "guest NODE has no AP-IP range dump");
assert(meshHtml.includes('id="rangeCard" hidden'), "Range logger starts hidden and only mounts on the node AP");
assert(meshApp.includes("walk outside") && !meshApp.includes("run DEMO"), "map empty state has no Demo nudge");
assert(!meshApp.includes("DEMO DISABLED IN PROD"), "prod Radio does not toast a Demo CTA");
assert(meshHtml.includes("walk outside") && !/run DEMO/i.test(meshHtml), "MAP first paint has no Demo CTA");
assert(/#mapEmpty\{[^}]*right:132px/.test(meshHtml), "phone MAP empty-state parks off STATION/TRAIL");
assert(meshHtml.includes("MESH QUIET. Power up a second node") && meshHtml.includes("NO WAYPOINTS. Drop one from MAP"), "NET first-paints honest empty-states");
assert(meshApp.includes("renderNodes();") && meshApp.includes("NO WAYPOINTS. Drop one from MAP"), "NET empty-states stay after restore");
assert(meshHtml.includes("app.js?v=60") && meshHtml.includes("env.js?v=60"), "Radio index cache-busts in-place JS");
assert(/#installHint\{[^}]*flex:0 0 auto/.test(meshHtml) && /#installHint\[hidden\]\{[^}]*display:none/.test(meshHtml), "Radio installHint does not flex-clip to a 30px sliver");
assert(meshHtml.includes('id="btnInst2" hidden'), "Radio INSTALL APP in the phone-app card starts hidden");
assert(meshApp.includes("exopace-radio-hide-install") && meshApp.includes("hideInstallHint"), "Radio HIDE persist stays");
assert(meshApp.includes("function showInstallCard") && meshApp.includes("showInstallCard()"), "SET Phone app card is forced visible");
assert(!/if \(isStandalone\(\) \|\| installHintDismissed\(\)\)/.test(meshApp), "standalone or HIDE persist does not zero #installHint");
assert(!meshApp.includes('$("installHint").style.display = "none"'), "BLE connect does not zero the Phone app card");
{
  const chatSec = meshHtml.slice(meshHtml.indexOf('id="scr-chat"'), meshHtml.indexOf('id="scr-map"'));
  const setSec = meshHtml.slice(meshHtml.indexOf('id="scr-setup"'));
  assert(!chatSec.includes('id="installHint"'), "CHAT does not paint the phone-app installHint card");
  assert(setSec.includes('id="installHint"') && setSec.includes("id=\"btHelp\""), "installHint lives on SET with CONNECT pairing");
  const installTxt = setSec.slice(setSec.indexOf('id="installTxt"'), setSec.indexOf('id="btnInst2"'));
  const btHelp = setSec.slice(setSec.indexOf('id="btHelp"'));
  assert(installTxt.includes("exopace.net/mesh/") && installTxt.includes("INSTALL APP"), "SET Phone app copy keeps the URL and INSTALL APP");
  assert(!/CONNECT → Bluetooth/.test(installTxt), "SET #installTxt does not repeat the pairing line");
  assert(btHelp.includes("CONNECT → Bluetooth → EXOpace-XXXX") && btHelp.includes("Do not pair in Android Settings."), "SET pairing stays once under NODE SETUP");
  assert((setSec.match(/CONNECT → Bluetooth → EXOpace-XXXX/g) || []).length === 1, "SET paints pairing copy once");
}
assert(!meshApp.includes("Then open EXOpace and CONNECT → Bluetooth"), "iOS installTxt does not repeat the pairing line");
assert(meshHtml.includes('id="btnInst" hidden') && /#btnInst,#btnInst\[hidden\]\{[^}]*display:none/.test(meshHtml), "header INSTALL chip is hidden so CHAT is CONNECT only");
assert(meshHtml.includes('id="btnConn">CONNECT'), "CONNECT stays in the Radio header");
assert(!meshApp.includes('$("btnInst").style.display = ""') && meshApp.includes("syncInstallHint();"), "beforeinstallprompt does not unhide header INSTALL; SET installHint still syncs");
assert(read("moc-phone.css").includes("hud:has(.station) .layers.open") && read("moc-phone.css").includes("display: none !important"), "phone LAYERS panel hides while STATION is open");
assert(read("moc-phone.css").includes("html:has(.station) #globe .cesium-viewer-bottom"), "phone Ion credits hide while STATION is open so they do not cover AOS/AZ");
assert(/\.mapst label\{[^}]*min-height:44px/.test(meshHtml) && /\.mapst label\{[^}]*min-width:44px/.test(meshHtml), "MAP STATION/TRAIL taps are 44px");
assert(/\.mapst input\[type=checkbox\]\{[^}]*min-height:22px/.test(meshHtml), "MAP STATION/TRAIL checkboxes are not native 13px");
assert(meshHtml.includes('id="cfgHw" hidden') && meshHtml.includes("GPS RX pin") && meshHtml.includes("SAVE &amp; REBOOT RADIO"), "SET hardware pins start hidden while LINK DOWN");
assert(meshApp.includes("cfgHw") && meshApp.includes("hw.hidden = !up"), "SET pins/SAVE only paint when the radio is up");
{
  const hw = meshHtml.slice(meshHtml.indexOf('id="cfgHw"'), meshHtml.indexOf('id="cfgSave"'));
  assert(hw.includes("cfgGpsInt") && hw.includes("GPS report interval"), "SET GPS interval hides with pins while LINK DOWN");
}
assert(/#passHint\{[^}]*margin-bottom:12px/.test(meshHtml), "SET passHint has a real gap above Channel key");
assert(meshHtml.includes('id="passHint" hidden') && /#passHint\[hidden\]\{[^}]*display:none/.test(meshHtml), "SET passHint starts hidden while LINK DOWN");
assert(meshApp.includes("passHint.hidden = !up"), "SET passHint hides with the password field while LINK DOWN");
assert(meshHtml.includes('id="freqHint" hidden') && /#freqHint\[hidden\]\{[^}]*display:none/.test(meshHtml), "SET freqHint starts hidden while LINK DOWN");
assert(meshApp.includes("freqHint.hidden = !up"), "SET freqHint hides with Frequency and SF while LINK DOWN");
assert(!meshHtml.includes("FIRMWARE.md") && !meshHtml.includes("this PWA is not the AP"), "SET pairing does not dump FIRMWARE.md or PWA-is-not-the-AP");
assert(!meshApp.includes("FIRMWARE.md"), "Radio app does not point guests at FIRMWARE.md");
assert(!meshHtml.includes("Not a Pages route") && !meshApp.includes("Not served from exopace.net"), "rangeHint has no Pages-implementation dump");
assert(/#composer input\{flex:1;min-width:0/.test(meshHtml) && /#composer\{[^}]*min-width:0/.test(meshHtml), "Radio CHAT composer shrinks so TX stays on 360");
assert(/#pathLbl\{[^}]*flex:0 0 auto/.test(meshHtml) && /#pathLbl\{[^}]*width:max-content/.test(meshHtml) && /#pathLbl\{[^}]*overflow:visible/.test(meshHtml), "Radio pathLbl shows full LINK DOWN at 360/390");
assert(meshHtml.includes('id="hMeter" hidden') && /#hMeter\[hidden\]\{[^}]*display:none/.test(meshHtml), "header RF meter starts hidden while LINK DOWN");
assert(meshApp.includes("function syncHeaderMeter") && meshApp.includes("el.hidden = !up"), "header RF meter stays hidden until the radio is up");
assert(!meshHtml.includes("unsafely-treat-insecure-origin-as-secure"), "HTTPS Radio SET has no Chrome flags recipe");
assert(!/const ASSETS = \[[^\]]*"index\.html"/.test(meshSw), "Radio SW does not precache index.html");
assert(meshApp.includes("if (b.dataset.s === \"map\")") && meshApp.includes("syncGlobe()"), "MAP tab paints quiet empty state before globe");
assert(meshApp.includes("function isOwnMsg") && meshApp.includes('own ? "YOU"'), "own SOS/TX labels YOU not me");
assert(!meshApp.includes("…sent") && !meshApp.includes("ackslot"), "chat meta does not invent …sent on local echo");
assert(meshApp.includes(' + " UTC"') && meshApp.includes('ts + " · " + extra'), "chat meta omits trailing · when ack/RSSI are empty");
assert(meshApp.includes("if (!went) echoOwnChat") && meshApp.includes("echoOwnChat(text, to)"), "LINK DOWN qtx/TX local-echo without inventing ack/RSSI");
assert(meshApp.includes("function sosLine") && meshApp.includes("sosLine(m)"), "own SOS paints SOS, not SOS SOS");
assert(meshApp.includes("if (went) toast(\"SOS TX\")") && !/send\([^)]*\);\s*handle\([^)]*\);\s*toast\("SOS TX"\)/.test(meshApp), "SOS does not claim TX while LINK DOWN");
assert(meshHtml.includes("Channel key (AES-256)") && !meshHtml.includes("use CLEAR CHANNEL KEY for open mesh"), "SET channel-key label does not name the hidden CLEAR CHANNEL KEY control");
assert(meshHtml.includes('id="cfgForm" hidden') && meshApp.includes("form.hidden = !up"), "SET name/freq/SF/TX/pass/key hide while LINK DOWN so there is no dead form");
assert(meshHtml.includes('id="hFreq" hidden') && meshApp.includes("freq.hidden = !up"), "header does not paint dummy --- MHz / SF- while LINK DOWN");
assert(meshHtml.includes("TX power (dBm)") && !/V4 PA/.test(meshHtml) && !/V4 PA/.test(meshApp), "SET TX power does not invent V4 PA hardware");
assert(meshHtml.includes('id="cfgClearKey"') && meshHtml.includes("CLEAR CHANNEL KEY"), "CLEAR CHANNEL KEY stays inside cfgHw for when the radio is up");
assert(meshHtml.includes('id="chatSend" hidden') && meshApp.includes("function syncChatSend"), "CHAT TX hides while LINK DOWN");
assert(meshHtml.includes('id="qtx" hidden') && /#qtx\[hidden\]\{[^}]*display:none/.test(meshHtml), "CHAT qtx starts hidden while LINK DOWN");
assert(meshApp.includes("qtx.hidden = !up"), "CHAT qtx hides with TX until the radio is up");
assert(meshHtml.includes('id="composer" hidden') && /#composer\[hidden\]\{[^}]*display:none/.test(meshHtml), "CHAT composer starts hidden while LINK DOWN");
assert(meshApp.includes("composer.hidden = !up") && meshApp.includes("Wait for a peer."), "CHAT composer and empty-state hide TX chrome while LINK DOWN");
assert(meshHtml.includes("MESH QUIET. Wait for a peer.") && !meshHtml.includes("TX or wait for a peer."), "CHAT empty first-paint does not name hidden TX");
assert(!/text: "SOS " \+ \(m\.msg/.test(meshApp), "SOS handler does not glue SOS onto a qtx that is already SOS");

// --- SDR web app at /radio/ (dj SDR) ---
const sdrHtml = read("radio/index.html");
const sdrUnlock = read("radio/unlock.html");
assert(sdrHtml.includes("dj SDR"), "SDR app title");
assert(sdrHtml.includes('const BASE="http://100.64.185.111:8110"'), "SDR app points at the host backend");
assert(sdrHtml.includes("fetch(BASE+p+"), "SDR api() prefixes BASE");
assert(sdrHtml.includes("assets/leaflet.min.js") && sdrHtml.includes("assets/leaflet.css"), "SDR leaflet is local");
assert(sdrHtml.includes("api_key=cb1_3pqj_1_3ae9e10bef10a2dc2ff55371"), "SDR CARTO tiles carry the API key");
assert(!sdrHtml.includes('src="/assets/') && !sdrHtml.includes('href="/assets/'), "SDR app has no absolute /assets/ refs");
assert(existsSync(join(root, "radio/assets/leaflet.min.js")) && existsSync(join(root, "radio/assets/leaflet.css")), "SDR leaflet assets exist");
assert(sdrUnlock.includes("./?t="), "SDR unlock redirects to its own path");
assert(!existsSync(join(root, "radio/app.js")) && !existsSync(join(root, "radio/sw.js")), "SDR app replaced the radio PWA at /radio/");
assert(headers.includes("/radio/index.html") && headers.includes("/mesh/index.html"), "in-place SDR + mesh index are no-cache");

// --- shipped MOC still has palette + quality + deep link (bundle, no Vite source) ---
const moc = read("assets/index-B5yAHF7-.js");
assert(moc.includes("lock ISS") && moc.includes("quality PERF") && moc.includes("run cinematic"), "MOC palette commands");
assert(moc.includes("ULTRA") && moc.includes("exopace-quality"), "MOC quality tiers");
assert(moc.includes('q.set("lock",a)') && moc.includes("function Op()") && moc.includes("function Vv(") && moc.includes("serviceWorker") && moc.includes("/sw.js"), "MOC root-query deep link + SW register");
assert(moc.includes("function dropDeadLock()") && moc.includes('q.delete("lock")') && moc.includes('q.delete("cam")') && moc.includes("history.replaceState"), "rejected share lock/cam drop via replaceState");
assert(moc.includes('if(!o){Ie("NO MATCH");return}') && moc.includes("function Bl("), "typed SAT NAME / NORAD miss toasts NO MATCH");
assert(moc.includes('if(!(u||"").trim())return;a&&!a.find(u)&&o("");Bl(a,u)'), "search miss clears SAT NAME / NORAD; empty submit does not toast");
assert(moc.includes("Ne=!0,dropDeadLock()") && moc.includes('Ne&&window.setTimeout(()=>Ie("NO MATCH"),2200)'), "unresolved ?lock= on boot strips URL then toasts NO MATCH after FEED");
assert(!moc.includes('if(!o){Ie("NO LOCK");return}'), "typed search miss is NO MATCH not NO LOCK");
assert(moc.includes('Ie("NO LOCK")') && moc.includes('(u==="follow"||u==="satcam")&&!a.selected()') && moc.includes("dropDeadCam()"), "FOLLOW / SAT-CAM without a target toast NO LOCK and strip cam");
assert(moc.includes("function ensureSatsOn(a)") && moc.includes('a.setLayer("sats",!0)') && moc.includes("a.layers.sats"), "valid lock auto-enables SATELLITES when the layer is off");
assert(moc.includes('ensureSatsOn(a)?Ie("SATELLITES ON")') && moc.includes("function Bl("), "search lock toasts SATELLITES ON only when the layer flipped");
assert(moc.includes("className:\"passlist\"") && moc.includes("Ge=z=>{if(!a)return;") && moc.includes("bo(o.id,cam)"), "passlist row lock writes the share URL via bo()");
assert(moc.includes('const cam=!a.rig.mode||a.rig.mode==="moc"?"follow":a.rig.mode') && moc.includes("a.setMode(cam)"), "passlist latches FOLLOW from MOC and keeps an already-active camera");
assert(moc.includes("Z({selected:a.selected(),cam})") && moc.includes("onClick:()=>Ge(z)"), "passlist lock updates cam state and uses the same row click");
{
  const pick = moc.match(/const cam=!a\.rig\.mode\|\|a\.rig\.mode==="moc"\?"follow":a\.rig\.mode/);
  assert(!!pick, "passlist cam picker is extractable");
  const choose = (mode) =>
    vm.runInNewContext("const a={rig:{mode}}; " + pick[0] + ";cam", { mode });
  assert(choose("moc") === "follow" && choose("") === "follow" && choose(undefined) === "follow", "passlist from MOC / empty mode defaults to follow");
  assert(choose("cinematic") === "cinematic" && choose("facility") === "facility" && choose("satcam") === "satcam" && choose("follow") === "follow", "passlist keeps a latched camera");
}
assert(moc.includes("He=ensureSatsOn(x)") && moc.includes('He&&window.setTimeout(()=>Ie("SATELLITES ON"),2200)'), "share-link lock enables SATELLITES and toasts only if it flipped");
assert(moc.includes('q.set("lock",a)') && moc.includes('q.set("cam",u)') && moc.includes('q.set("t",t)') && !/q\.set\("sats"/.test(moc) && !/q\.set\("layer"/.test(moc), "share URL stays lock/cam/time — no layer state");
{
  const m = moc.match(/function ensureSatsOn\(a\)\{if\(!a\|\|a\.layers\.sats\)return!1;a\.setLayer\("sats",!0\);Z\(\{layers:\{\.\.\.Xo\(\)\.layers,sats:!0\}\}\);return!0\}/);
  assert(!!m, "ensureSatsOn() helper is extractable");
  const store = { layers: { sats: false, orbits: true, atmo: true, radio: true, labels: true } };
  const engine = {
    layers: { sats: false, orbits: true },
    setLayer(id, on) {
      this.layers[id] = on;
    },
  };
  const out = vm.runInNewContext(
    m[0] + ";[ensureSatsOn(engine),ensureSatsOn(engine),engine.layers.sats,store.layers.sats,store.layers.orbits]",
    {
      engine,
      store,
      Xo: () => store,
      Z: (patch) => {
        if (patch.layers) store.layers = patch.layers;
      },
    },
  );
  assert(out[0] === true && out[1] === false, "ensureSatsOn returns true only on the flip");
  assert(out[2] === true && out[3] === true && out[4] === true, "ensureSatsOn turns SATELLITES on without dropping other layers");
}

{
  const m = moc.match(/function dropDeadLock\(\)\{const q=new URLSearchParams\(location\.search\);q\.delete\("lock"\);q\.delete\("cam"\);const s=q\.toString\(\);history\.replaceState\(null,"",s\?`\/\?\$\{s\}`:"\/"\)}/);
  assert(!!m, "dropDeadLock() helper is extractable");
  let href = "https://exopace.net/?lock=99999&cam=satcam&t=live#facility";
  const loc = {
    get search() {
      return new URL(href).search;
    },
    get hash() {
      return new URL(href).hash;
    },
  };
  const hist = {
    replaceState(_s, _t, url) {
      href = new URL(url, "https://exopace.net").href;
    },
  };
  vm.runInNewContext(m[0] + ";dropDeadLock()", { location: loc, history: hist, URLSearchParams });
  const u = new URL(href);
  assert(!u.searchParams.has("lock") && !u.searchParams.has("cam"), "dropDeadLock() drops rejected lock/cam");
  assert(u.searchParams.get("t") === "live" && !/lock=99999/.test(href) && !/cam=satcam/.test(href), "dropDeadLock() keeps t=live and does not leave the dead share");
  assert(u.hash === "", "dropDeadLock() strips leftover #facility instead of appending it");
}
{
  const m = moc.match(/function dropDeadCam\(\)\{const q=new URLSearchParams\(location\.search\);const c=\(q\.get\("cam"\)\|\|""\)\.toLowerCase\(\);if\(c==="follow"\|\|c==="satcam"\)q\.delete\("cam"\);const s=q\.toString\(\);history\.replaceState\(null,"",s\?`\/\?\$\{s\}`:"\/"\)}/);
  assert(!!m, "dropDeadCam() helper is extractable");
  function runDrop(href0) {
    let href = href0;
    const loc = {
      get search() {
        return new URL(href).search;
      },
    };
    const hist = {
      replaceState(_s, _t, url) {
        href = new URL(url, "https://exopace.net").href;
      },
    };
    vm.runInNewContext(m[0] + ";dropDeadCam()", { location: loc, history: hist, URLSearchParams });
    return new URL(href);
  }
  {
    const u = runDrop("https://exopace.net/?cam=follow&t=60x");
    assert(!u.searchParams.has("cam") && u.searchParams.get("t") === "60x", "dropDeadCam() drops cam and keeps t");
    assert(u.hash === "" && u.pathname === "/", "dropDeadCam() stays on the root URL with no hash");
  }
  {
    const u = runDrop("https://exopace.net/?cam=satcam");
    assert(!u.searchParams.has("cam") && !u.searchParams.has("t") && u.pathname === "/" && u.search === "", "dropDeadCam() on cam-only URL returns /");
  }
  {
    const u = runDrop("https://exopace.net/?cam=follow&t=hold#facility");
    assert(!u.searchParams.has("cam") && u.searchParams.get("t") === "hold" && u.hash === "", "dropDeadCam() keeps t and does not append leftover hash");
  }
  {
    const u = runDrop("https://exopace.net/?cam=cinematic&t=hold");
    assert(u.searchParams.get("cam") === "cinematic" && u.searchParams.get("t") === "hold", "dropDeadCam() does not strip a lockless-valid CINE share");
  }
}
assert(!moc.includes("/#facility") && !moc.includes('"/#facility"'), "MOC does not write a #facility hash");
assert(moc.includes('{id:"facility",label:"FACILITY"}') && moc.includes(',"facility"]'), "FACILITY is a camstrip mode and a shareable cam= value");
assert(moc.includes('u==="facility"') && moc.includes('Ie("FACILITY · EXOPACE GS")'), "FACILITY latch/toast goes through the camera-mode path");
assert(moc.includes("function Qf()") && moc.includes('==="facility"&&history.replaceState'), "leftover #facility hash is stripped on URL sync");
assert(read("index.html").includes('=== "facility"') && read("index.html").includes("history.replaceState"), "index.html strips leftover #facility without wiping the query");
assert(read("README.md").includes("?cam=facility") && !read("README.md").includes("`#facility` flies"), "README documents cam=facility, not a #facility hash");
{
  const block = moc.match(/function Qf\(\)\{location\.hash\.replace\("#",""\)\.toLowerCase\(\)==="facility"&&history\.replaceState\(null,"",location\.pathname\+location\.search\)}function bo\(a,u,o\)\{const t=o\?\?Ww\(Ko\.rate\?\?1\);const q=new URLSearchParams\(location\.search\);a\?q\.set\("lock",a\):q\.delete\("lock"\);q\.set\("cam",u\);q\.set\("t",t\);history\.replaceState\(null,"",`\/\?\$\{q\.toString\(\)\}`\)}const Ip=\["moc","free","follow","satcam","cinematic","facility"\];function Op\(\)\{const o=new URLSearchParams\(location\.search\),raw=o\.get\("cam"\),h=\(raw\|\|"follow"\)\.toLowerCase\(\);let id=o\.get\("lock"\);if\(!id\)\{const u=location\.pathname\.match\(\/\\\/lock\\\/\(\[\^\/\?\]\+\)\/\);id=u\?decodeURIComponent\(u\[1\]\):null\}return\{id,cam:Ip\.includes\(h\)\?h:"follow",t:o\.get\("t"\)\|\|"live",hasCam:!!raw,hasT:o\.has\("t"\)\}\}/);
  assert(!!block, "Qf/bo/Op share-URL helpers are extractable");
  const ww = moc.match(/function Ww\(r\)\{return r===1\?"live":r===0\?"hold":`\$\{r\}x`\}/);
  assert(!!ww, "Ww() time-mode helper is extractable");
  function runAt(href, src) {
    const box = { href };
    const loc = {
      get search() {
        return new URL(box.href).search;
      },
      get hash() {
        return new URL(box.href).hash;
      },
      get pathname() {
        return new URL(box.href).pathname;
      },
    };
    const hist = {
      replaceState(_s, _t, url) {
        box.href = new URL(url, "https://exopace.net").href;
      },
    };
    const result = vm.runInNewContext(src, {
      location: loc,
      history: hist,
      URLSearchParams,
      Ko: { rate: 1 },
    });
    return { href: box.href, result };
  }
  const helpers = ww[0] + block[0];
  {
    const { href } = runAt("https://exopace.net/?lock=25544&cam=follow&t=live#facility", helpers + ";Qf()");
    const u = new URL(href);
    assert(u.searchParams.get("lock") === "25544" && u.searchParams.get("cam") === "follow" && u.searchParams.get("t") === "live", "Qf() keeps lock/cam/t when stripping #facility");
    assert(u.hash === "" && !/#facility/.test(href), "Qf() strips leftover #facility");
  }
  {
    const { href } = runAt("https://exopace.net/?lock=25544&cam=follow&t=live#facility", helpers + ';bo("25544","facility")');
    const u = new URL(href);
    assert(u.searchParams.get("lock") === "25544" && u.searchParams.get("cam") === "facility" && u.searchParams.get("t") === "live", "FACILITY tap keeps lock and t, writes cam=facility");
    assert(u.hash === "" && !/#facility/.test(href) && u.pathname === "/", "FACILITY tap stays on the root URL with no hash");
  }
  {
    const { href } = runAt("https://exopace.net/", helpers + ';bo(null,"facility")');
    const u = new URL(href);
    assert(!u.searchParams.has("lock") && u.searchParams.get("cam") === "facility" && u.searchParams.get("t") === "live", "FACILITY without a lock writes /?cam=facility&t=live");
    assert(u.hash === "", "FACILITY without a lock does not invent a hash");
  }
  {
    const { result } = runAt("https://exopace.net/?cam=facility", helpers + ";Op()");
    assert(result.cam === "facility" && result.id == null && result.t === "live", "Op() restores cam=facility with no lock");
  }
  {
    const { result } = runAt("https://exopace.net/?lock=25544&cam=facility&t=live#facility", helpers + ";Op()");
    assert(result.id === "25544" && result.cam === "facility" && result.t === "live", "Op() reads lock+facility+t and ignores leftover hash");
  }
  {
    const { result } = runAt("https://exopace.net/?lock=25544&cam=follow&t=live#facility", helpers + ";Op()");
    assert(result.cam === "follow" && result.id === "25544", "leftover #facility does not override cam=follow");
  }
  {
    const { href } = runAt("https://exopace.net/?lock=25544&cam=cinematic&t=hold", helpers + ';bo(null,"cinematic","hold")');
    const u = new URL(href);
    assert(!u.searchParams.has("lock") && u.searchParams.get("cam") === "cinematic" && u.searchParams.get("t") === "hold", "CLEAR LOCK drops only lock and keeps cam=cinematic&t=hold");
    assert(u.hash === "" && u.pathname === "/", "CLEAR LOCK stays on the root URL with no hash");
  }
  {
    const { result } = runAt("https://exopace.net/?cam=cinematic&t=hold", helpers + ";Op()");
    assert(result.cam === "cinematic" && result.t === "hold" && result.id == null && result.hasCam === true && result.hasT === true, "Op() restores cam=cinematic&t=hold after a clear");
  }
  {
    const { result } = runAt("https://exopace.net/", helpers + ";Op()");
    assert(result.hasCam === false && result.hasT === false, "bare / does not invent a cam= or t= share");
  }
  {
    const { href } = runAt("https://exopace.net/", helpers + ';bo(null,"cinematic","hold")');
    const u = new URL(href);
    assert(!u.searchParams.has("lock") && u.searchParams.get("cam") === "cinematic" && u.searchParams.get("t") === "hold", "lockless CINE+HOLD writes /?cam=cinematic&t=hold");
  }
  {
    const { href } = runAt("https://exopace.net/", helpers + ';bo(null,"free","60x")');
    const u = new URL(href);
    assert(!u.searchParams.has("lock") && u.searchParams.get("cam") === "free" && u.searchParams.get("t") === "60x", "lockless FLY writes /?cam=free&t=60x");
  }
  {
    const { href } = runAt("https://exopace.net/", helpers + ';bo(null,"moc","live")');
    const u = new URL(href);
    assert(!u.searchParams.has("lock") && u.searchParams.get("cam") === "moc" && u.searchParams.get("t") === "live", "lockless MOC writes /?cam=moc&t=live");
  }
  {
    const { result } = runAt("https://exopace.net/?cam=follow&t=60x", helpers + ";Op()");
    assert(result.cam === "follow" && result.hasCam === true && result.t === "60x" && result.id == null, "Op() still reads a lockless follow URL so onReady can refuse it");
  }
}
assert(read("README.md").includes("Lockless cams") && read("README.md").includes("/?cam=follow") && read("README.md").includes("drops `cam`"), "README documents lockless cam/t write and FOLLOW/SAT-CAM NO LOCK strip");
assert(!moc.includes('history.replaceState(null,"","/")'), "CLEAR LOCK does not wipe the share URL to /");
assert(moc.includes('u==="follow"||u==="satcam"?(a.setMode("moc"),a.recageHome(),Z({cam:"moc"}),bo(null,"moc")):bo(null,u||Ko.cam),Ie("LOCK CLEARED")'), "CLEAR LOCK keeps lockless-valid cam/t; FOLLOW / SAT-CAM fall back to moc");
assert(moc.includes("function Kl(a)") && moc.includes("onClick:()=>Kl(a)") && moc.includes("x.selected()?Kl(x)"), "empty globe deselect and CLEAR LOCK share Kl()");
assert(moc.includes("onPick:L=>{if(!L){x.selected()?Kl(x):(x.setSelected(null),Z({selected:null}));return}") && moc.includes("F&&(bo(F.id,x.rig.mode)"), "empty canvas uses CLEAR LOCK; a sat pick still writes ?lock=");
{
  const m = moc.match(/function Kl\(a\)\{if\(!a\)return;a\.setSelected\(null\),Z\(\{selected:null\}\);const u=a\.rig\.mode;u==="follow"\|\|u==="satcam"\?\(a\.setMode\("moc"\),a\.recageHome\(\),Z\(\{cam:"moc"\}\),bo\(null,"moc"\)\):bo\(null,u\|\|Ko\.cam\),Ie\("LOCK CLEARED"\)\}/);
  assert(!!m, "Kl() CLEAR LOCK helper is extractable");
  function runKl(mode) {
    const calls = [];
    const engine = {
      rig: { mode },
      setSelected(id) { calls.push(["setSelected", id]); },
      setMode(cam) { calls.push(["setMode", cam]); },
      recageHome() { calls.push(["recage"]); },
    };
    vm.runInNewContext(m[0] + ";Kl(engine)", {
      engine,
      Ko: { cam: "moc" },
      Z: (p) => calls.push(["Z", p]),
      bo: (id, cam) => calls.push(["bo", id, cam]),
      Ie: (t) => calls.push(["Ie", t]),
    });
    return calls;
  }
  {
    const calls = runKl("moc");
    assert(calls.some((c) => c[0] === "bo" && c[1] === null && c[2] === "moc"), "Kl() from MOC drops only lock and keeps cam=moc");
    assert(!calls.some((c) => c[0] === "recage" || c[0] === "setMode"), "Kl() from MOC does not recage or force a camera change");
    assert(calls.some((c) => c[0] === "Ie" && c[1] === "LOCK CLEARED"), "Kl() toasts LOCK CLEARED");
  }
  {
    const calls = runKl("cinematic");
    assert(calls.some((c) => c[0] === "bo" && c[1] === null && c[2] === "cinematic"), "Kl() from CINE drops only lock and keeps cam=cinematic");
    assert(!calls.some((c) => c[0] === "recage"), "Kl() from CINE does not recage");
  }
}
assert(moc.includes('a.rig.abortCinematic()') && moc.includes('a.setMode("moc"),Z({cam:"moc"}),bo(a.selected()?.id||null,"moc")'), "⌂ MOC aborts CINE and writes cam=moc so URL and HUD stay truthful");
assert(!moc.includes('recageHome(),Z({selected:null,cam:"moc"})'), "CLEAR LOCK does not recage home or force cam=moc on CINE / FACILITY / FLY");
assert(moc.includes("V.hasCam||V.hasT") && moc.includes("u===\"cinematic\"&&x.rig.startCinematic()"), "cold-open /?cam=&t= restores camera and time without a lock");
assert(moc.includes('V.hasCam&&(V.cam==="follow"||V.cam==="satcam")') && moc.includes("dropDeadCam();Le=!0") && moc.includes('Le&&window.setTimeout(()=>Ie("NO LOCK"),2200)'), "lockless ?cam=follow / satcam toasts NO LOCK after FEED and strips cam");
assert(moc.includes('V.hasCam&&V.cam!=="follow"&&V.cam!=="satcam"'), "onViewport does not latch FOLLOW / SAT-CAM before a lock exists");
assert(moc.includes('bo(a.selected()?.id||null,"moc")'), "⌂ MOC writes cam=moc on the share URL");
assert(moc.includes('bo(w?w.id:null,"cinematic")') && moc.includes('bo(w?w.id:null,a.rig.mode,Ww(o))'), "CINE and timebar write cam/t even with no lock");
assert(read("index.html").includes("\\/lock\\/") && read("index.html").includes('q.set("lock"'), "index.html rewrites legacy /lock/ to root query");
assert(moc.includes("lock ISS · layer radio · quality PERF"), "palette placeholder matches real commands");
assert(moc.includes('placeholder:"SAT NAME / NORAD"') && !moc.includes("SAT NAME / NORAD  ·  / palette"), "phone search placeholder is SAT NAME / NORAD with no clipped / palette");
assert(moc.includes("exoAllowDemo"), "MOC demo helper (prod still false)");
assert(!moc.includes("BASECAMP") && !moc.includes("RIG-1") && !moc.includes("TRK-2"), "MOC live bundle has no demo station fixtures");
assert(!moc.includes("35.1495") && !moc.includes("-90.049"), "MOC live bundle has no dummy Memphis city");
assert(moc.includes("function yc(){const a=[];if(!Fp())return a;"), "guest RADIO layer does not paint a dummy home pin while MESH is OFFLINE");
assert(!moc.includes("PASS · MILLINGTON") && !moc.includes("EL · MILLINGTON") && !moc.includes("FACILITY · MILLINGTON"), "MOC guest chrome does not name MILLINGTON");
assert(moc.includes("FACILITY · EXOPACE GS") && moc.includes("EL · EXOPACE GS") && moc.includes("EXOPACE GS"), "MOC guest chrome keeps EXOPACE GS");
assert(moc.includes("`AOS ${") && moc.includes("Z AZ ") && moc.includes('"NO PASS"'), "lock next-pass paints AOS/AZ when a pass exists, else NO PASS");
assert(!moc.includes("NEXT · AOS ") && !moc.includes("NEXT PASS · EXOPACE GS"), "lock NEXT label does not sit on a NEXT · AOS value");
assert(moc.includes("nextEvent:up(W,x.clock.epochMs)"), "share-restore of a valid lock runs the same up() predictor as search ticks");
assert(moc.includes('nextEvent:g?up(g,this.clock.epochMs):"NO LOCK"'), "tick NEXT uses the sim clock epoch, not wall Date.now()");
assert(moc.includes("function up(a,t)") && moc.includes("start:new Date(t)"), "up() / hp() start from the sim instant UTC/LOCAL/passlist already use");
assert(!moc.includes("const n=a.norad||a.id,t=Date.now()"), "lock NEXT no longer predicts from wall Date.now()");
assert(moc.includes("x.setSelected(W.id)") && moc.includes("nextEvent:up(W,x.clock.epochMs)") && moc.includes("function Bl("), "restore reuses search-lock up(); it does not invent a second predictor");
{
  const m = moc.match(/function up\(a,t\)\{t=t\?\?Date\.now\(\);[\s\S]*?"NO PASS"\}/);
  assert(!!m, "up() predictor is extractable");
  let hpStart = null;
  const hold = 1_700_000_000_000;
  const line = vm.runInNewContext(m[0] + ";up({lat:0,lon:0,alt:400,norad:\"25544\",id:\"25544\"},hold)", {
    hold,
    Yd: () => 0,
    Se: { lat: 35.346, lon: -89.836, alt: 80 },
    hp(_bodies, _site, opts) {
      hpStart = opts.start.getTime();
      return [{ aos: new Date(hold + 3_600_000), aosAz: 152 }];
    },
    $l: () => "02:02:02",
  });
  assert(hpStart === hold, "up() starts hp() from the sim epoch, not wall Date.now()");
  assert(line.includes("AOS 02:02:02Z AZ 152") && line.includes("EXOPACE GS"), "up() paints the same AOS/AZ · EXOPACE GS line search lock writes");
  const held = vm.runInNewContext(m[0] + ";up.i=null;up({lat:0,lon:0,alt:400,norad:\"25544\"},hold);up({lat:0,lon:0,alt:400,norad:\"25544\"},hold)", {
    hold,
    Yd: () => 0,
    Se: { lat: 35.346, lon: -89.836, alt: 80 },
    hp(_bodies, _site, opts) {
      hpStart = opts.start.getTime();
      return [{ aos: new Date(hold + 3_600_000), aosAz: 152 }];
    },
    $l: () => "02:02:02",
  });
  assert(held.includes("AOS 02:02:02Z"), "up() cache stays on the frozen HOLD sim instant");
}
assert(!moc.includes('pass:"nodelink"'), "MOC live bundle does not ship a factory AP named nodelink");
assert(!read("mesh/protocol.js").includes("BASECAMP") && !read("mesh/protocol.js").includes("RIG-1") && !read("mesh/protocol.js").includes("TRK-2"), "Radio protocol has no BASECAMP / RIG-1 / TRK-2 fixtures");
assert(!read("protocol/index.js").includes("BASECAMP") && !read("protocol/index.js").includes("RIG-1"), "canonical protocol demo helper dropped BASECAMP / RIG-1 names");
assert(!moc.includes('?"AUDIO":"TICKS"') && !moc.includes('"TICKS"'), "MOC sound chip is never labeled TICKS");
assert(moc.includes('children:"AUDIO"'), "MOC sound chip stays AUDIO either way");
assert(moc.includes('feed:"WAIT"'), "MOC initial feed is WAIT not ERROR");
assert(moc.includes("FEED WAIT"), "MOC paints FEED WAIT while CelesTrak loads");
assert(!moc.includes('feed:"ERROR",imagery'), "MOC does not first-paint FEED ERROR");
assert(!moc.includes("exopase.com"), "MOC bundle does not poll exopase.com");
assert(!moc.includes("EXOPACE_BRIDGE unset") && !moc.includes("NO BRIDGE · EXOPACE_BRIDGE"), "MOC guest stoff does not leak EXOPACE_BRIDGE");
assert(moc.includes('Wo("NO BRIDGE")'), "empty bridge stays OFFLINE · NO BRIDGE");
assert(!read("mesh/app.js").includes("EXOPACE_BRIDGE unset") && !read("mesh/app.js").includes("unset in /env.js"), "Radio does not paint env-file leaks");
assert(!moc.includes("unset in /env.js") && !moc.includes("EXOPACE_IMAGERY.ION_TOKEN"), "MOC imagery note does not leak /env.js");
assert(moc.includes('_setImagery("ESRI FALLBACK")'), "empty imagery keys stay ESRI FALLBACK without a config dump");
assert(moc.includes('_setImagery("OFFLINE")'), "failed imagery request stays guest OFFLINE");
assert(!moc.includes("ERROR(${"), "MOC does not wrap library request text as ERROR(...)");
assert(!moc.includes("IMAGERY INIT FAILED"), "imagery catch no longer dumps IMAGERY INIT FAILED");
assert(moc.includes("function Wt(") && moc.includes("children:Wt(z.msg)"), "STATION log sanitizes ERROR(...) / request-failed wraps");
assert(moc.includes('Ie("IMAGERY OFFLINE")') && moc.includes('Zt("IMAGERY",Me?"OFFLINE"'), "imagery toast/log are IMAGERY OFFLINE, not REQUEST FAILED");
assert(!moc.includes('Ie("IMAGERY REQUEST FAILED")') && !moc.includes('_setImagery("REQUEST FAILED")'), "guest chrome does not paint REQUEST FAILED");
assert(!moc.includes('className:"rate"'), "timebar does not paint a duplicate .rate LIVE label");
assert(read("moc-phone.css").includes(".timebar .rate") && read("moc-phone.css").includes("display: none"), "overlay hides leftover .rate LIVE echo");
assert(!moc.includes('hostname==="exopace.net"'), "MOC has no live-host typo-bridge fallback");
assert(!read("env.js").includes("exopase"), "env.js has no exopase.com");
assert(read("moc-phone.css").includes(".hud .toast") && /pointer-events:\s*none/.test(read("moc-phone.css")), "FEED toast does not steal SAT NAME hits");
assert(/@media \(max-width: 820px\)[\s\S]*\.hud \.toast[\s\S]*top:\s*auto/.test(read("moc-phone.css")), "phone FEED toast parks off SAT NAME");
assert(read("moc-phone.css").includes("min-width: 821px") && read("moc-phone.css").includes("left: 158px"), "1280 search sits left of UTC clock");
const desktopHud = read("moc-phone.css").split("@media (min-width: 821px)")[1]?.split("@media (max-width: 820px)")[0] || "";
assert(/\.zoom \.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 HUD zoom taps are ≥44");
assert(/\.station \.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 STATION ARM tap is ≥44");
assert(/\.station \.passlist li\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 STATION next-pass rows are ≥44");
assert(/\.dossier button\.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 ISS lock COPY COORDS / CLEAR LOCK taps are ≥44");
assert(/\.tl a\.radio-link\.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 RADIO link tap is ≥44");
assert(/\.tl button\.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 AUDIO tap is ≥44");
assert(/\.tl select\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 PERF quality select tap is ≥44");
assert(/\.tl span\.chip\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 FEED CELESTRAK CACHED chip is ≥44");
assert(/\.tl span\.utc\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 UTC clock is ≥44");
assert(/\.station\s*\{[^}]*overflow:\s*hidden/.test(desktopHud), "1280 STATION contains RF CHAIN + LOG inside the panel");
assert(/\.station \.stlog\s*\{[^}]*overflow:\s*auto/.test(desktopHud), "1280 STATION LOG scrolls inside the panel");
assert(/\.station \.passlist\s*\{[^}]*min-height:\s*0/.test(desktopHud), "1280 STATION passlist yields so RF CHAIN stays inside");
assert(/\.layers \.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 LAYERS SATELLITES/ORBITS/ATMO/RADIO/LABELS taps are ≥44");
assert(/\.camstrip \.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 camstrip LAYERS/STATION/FLY/FACILITY taps are ≥44");
assert(/\.timebar \.btn\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 timebar LIVE/HOLD/10×/60× taps are ≥44");
assert(/\.timebar \.btn\s*\{[^}]*min-width:\s*44px/.test(desktopHud), "1280 timebar 10× width is ≥44");
assert(/#exo-install\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 INSTALL APP tap is ≥44");
assert(/\.search input\s*\{[^}]*min-height:\s*44px/.test(desktopHud), "1280 SAT NAME / NORAD tap is ≥44");
assert(read("index.html").includes("min-height: 44px"), "inline INSTALL APP first-paint is ≥44");
assert(read("moc-phone.css").includes(".zoom .btn") && /min-height:\s*44px/.test(read("moc-phone.css")), "phone HUD zoom taps are ≥44");
assert(read("moc-phone.css").includes("html:has(.layers.open) .zoom") && read("moc-phone.css").includes("html:has(.station) .zoom"), "phone zoom hides while LAYERS or STATION is open");
assert(read("moc-phone.css").includes("a.radio-link.btn") && read("moc-phone.css").includes("min-width: 44px"), "phone RADIO link tap is ≥44");
assert(/\.dossier button\.btn\s*\{[^}]*min-height:\s*44px/.test(read("moc-phone.css")), "phone ISS lock COPY COORDS / CLEAR LOCK taps are ≥44");
assert(/\.station \.btn\s*\{[^}]*min-height:\s*44px/.test(read("moc-phone.css")), "phone STATION ARM tap is ≥44");
assert(/\.station \.passlist li\s*\{[^}]*min-height:\s*44px/.test(read("moc-phone.css")), "phone STATION next-pass rows are ≥44");
assert(/@media \(max-width: 820px\)[\s\S]*\.tl span\.chip\s*\{[^}]*min-height:\s*44px/.test(read("moc-phone.css")), "phone FEED CELESTRAK CACHED chip is ≥44");
assert(/@media \(max-width: 820px\)[\s\S]*\.tl span\.utc\s*\{[^}]*min-height:\s*44px/.test(read("moc-phone.css")), "phone UTC clock is ≥44");
assert(index.includes('id="exo-toast"') && index.includes('showHudToast("NO LOCK")') && index.includes('SAT-CAM') && index.includes('t === "FOLLOW"') && !index.includes('t === "FLY"'), "SAT-CAM / FOLLOW without a lock share the same NO LOCK refusal; FLY is lockless-valid");
assert(index.includes('classList.remove("on")') && index.includes("function lockCamBtn") && index.includes("function dropDeadCam") && index.includes("q.delete(\"cam\")"), "SAT-CAM / FOLLOW stay off and strip cam when SELECTION is NO LOCK");
assert(index.includes('RF CHAIN OFFLINE') && index.includes('chainOk("RADIO")') && index.includes('chainOk("ROTATOR")') && index.includes(".station .btn"), "STATION ARM refuses while radio/rotator are offline");
assert(index.includes("function rfReady") && index.includes('t.indexOf("ARM ") === 0'), "STATION ARM still fires when radio and rotator are stok");
assert(index.includes("#exo-toast") && read("moc-phone.css").includes("#exo-toast"), "refusal toast lives outside #root so React cannot wipe it");
assert(index.includes("function syncStationClock") && index.includes('kvSpan("UTC")') && index.includes(".tl span.utc"), "STATION UTC mirrors the header sim clock under HOLD");
assert(index.includes("new MutationObserver(syncStationClock)") && index.includes("headerUtcDate"), "STATION clock resyncs when the header UTC ticks or freezes");
assert(index.includes("watchStationClock") && index.includes("kvSpan(\"LOCAL\")"), "STATION LOCAL span is re-synced when the bundle overwrites it");
assert(index.includes('SITE_TZ = "America/Chicago"') && index.includes("function siteLocalTime") && index.includes('kvSpan("LOCAL")'), "STATION LOCAL is site-scoped America/Chicago, not the viewer zone");
assert(!index.includes("d.getHours()") && !index.includes("d.getMinutes()"), "STATION LOCAL does not use the viewer getHours/getMinutes");
assert(index.includes("function wantedLocal") && index.includes("function isLocalSpan") && index.includes("forceLocalNode"), "STATION LOCAL identifies its own span so UTC writes cannot reuse it");
assert(index.includes("patchProto") && index.includes('patchProto(Node.prototype, "nodeValue")') && index.includes('patchProto(CharacterData.prototype, "data")'), "STATION LOCAL intercepts React nodeValue/data so the wall-clock writer cannot land");
assert(index.includes('wrapInsert("appendChild")') && index.includes('wrapInsert("insertBefore")') && index.includes("armLocalSpan"), "STATION LOCAL intercepts first-paint inserts and span textContent");
assert(index.includes("headerObserved") && index.includes("bindHeader"), "STATION clock rebinds the header observer if React replaces .tl span.utc");
assert(moc.includes("a?.clock?.epochMs??Date.now()") && moc.includes("x(a.clock.epochMs)"), "STATION passlist now ticks from engine sim clock, not wall Date.now()");
assert(!moc.includes("setInterval(()=>x(Date.now()),1e3)"), "STATION passlist no longer uses a wall-clock 1s tick");
{
  const cdt = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date("2026-09-03T15:33:12Z"));
  const cst = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date("2026-01-15T15:33:12Z"));
  const hms = (parts) => {
    const pick = (t) => {
      const p = parts.find((x) => x.type === t);
      let v = p ? String(p.value) : "00";
      if (t === "hour" && v === "24") v = "00";
      return v.padStart(2, "0");
    };
    return `${pick("hour")}:${pick("minute")}:${pick("second")}`;
  };
  assert(hms(cdt) === "10:33:12", "America/Chicago CDT is UTC-5 in September");
  assert(hms(cst) === "09:33:12", "America/Chicago CST is UTC-6 in January");
}
assert(/@media \(max-width: 820px\)[\s\S]*\.palette\s*\{[^}]*display:\s*none/.test(read("moc-phone.css")), "phone hides the command palette");
assert(index.includes('e.key !== "/"') && index.includes("max-width: 820px"), "phone / does not open the command palette");
assert(/@media \(max-width: 380px\)[\s\S]*letter-spacing:\s*0/.test(read("moc-phone.css")), "360 search drops tracking so SAT NAME / NORAD fits");
assert(/overflow-x:\s*hidden/.test(meshHtml), "Radio clips horizontal overflow");
assert(/#battChart,#rssiChart\{width:100%;max-width:100%;min-width:0/.test(meshHtml), "Radio rssiChart scales to the NODE pane");
assert(meshHtml.includes('id="battEmpty"') && meshHtml.includes("NO LAST-HOUR SAMPLES") && meshHtml.includes('id="rssiEmpty"') && meshHtml.includes("NO RSSI SAMPLES"), "NODE charts first-paint honest empty-states");
assert(meshHtml.includes('id="telemEmpty"') && meshHtml.includes("NO TELEMETRY") && meshHtml.includes('id="telemGrid" hidden'), "NODE vitals first-paint honest empty-state instead of dummy -%");
assert(!meshHtml.includes(">-%<") && !meshHtml.includes(">- V<") && !meshHtml.includes("heap -<") && !meshHtml.includes("SNR -<"), "NODE vitals HTML has no dummy dash readings");
assert(/#telemGrid\[hidden\]\{[^}]*display:none/.test(meshHtml) && meshApp.includes("syncTelemEmpty"), "NODE dummy vitals stay hidden until the node reports");
assert(!meshApp.includes("35.1495") && meshApp.includes("btnRecage") && meshApp.includes("WAITING FOR FIX"), "RECAGE ON ME waits for a GPS fix and does not fly to a dummy city");
assert(meshHtml.includes('id="btnRange" hidden') && meshApp.includes("function syncMapChrome") && meshApp.includes("if (!radioUp()) return"), "MAP RANGE TEST is hidden while LINK DOWN and does not toggle without a radio");
assert(meshHtml.includes('id="btnWay" hidden') && meshApp.includes("way.hidden = !hasFix"), "MAP DROP WAYPOINT is hidden until there is a GPS fix");
assert(meshHtml.includes('id="btnCopy" hidden') && meshApp.includes("copy.hidden = !hasFix"), "MAP COPY COORDS is hidden until there is a GPS fix");
assert(meshHtml.includes('id="btnMaps" hidden') && meshApp.includes("maps.hidden = !hasFix"), "MAP OPEN IN MAPS is hidden until there is a GPS fix");
assert(meshHtml.includes('id="mapsHint" hidden') && /#mapsHint\[hidden\]\{[^}]*display:none/.test(meshHtml), "MAP Maps-hint starts hidden until there is a GPS fix");
assert(meshApp.includes("mapsHint.hidden = !hasFix"), "MAP Maps-hint stays hidden with OPEN IN MAPS until there is a GPS fix");
assert(meshHtml.includes('id="compass" hidden') && /#compass\[hidden\]\{[^}]*display:none/.test(meshHtml), "MAP compass starts hidden until there is a GPS fix");
assert(meshApp.includes("compass.hidden = !hasFix"), "MAP compass stays hidden until there is a GPS fix so it does not paint a dummy heading");
assert(meshHtml.includes('id="posLL" hidden') && meshHtml.includes('id="posMeta" hidden') && !meshHtml.includes("--.-----"), "MAP dummy lat/lon starts hidden until there is a GPS fix");
assert(/#posLL\[hidden\]\{[^}]*display:none/.test(meshHtml) && meshApp.includes("ll.hidden = !hasFix"), "MAP dummy --.----- / - · - stay hidden until there is a GPS fix");
assert(meshApp.includes("syncChartEmpty") && meshApp.includes('S.batt.length > 0') && meshApp.includes('S.rssiSpark.length > 0'), "NODE charts hide the canvas until a real sample exists");
assert(!/S\.batt\s*=\s*\[[^\]]*[1-9]/.test(meshApp) && meshApp.includes("batt: []") && meshApp.includes("rssiSpark: []"), "NODE does not invent a battery or RSSI series");
assert(/\.card\{[^}]*overflow:hidden/.test(meshHtml), "Radio NODE cards cannot grow past the pane");
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
