# EXOpace

One brand. Two surfaces. One protocol.

| Surface | URL | What |
|---------|-----|------|
| **MOC** | https://exopace.net/mission/ | Planetary / orbital mission control (Cesium). `https://exopace.net/` redirects here. |
| **Radio** | https://exopace.net/radio/ | Installable field radio PWA |
| **Field maps** | https://exopace.net/maps/ | MGRS letter sheets, print, and ATAK KMZ |
| **SDR** | `SDR.md` | Memphis RF sensor surface: decoder matrix + live view |
| **Firmware** | `FIRMWARE.md` | Heltec V4 contract |

Host: **https://exopace.net**  
Wordmark: **EXOpace**  
Palette: void / cyan / amber. Not purple SaaS. Not Inter.

exopace.com is a parking lander — leave it alone.

## This repository

Live source: **https://github.com/Breaux-cpu/exopace.net**. This GitHub tree **is** the shipped static PWA (Cloudflare Pages publish dump). There is **no** root `package.json`, no Vite `src/`, and no committed copy of `/mnt/gsdata/exopace/moc`. The workstation moc source was never pushed here. Do not invent a second repo.

- **MOC** ships as hashed assets (`assets/index-B5yAHF7-.js` + `sat-CIpmmEb5.js`) plus `/cesium/`. Do not invent a second Mission Control.
- **Radio** is real source: `radio/*.js`, `radio/index.html`, `radio/textures/`.
- **Protocol** ESM: `protocol/index.js`. Radio IIFE: `radio/protocol.js`.
- `env.js` / `radio/env.js` are **prod**: `EXOPACE_ENV=prod`, `EXOPACE_ALLOW_DEMO=false`. Do not enable Demo in this tree.

## Install Radio

Direct hardware, in the browser. No Python server and no tunnel.

- **USB SDR** — Chrome or Edge: `/radio/` Live or Decode → **CONNECT USB SDR**. RTL2832U with R820T or R828D (`0x0bda` / `0x2838` or `0x2832`). Until a dongle is paired the page stays `NO USB DEVICE · CLICK CONNECT USB`. Firefox and iOS Safari have no WebUSB. Mic and line-in still work there.
- **USB mesh** — `/mesh/` and `/maps/` → **CONNECT USB NODE**. Heltec V4 or another ESP32-S3 node at 115200. The bytes are the same v3.0 `track`, `way`, `rf`, and `sos` lines as Bluetooth.
- **CONNECT → Bluetooth → `EXOpace-XXXX`** when the node is on BLE. Do **not** pair in Android Settings.
- Wi-Fi fallback: join `EXOpace-XXXX` / `nodelink` → http://192.168.4.1
- Chrome / Edge → **INSTALL APP**. iPhone Safari → Share → Add to Home Screen.

`scripts/sdr-bridge/` is an optional archived headless relay for a machine that already runs `rtl_tcp`. It is not the visitor path.

Demo mode (Earth + Memphis mesh) is a **DEV** thing only. Prod env locks it out.

## Quality tiers (MOC)

`ULTRA | HIGH | MED | PERF` — auto-detect, persisted as `exopace-quality`, override in the HUD.

- **ULTRA** — title-card stills: full Rayleigh+Mie, clouds, bloom, milky way
- **PERF** — mid Android / thermal: fewer stars, no clouds, no bloom

`/` redirects to `/mission/` (302). `/mission/` opens the command palette: `lock ISS`, `lock Hubble`, `layer radio`, `run cinematic`, `quality PERF`, `facility`, `time live`, `recage station`.

Time: **LIVE · HOLD · 10× · 60×**. Deep link: `/?lock=25544&cam=follow&t=live`. A valid lock restore (cold-open `?lock=` or leftover `/lock/:id`) paints the same dossier NEXT AOS/LOS line as a SAT NAME lock, from the sim clock. Lockless cams (CINE, FACILITY, FLY/`free`, ⌂ MOC/`moc`) and time modes write `/?cam=…&t=…` with no lock and restore on a cold load. `/?cam=facility` flies to EXOPACE GS. Leftover `#facility` hashes are ignored and stripped. FOLLOW / SAT-CAM still need a target: a lockless tap or `/?cam=follow` / `/?cam=satcam` toasts `NO LOCK`, drops `cam`, and keeps a valid `t`. CLEAR LOCK drops only `lock` when the painted cam is lockless-valid (e.g. `/?cam=cinematic&t=hold`); FOLLOW / SAT-CAM fall back to ⌂ MOC. An empty globe click uses that same CLEAR LOCK path so a miss-click cannot leave a lying `?lock=`. STATION next-pass rows lock like search: `?lock=<norad>&cam=follow&t=…` from ⌂ MOC (an already-latched camera stays).

