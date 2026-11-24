# EXOpace build report

Track A is on `main`. The site monitor workflow is still scheduled every six hours. Phases 3 and 5 are on the live `vq` container `terrawatch:correlate`. The Android voice, mule, widget, and playbook mirror are still outstanding.

## Landed

| Commit | What |
| --- | --- |
| `96ea779` | Four operator modes and the shared target bus. Pushed earlier. |
| `cece546` | Offline PMTiles vault, Terrarium DEM sampler, Fresnel cache path, remote SDR client, bearing solver, band library, playbook, room crypto, and the after-action compiler. |
| `8bb8c09` | Bridge daemon, unit tests, room and cams proxies, field-box compose file, CI gate, and this report. |

`node scripts/verify.mjs` is 362 passed, 49 failed. That is the existing baseline.

Unit tests, 15 passed:

- `scripts/exo-dem.test.mjs`
- `scripts/exo-sdr-bridge.test.mjs`
- `scripts/exo-df.test.mjs`
- `scripts/exo-playbook.test.mjs`
- `scripts/exo-room.test.mjs`

Headless Chrome, navigator forced offline, local static server:

| View | Result |
| --- | --- |
| `/maps/` 1440×900 | Stays on `/maps/`. Vault reads `NO LOCAL PMTILES · DEM CACHE SEPARATE`. The map stage reads `OFFLINE · NO LOCAL PMTILES`. No horizontal overflow. |
| `/maps/` 390×844 | Same vault and offline stage. No horizontal overflow. |
| `/mesh/` 1440×900 | Link card is present. A two-point profile returns `FLAT · GRAZE · 5.05 km · FSPL 105.7 dB · F1 20.3 m · CLR 2.0 m`. `FLAT` means no cached DEM tile was available. The page did not invent an elevation. |

## Phase notes

1. **PMTiles and DEM.** `maps/vendor/pmtiles.js` is the local library. `maps/pmvault.js` stores an imported archive in IndexedDB and copies it to OPFS when the browser allows it. With no archive and no network, the map does not start a tile storm. `assets/exo-dem.js` decodes Terrarium tiles and returns null on a cache miss. `/maps/` and `/mesh/` ask it for a Fresnel path before the elevation API.
2. **SDR bridge.** `scripts/sdr-bridge/exo_sdr_bridge.py` frames FFT, audio, and status packets. A missing bearer is rejected. `/radio/` shows `BRIDGE OFFLINE · NO RF SAMPLES` until an operator connects. Presets are 162.550, 144.390, 145.800, and 137.620 MHz. Nothing is drawn when the socket is closed.
3. **Sentinel correlation and the 24-hour DVR on `vq`.** Deployed. Source backup is `/home/arduino/terrawatch-backup-20261124T1333Z.tgz`. Image `terrawatch:correlate` (`c503ff4474bc`) is the running container. Rollback `terrawatch-correlate-prev` is stopped. `/api/health` returned `ok: true` and `mongo: true`. `sentinel_snapshots` has TTL index `expires` with `expireAfterSeconds: 86400`. A signed-out `POST /api/sentinel/correlate`, `GET /api/sentinel/history`, and `POST /api/sentinel/vision` return 401. `GET /api/sentinel/state` stays the public standby payload. Snapshots are written on a signed-in scan or history read, at most one per minute. The scrubber label is `Incident DVR`, from 24 hours ago to `LIVE`, and it says `NO SNAPSHOTS` when that window is empty. Five `bun` tests passed for the haversine attach, the weather miss, the snapshot gap, luma classes, and the two-worker cap.
4. **Android voice, mule, and widget.** Not compiled in this pass. `net.exopace.app` was not changed.
5. **Watchwall vision on `vq`.** Deployed in the same image. A tile with no frames reads `STALE`. A dead camera reads `STREAM_OFFLINE`. A stuck picture reads `FROZEN`. Luminance samples classify `CLEAR`, `LOW_LIGHT`, `FOG_HAZE`, or `FROZEN`. A missing sample is `STREAM_OFFLINE`, not a guessed clear frame. A frozen brief is stored only when the browser sends a real JPEG, and the same camera is not briefed again for ten minutes. Two vision requests may run at once. Frames are classified in memory and are not left in `/tmp`.
6. **Direction finding.** `assets/exo-df.js` intersects two real bearings and estimates a centroid only when at least two RSSI points are supplied. `assets/exo-rf-db.js` names published Region-2 allocations. A waterfall click looks up the tuned frequency and does not invent a peak.
7. **Playbooks.** `assets/exo-playbook.js` queues a matching trigger once per cooldown. It does not fire on page load.
8. **Rooms and AAR.** Room packets are AES-GCM ciphertext. The edge relay at `functions/api/room/[code].js` stores that ciphertext only. A wrong passphrase fails closed. `assets/exo-aar.js` builds the dossier, KML, and JSON from events the caller already has.
9. **Field box and CI.** `deploy/field-box/docker-compose.yml` serves the static site, a PMTiles volume, the bridge, and MongoDB. `EXOPACE_ALLOW_DEMO` is false. The token is not in the file. `.github/workflows/ci-gate.yml` runs the unit tests and accepts the verify baseline of 49 failures. `.github/workflows/site-monitor.yml` is unchanged and still runs every six hours.

## Checked on cams

Headless Chrome against `https://cams.exopace.net` after the rotate:

| View | Result |
| --- | --- |
| `/map` 1440×900 | Stays on `/map`. CLS 0. No horizontal overflow. No console errors. |
| `/map` 390×844 | Stays on `/map`. CLS 0. No horizontal overflow. No console errors. |
| `/sentinel` 1440×900 | Redirects to `/account?next=%2Fsentinel`. CLS 0. No console errors. |
| `/sentinel` 390×844 | Same sign-in redirect. CLS 0. No console errors. |

The DVR slider is in the signed-in sentinel bundle. This pass did not sign in, so the slider was not dragged.

## Not in this push

- Android `assembleDebug`, `assembleRelease`, and the `EXOpace_Pixel` audit.

## Hardware next

- Set `EXOPACE_BRIDGE_TOKEN` on `dj` or `jessy`, install `scripts/sdr-bridge/requirements.txt`, and point `rtl_tcp` at the bridge. Then paste the `ws://` URL and token into `/radio/`.
- Import a regional `.pmtiles` file from the maps vault. Until that file is cached, elevation profiles stay `FLAT`.
- Pair `EXOpace-XXXX` from the Android app after the next Android commit. Do not pair it in system Bluetooth settings.
