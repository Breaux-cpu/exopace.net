# Phases 30–39

Built on 2026-11-24. Production stays on real samples only. `EXOPACE_ALLOW_DEMO` was not turned on. No protected file was edited: `env.js`, `assets/index-B5yAHF7-.js`, `assets/sat-CIpmmEb5.js`, `mesh/protocol.js`, `protocol/index.js`, TerraWatch `lib/gate.ts`, and `middleware.ts`.

The maps, radio, and sentinel pages share one HTML file each, so the site work is one commit rather than ten. The Android scheduler is a second commit. This report is a later commit on Track A.

## Commits

- Track A `origin/main`: `0822979938e3b06780cbd1cc8db4ece46232b92d` (`6226078..0822979`). Author `Breaux-cpu <breauxjd@gmail.com>`.
- Track C private `origin/main`: `4ee2d1d33a1698b686c54d00f2ceb30a6061c7b8` (`236bc81..4ee2d1d`). Same author. `gradle.properties` and `gradle/gradle-daemon-jvm.properties` stayed unstaged. No keystore was committed.

## What each phase does

- Phase 30. `assets/exo-swarm.js` on `/maps/`. Vehicles need a finite SYSID, latitude, and longitude. The latest fix wins per SYSID. Sectors are quadrants of that set's centroid. A 3D conflict is raised only when both altitudes are finite and the 3D distance is inside the separation. An ADS-B alert requires a finite traffic position inside the avoid range. An empty list stays `NO VEHICLES`. The page does not invent vehicles.
- Phase 31. `assets/exo-viewshed.js` on `/maps/`. Rays are caller-supplied elevation samples. A nearer point that subtends a higher elevation angle shadows the points behind it. The same mask is tagged optical, LoRa, and VHF, and a caller can limit each band by range. No observer is `NO OBSERVER`. No samples is `NO DEM`. All-null elevations are `FLAT`. The page does not fetch DEM tiles. The host stays `NO DEM`.
- Phase 32. `assets/exo-link-qos.js` and `BackhaulScheduler.kt`. The first packet is a snapshot. An unchanged packet is `QUIET`. A later packet carries only the changed fields, packed as little-endian float32. SOS drains before alert, position, and bulk. An empty queue drains to null. The radio host stays `STANDBY`. The Android line is `BACKHAUL · STANDBY`. The scheduler is not a started service and it is not in the manifest.
- Phase 33. `functions/api/hydro.js` proxies USGS instantaneous values and NOAA water level only when `site` or `station` is a numeric id. A request with neither returns HTTP 200 `{ ok:false, status:"NO SITE" }`. Non-finite or USGS sentinels are dropped. vq `lib/hydro-correlator.ts` and `POST /api/sentinel/hydro` fuse arrays the caller already has. A vessel pairs with a gauge only when both positions are finite and inside range. Missing stage stays null. `GET` while signed in returns `NO OBSERVATIONS` and does not scrape. Unsigned callers get 401. The sentinel host stays `OFFLINE` and does not fetch on load.
- Phase 34. `assets/exo-amc.js` on `/radio/`. The worker source is the spectral-kurtosis and instantaneous amplitude, phase, and frequency classifier. It is spawned only when IQ exists and `Worker` exists. Empty IQ is `NO SAMPLES`. A short or silent buffer is `BASELINE_CALIBRATING`. A clear match is one of `AM`, `NFM`, `WFM`, `FSK`, `PSK`, `OFDM`, or `CW`. Other energy, including the locked noise fixture, is `UNKNOWN`. The host stays `NO USB DEVICE`. Page load does not open USB.
- Phase 35. `assets/exo-replay-sandbox.js` on `/sentinel/`. Playback requires `sandbox: true` and a caller clock. Otherwise the result is `LOCKED` or `NO CLOCK`. A bad archive is `NO ARCHIVE`. JSON events and a stored-method KMZ are copied. The caller's object is not mutated, and the module does not write `EXO.bus` or a live feed. The host stays `SANDBOX IDLE`. Nothing autoplays.
- Phase 36. vq `lib/rbac.ts` and `/api/auth/field-pass`. `admin` and `command` are `COMMANDER`. `operator` is `OPERATOR`. `viewer` and unknown tiers are `OBSERVER`. A field principal is `FIELD_NODE`. Only a commander can issue or revoke. A pass is `crypto.randomBytes`, stored as SHA-256, and returned in plaintext once. TTL is clamped from 1 minute to 12 hours. Verdicts are `VALID`, `EXPIRED`, `REVOKED`, and `DENIED`. No new secret was added to the container. Unsigned callers get 401. The site host stays `NO PASS` and does not fetch.
- Phase 37. `assets/exo-voice-codec2.js` packetizes short bursts as EXOpace DPCM. It is not Codec2 mode 700C. Empty audio is `NO AUDIO`. Fewer than 80 samples is `BASELINE_CALIBRATING`. A slow ramp round-trips exactly. The AudioWorklet source is a string. The page does not register it and does not call `getUserMedia`. The host stays `NO AUDIO`.
- Phase 38. `assets/exo-plume.js` on `/maps/`. A cone and a 600 second ETA exist only when the caller supplies a finite storm cell and a positive wind speed with `fromDeg`. Downwind is that direction plus 180. Missing cell is `NO OBSERVATIONS`. Missing wind is `NO WIND`. Missing elevation is terrain `FLAT`. Open-Meteo is parsed only from a payload the caller already has, and a failed payload returns null. The page does not fetch a forecast. The host stays `NO OBSERVATIONS`.
- Phase 39. `scripts/generate-sbom.mjs` writes SHA-256 rows for `assets/exo-*.js`, `functions/api`, `scripts`, and `deploy`. `env.js`, the hashed Cesium bundles, keystores, and `.env` files are excluded. `verifyManifest` returns `VERIFIED`, `MISMATCH`, or `ABSENT`. The generated manifest at build time was `VERIFIED` across 86 files. `deploy/vq-watchdog.sh` does nothing while `/api/health` is ok and mongo is ok. After three failures it runs `docker restart terrawatch` only. Below about 800MB free it runs `docker builder prune -f` only. It does not restart or remove `cams-tunnel`, `terrawatch-mongo`, or a stopped rollback.