First paint is **FEED WAIT** until CelesTrak returns LIVE/CACHED or a real timeout. **FEED ERROR** / MODE **FAULT** only after that failure — not while ION/TLE are still in flight. Empty after timeout is allowed. Invented 0 is not.

`/about` `/ops` `/login` `/app` are **not** product routes. They 404. `/mission` redirects to `/mission/`. `/mission/` is the globe. `/lock/:id` serves that mission document with status 200; the page script writes the lock query. Shareable lock state lives on query params (`?lock=…&cam=…&t=…`).

`EXOPACE_BRIDGE` is empty in this ship tree. The MOC must **not** fall back to `exopase.com` (typo) or any public host. RF stays quiet/offline until a real LAN/configured origin is set. Do not turn exopace.com into MOC.

Offline: last CelesTrak pull is **CACHED**. Prod does **not** invent a synthetic fleet (`FEED ERROR` if nothing is cached).

## Protocol

Shared JSON in `protocol/`. Existing types unchanged. New: `sos`, `way`, `track`, `rf`, `presence`, `time`.

BLE: Nordic UART `6e400001/002/003`, namePrefix `EXOpace`.  
No Meshtastic lock-in.

## Local serve (this tree)

```
python3 -m http.server 4173
# /     redirects to /mission/
# MOC   http://127.0.0.1:4173/mission/
# Radio http://127.0.0.1:4173/radio/
# lock  http://127.0.0.1:4173/mission/?lock=25544&cam=follow&t=live
# facility  http://127.0.0.1:4173/mission/?cam=facility
# lockless cine+hold  http://127.0.0.1:4173/mission/?cam=cinematic&t=hold
# lockless follow (refuses)  http://127.0.0.1:4173/mission/?cam=follow&t=60x
# lock+facility  http://127.0.0.1:4173/mission/?lock=25544&cam=facility&t=live
# legacy /lock/25544 serves mission/index.html with status 200
```

Deep links need the host `_redirects` (Cloudflare). `/` 302s to `/mission/`. `/lock/*` serves `mission/index.html` at status 200. A raw `http.server` will 404 bare `/lock/*` because it does not apply `_redirects`.

## Verify

```
node scripts/verify.mjs
```

Checks prod demo lock, PWA manifests, service workers, first-paint DOM, protocol encode/parse, Radio install path, and that this tree did not grow a fake Vite app.

## Firmware flash

See `FIRMWARE.md`. The `firmware/exopace_v4/` overlay and `~/nodelink` field tree are **not** in this repo.

## SDR / ingest (not in this git tree)

Direct USB is the primary radio path. WebUSB on `/radio/` tunes 24 MHz to 1766 MHz, sets the sample rate, tuner gain, and AGC, and streams bulk IQ into a radix-2 FFT plus FM, AM, or USB audio. Web Serial on `/mesh/` and `/maps/` is the primary node path. The page does not invent spectrum. With no dongle it reads `NO USB DEVICE · CLICK CONNECT USB`.

`scripts/sdr-bridge/` is an optional archived relay. It still refuses to invent FFT frames when `rtl_tcp` is down.

`SDR_AGENT.md` remains the headless-agent contract: readsb `aircraft.json` on localhost:8080, AIS-catcher optional, no demo tracks. Do not open `/dev/bus/usb` on a Cloud Agent VM.

`SDR.md` keeps the wider decoder matrix — ADS-B/AIS/APRS/POCSAG/ISM, Meteor LRPT + NOAA, ISS SSTV, ACARS, RS41 radiosonde tracking, P25/YSF voice, WSPR/FT8, RDS, wideband sweep, rtl_tcp. Those host decoders are not required to hear the dongle in the browser.

The Python agent is `/mnt/gsdata/exopace/sdr-agent`. Public `wss://exopace.net/bridge/sensor` is **not** a Pages route yet. Until a Worker/ingest origin exists, MOC AIR/SEA/RF stay empty and must read **ERROR / OFFLINE / NO RF SAMPLES** — never invented tracks.

## What is not here

- PlotQuest / personal-dashboard / Reels / Watch
- moc Vite source, ingest/bridge Python, SDR agent source
- Deploy scripts (`/mnt/gsdata/exopace/scripts/deploy-exopace-net.sh`)
- Do not deploy Pages or Worker from this work
- Do not paste or rotate imagery tokens; owner-filled in `env.js` after deploy
