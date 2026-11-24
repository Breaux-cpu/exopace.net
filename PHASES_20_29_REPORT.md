# Phases 20–29

Built on 2026-11-24. Production stays on real samples only. `EXOPACE_ALLOW_DEMO` was not turned on. No protected file was edited: `env.js`, `assets/index-B5yAHF7-.js`, `assets/sat-CIpmmEb5.js`, `mesh/protocol.js`, `protocol/index.js`, TerraWatch `lib/gate.ts`, and `middleware.ts`.

## Commits

- Track A `origin/main`: `184b06080c7620540d68d099ccd78a2e4c2fd7cb` (`eb41b56..184b060`). Author `Breaux-cpu <breauxjd@gmail.com>`.
- Track C private `origin/main`: `236bc81339be2358b4a71e7a8e7bee0e251e50b2` (`fb72d65..236bc81`). Same author. `gradle.properties` and `gradle/gradle-daemon-jvm.properties` stayed unstaged. No keystore was committed.
- This report is a later commit on Track A.

## What each phase does

- Phase 20. `assets/exo-passive-radar.js` on `/radio/`. A granted RTL-SDR with no IQ stays `BASELINE_CALIBRATING`. No device stays `NO USB DEVICE`. Empty IQ is `NO SAMPLES`. A DC block is `BASELINE_CALIBRATING` and draws no cells. The range-Doppler worker is the same file, and `spawn` returns null until there is IQ and a worker URL. Page load does not spawn it. The heatmap canvas is void `#04070d` until a real cell exists.
- Phase 21. `assets/exo-mission-planner.js` on `/maps/`. The host stays `NO POLYGON` until a caller passes a polygon or a center. Missing DEM elevation is `FLAT` with `altM: null`. A cached elevation becomes `DEM` at elevation plus the requested clearance. Export is MAVLink v2 `MISSION_ITEM_INT` (msgid 73) and a stored-zip `.kmz`. Nothing is written to a serial port.
- Phase 22. `assets/exo-acoustic-intel.js` on `/sentinel/` and `AcousticSentinelEngine.kt`. A harmonic comb at 80–400 Hz with the second and third harmonics can log a timestamp only when the caller supplies one. Silence is `NO ROTOR`. A short buffer is `BASELINE_CALIBRATING`. The page stays `NO SAMPLES`. The engine does not open the microphone.
- Phase 23. `assets/exo-custody.js` and vq `lib/custody-ledger.ts` plus `GET/POST /api/sentinel/custody`. The chain is append-only SHA-256. An empty book is `EMPTY`. A matching chain is `VERIFIED INTACT`. A changed body is `HASH MISMATCH`. Unsigned callers get 401 `Sign in with Google`. The page button verifies the empty local book and does not call the network on load.
- Phase 24. `DeadReckoningService.kt` is a pure step/heading fusion, not a started Android service. No origin or no steps is `NO FIX`, and the CEP grows with the step count. `assets/exo-astro-nav.js` computes solar and lunar azimuth. The mission host stays `NO FIX` and does not request geolocation.
- Phase 25. `assets/exo-rotator.js` frames GS-232B (`Waaa eee`) and EasyComm II. Elevation outside 0–90 or a missing look returns `LIMIT` or `NO TRACK` and no command string. The host stays `NO USB DEVICE`. Page load does not open a serial port.
- Phase 26. vq `lib/pattern-of-life.ts` and `GET /api/sentinel/patterns`. Loiter, a route jump, and an off-hours fix are computed only from positioned snapshot history. No snapshots is `NO HISTORY`. Snapshots with no positions are `QUIET`. Unsigned callers get 401. The route does not seed tracks.
- Phase 27. `assets/exo-brief-ai.js` returns a passage only when that passage is already in the supplied vault. An empty vault is `NO VAULT`. WebGPU is reported as `NO WEBGPU` when `navigator.gpu` is absent. Laya weights were not downloaded and were not placed on vq or in the Pages tree. The page does not fetch `127.0.0.1:8766` on load.
- Phase 28. `assets/exo-rf-guard.js` alarms `NOISE FLOOR` only after a 16-sample baseline and a median rise of at least 12 dB. The page stays `NO USB DEVICE`. `GnssIntegrityMonitor.kt` returns `NO FIX` or `BASELINE_CALIBRATING` with `spoof` and `jam` false until a real C/N0 baseline exists.
- Phase 29. `assets/exo-nostr-sync.js` and `deploy/field-box/federation/`. A packet without ciphertext is dropped. Latitude, passphrase, and plaintext are not copied into the relay body. No announced peer stays `STANDBY`. The relay compose keeps `EXOPACE_ALLOW_DEMO=false` and does not store `EXOPACE_BRIDGE_TOKEN`. It is not part of the default field-box compose, so it was not started.

Android `SystemScreen` shows `ACOUSTIC · NO SAMPLES`, `DR · NO FIX`, and `GNSS · BASELINE_CALIBRATING`. Those lines are the idle state. They do not start sensors.

## Verification

- `node --test` on the CI list, including `scripts/exo-wave3.test.mjs`: 36 passed, 0 failed.
- `node scripts/verify.mjs`: 362 passed, 49 failed. That is the existing baseline.
- Headless Chrome, fresh profile, `http://127.0.0.1:4181`, 1440×900 and 390×844. Console errors were empty. No horizontal overflow. CLS stayed under 0.05: radio 0.00175 / 0, maps 0.00235 / 0.02951, mesh 0.00226 / 0, sentinel 0.00441 / 0, mission 0.01630 / 0. New hosts rendered cyan `rgb(126, 224, 255)` on void `rgb(4, 7, 13)` with the idle strings above. `radio/index.html` still uses relative `../assets/` links.
- Android `:app:testDebugUnitTest` for the three new test classes: BUILD SUCCESSFUL. `assembleRelease` was not run. The emulator was not exercised.
- vq `bun test` for custody, pattern-of-life, and the existing kinematics tests: 6 pass, 0 fail, 21 expect() calls.
- Next.js 15.5.27 standalone build on vq: `BUILD_EXIT:0`. The route table includes `/api/sentinel/custody` and `/api/sentinel/patterns`.

## vq rotate

- `docker builder prune -f` reclaimed 0B before the edit.
- Backup, excluding `node_modules` and `.next`: `/home/arduino/terrawatch-pre-custody-20261124T175313Z.tgz` (2.0M).
- Live image `terrawatch:custody` `sha256:874d85d0cdf2474af67f103b5034f6840115c8daf155a879fb1e61cf5a455897`, built `FROM terrawatch:kinematics` with `DOCKER_BUILDKIT=0`.
- Container `terrawatch` is healthy. `/api/health` returned ok true and mongo true.
- Stopped rollback `terrawatch-custody-prev` is `terrawatch:kinematics`. `terrawatch-kinematics-prev` was left stopped. Nothing was removed.
- Unsigned `/api/sentinel/patterns` and `/api/sentinel/custody` returned 401 `Sign in with Google`. `/api/sentinel/state` stayed `200 public false STANDBY`.
- Env file removed after start (`ENV_GONE`). `cams-tunnel` and `terrawatch-mongo` were not restarted. Free space after the thin publish was 2.3G, 96% of `/dev/mmcblk0p71`.

## Limits

The new pages do not open a radio, a serial port, a microphone, or geolocation by themselves. A detection, a spoof alarm, a peer, a search route, or a brief appears only when the caller passes real samples, a polygon, vault text, or an announced peer. foF2, ship cones, and the earlier phase 10–19 limits are unchanged.