## Verification

- `node --test` on the CI list, including `scripts/exo-wave4.test.mjs`: 45 passed, 0 failed.
- `node scripts/verify.mjs`: 362 passed, 49 failed. That is the existing baseline.
- Headless Chrome, fresh profile `exo-chrome-wave4`, `http://127.0.0.1:4181` bound to `127.0.0.1`. An earlier pass hit leftover Python listeners on port 4181 and got `net::ERR_EMPTY_RESPONSE`. That pass is not a result. The rerun had empty console errors and no horizontal overflow. CLS stayed under 0.05: maps 0.00779 / 0.02951, radio 0.00175 / 0, sentinel 0.00441 / 0, mesh 0.00999 / 0, mission 0.04758 / 0. New hosts rendered cyan `rgb(126, 224, 255)` on void `rgb(4, 7, 13)` with the idle strings above. `radio/index.html` still uses relative `../assets/` links.
- Android `:app:testDebugUnitTest` for `BackhaulSchedulerTest`: BUILD SUCCESSFUL. `assembleRelease` was not run. The emulator was not exercised.
- vq `bun test` for hydro, rbac, custody, pattern-of-life, and kinematics: 9 pass, 0 fail, 49 expect() calls.
- Next.js 15.5.27 standalone build on vq, using the image's Node 22: `BUILD_EXIT:0`. The route table includes `/api/sentinel/hydro` and `/api/auth/field-pass`.

## vq rotate

- `docker builder prune -f` reclaimed 0B before the edit. The legacy builder printed its deprecation notice.
- Backup, excluding `node_modules` and `.next`: `/home/arduino/terrawatch-pre-field-20261124T184748Z.tgz` (2.0M).
- Live image `terrawatch:field` `sha256:5c05620dc586cc18da024b707448bcf15011908603d7bfc6d93dc2df05f25975`, built `FROM terrawatch:custody` (`874d85d0cdf2`) with `DOCKER_BUILDKIT=0`. Context was 100MB and the daemon received 95.5MB.
- Container `terrawatch` is healthy. `/api/health` returned ok true and mongo true.
- Unsigned `GET /api/sentinel/hydro`, `/api/auth/field-pass`, `/api/sentinel/patterns`, and `/api/sentinel/custody` returned 401 `Sign in with Google`.
- Public `/api/sentinel/state` stayed 200, mode `public`, signedIn false, status `STANDBY`.
- The env file had 17 lines, mode 600, and was removed after start. No env value was printed.
- Stopped rollback `terrawatch-field-prev` is the previous `terrawatch:custody` container. Older stopped rollbacks were left in place.
- `cams-tunnel` and `terrawatch-mongo` were not restarted. Both were up 13 days at the swap.
- After the container was healthy, `/home/arduino/terrawatch/deploy/vq-watchdog.sh` was installed in root's crontab at `*/5` and run once. It did not restart the container.
- Free space after the thin publish was 2.1G, 97% of `/dev/mmcblk0p71`.
