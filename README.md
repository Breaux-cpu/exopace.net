# EXOpace

One brand. Two surfaces. One protocol.

| Surface | URL | What |
|---------|-----|------|
| **MOC** | https://exopace.net | Planetary / orbital mission control |
| **Radio** | https://exopace.net/radio/ | Installable field radio PWA |
| **Firmware** | `firmware/FIRMWARE.md` | Heltec V4 contract |

Host: **https://exopace.net**  
Wordmark: **EXOpace**  
Palette: void / cyan / amber. Not purple SaaS. Not Inter.

## Install Radio

- Chrome / Edge → **INSTALL APP**
- iPhone Safari → Share → Add to Home Screen
- **CONNECT → Bluetooth → `EXOpace-XXXX`**
- Do **not** pair in Android Settings
- Wi-Fi fallback: join `EXOpace-XXXX` / `nodelink` → http://192.168.4.1

Demo mode always paints Earth + a Memphis-area mesh. No hardware required.

## Quality tiers (MOC)

`ULTRA | HIGH | MED | PERF` — auto-detect, persisted, override in the HUD.

- **ULTRA** — title-card stills: full Rayleigh+Mie, clouds, bloom, milky way
- **PERF** — mid Android / thermal: fewer stars, no clouds, no bloom

`/` opens the command palette: `lock ISS`, `layer aircraft`, `run cinematic`, `quality PERF`.

Time: **LIVE · HOLD · 10× · 60×**. Deep link: `/lock/25544?cam=follow&t=live`.

Offline: synthetic fleet still fills the globe.

## Protocol

Shared JSON in `protocol/`. Existing types unchanged. New: `sos`, `way`, `track`, `rf`, `presence`, `time`.

BLE: Nordic UART `6e400001/002/003`, namePrefix `EXOpace`.  
No Meshtastic lock-in.

## Deploy (Cloudflare Pages)

```
/mnt/gsdata/exopace/scripts/deploy-exopace-net.sh
```

Keeps `/radio`. Serves `FIRMWARE.md` and textures as real files (not the SPA).

## Firmware flash

See `firmware/FIRMWARE.md`. Overlay lives in `firmware/exopace_v4/`. Field tree: `~/nodelink`.

## Dev

```
cd /mnt/gsdata/exopace/moc
npm install
npm run dev
# Radio is static — open radio/index.html or serve radio/
```
