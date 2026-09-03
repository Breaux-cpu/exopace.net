# EXOpace

One brand. Two surfaces. One protocol.

| Surface | URL | What |
|---------|-----|------|
| **MOC** | https://exopace.net | Planetary / orbital mission control (Cesium) |
| **Radio** | https://exopace.net/radio/ | Installable field radio PWA |
| **Firmware** | `FIRMWARE.md` | Heltec V4 contract |

Host: **https://exopace.net**  
Wordmark: **EXOpace**  
Palette: void / cyan / amber. Not purple SaaS. Not Inter.

exopace.com is a parking lander — leave it alone.

## This repository

This GitHub tree **is** the shipped static PWA (Cloudflare Pages publish dump). There is **no** root `package.json`, no Vite `src/`, and no committed copy of `/mnt/gsdata/exopace/moc`. The workstation moc source was never pushed here.

- **MOC** ships as hashed assets (`assets/index-B5yAHF7-.js` + `sat-CIpmmEb5.js`) plus `/cesium/`. Do not invent a second Mission Control.
- **Radio** is real source: `radio/*.js`, `radio/index.html`, `radio/textures/`.
- **Protocol** ESM: `protocol/index.js`. Radio IIFE: `radio/protocol.js`.
- `env.js` / `radio/env.js` are **prod**: `EXOPACE_ENV=prod`, `EXOPACE_ALLOW_DEMO=false`. Do not enable Demo in this tree.

## Install Radio

- Chrome / Edge → **INSTALL APP**
- iPhone Safari → Share → Add to Home Screen
- **CONNECT → Bluetooth → `EXOpace-XXXX`**
- Do **not** pair in Android Settings
- Wi-Fi fallback: join `EXOpace-XXXX` / `nodelink` → http://192.168.4.1

Demo mode (Earth + Memphis mesh) is a **DEV** thing only. Prod env locks it out.

## Quality tiers (MOC)

`ULTRA | HIGH | MED | PERF` — auto-detect, persisted as `exopace-quality`, override in the HUD.

- **ULTRA** — title-card stills: full Rayleigh+Mie, clouds, bloom, milky way
- **PERF** — mid Android / thermal: fewer stars, no clouds, no bloom

`/` opens the command palette: `lock ISS`, `lock Hubble`, `layer radio`, `run cinematic`, `quality PERF`, `facility`, `time live`, `recage station`.

Time: **LIVE · HOLD · 10× · 60×**. Deep link: `/lock/25544?cam=follow&t=live`. `#facility` flies to Millington GS.

Offline: last CelesTrak pull is **CACHED**. Prod does **not** invent a synthetic fleet (`FEED ERROR` if nothing is cached).

## Protocol

Shared JSON in `protocol/`. Existing types unchanged. New: `sos`, `way`, `track`, `rf`, `presence`, `time`.

BLE: Nordic UART `6e400001/002/003`, namePrefix `EXOpace`.  
No Meshtastic lock-in.

## Local serve (this tree)

```
python3 -m http.server 4173
# MOC   http://127.0.0.1:4173/
# Radio http://127.0.0.1:4173/radio/
# lock  http://127.0.0.1:4173/lock/25544?cam=follow&t=live
```

Deep links need the host `_redirects` (Cloudflare) or `404.html` (GitHub Pages). A raw `http.server` will 404 `/lock/*` unless you open `/` and then rewrite.

## Verify

```
node scripts/verify.mjs
```

Checks prod demo lock, PWA manifests, service workers, first-paint DOM, protocol encode/parse, Radio install path, and that this tree did not grow a fake Vite app.

## Firmware flash

See `FIRMWARE.md`. The `firmware/exopace_v4/` overlay and `~/nodelink` field tree are **not** in this repo.

## SDR / ingest (not in this git tree)

`SDR_AGENT.md` is the contract: readsb `aircraft.json` on localhost:8080, AIS-catcher optional, one RTL-SDR per band, no demo/fake tracks in prod. The USB dongle lives on workstation **jessy** — not on a Cloud Agent VM; do not open `/dev/bus/usb` here.

The Python agent is `/mnt/gsdata/exopace/sdr-agent`. Public `wss://exopace.net/bridge/sensor` is **not** a Pages route yet. Until a Worker/ingest origin exists, MOC AIR/SEA/RF stay empty and must read **ERROR / OFFLINE / NO RF SAMPLES** — never invented tracks.

## What is not here

- PlotQuest / personal-dashboard / Reels / Watch
- moc Vite source, ingest/bridge Python, SDR agent source
- Deploy scripts (`/mnt/gsdata/exopace/scripts/deploy-exopace-net.sh`)
- Do not deploy Pages or Worker from this work
- Do not paste or rotate imagery tokens; owner-filled in `env.js` after deploy
