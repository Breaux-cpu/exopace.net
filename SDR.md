# EXOpace SDR sensor surface

The Memphis ground sensor (**dj**, Tailnet `100.64.185.111`) is the operator-owned
RTL-SDR receiver that feeds EXOpace's RF/telemetry picture. One dongle, many
decoders. No demo signal, no synthetic tracks — RF contents are real reception
or explicit **NO RF SAMPLES**.

**Phone / tablet control:** the reader is a web app (Tailnet only): `http://dj:8110`
(`sdr-web`) — tap-to-listen, live waterfall, scanner presets, squelch capture,
widescan, and live position maps. The web token is operator-held, never in this
repo.

## Decoder matrix (verified)

| Mode | Signal | Decoder | Output |
|------|--------|---------|--------|
| ADS-B | 1090 MHz aircraft | `readsb` | aircraft.json → AIR positions |
| AIS | 161.975/162.025 MHz ships | `rtl_ais` | AIVDM → SEA positions |
| APRS | 144.39 MHz packet | `direwolf` | callsign lat/lon → map |
| POCSAG/FLEX | 152 MHz pagers | `multimon-ng` | alpha pager pages |
| ISM / TPMS / weather | 433.92 MHz | `rtl_433` | sensor telemetry, events |
| Meteor-M2 LRPT | 137.9/137.1 MHz | `satdump` | live LRPT passes → imagery |
| NOAA APT | 137.x MHz | `satdump` | APT imagery (legacy) |
| ISS SSTV | 437.55 MHz Robot 36 | `sstv` (python) | decoded SSTV images |
| ACARS | 131.55 MHz airline VDL | `acarsdec` (+libacars 2.2.1) | air/ground datalink messages |
| Radiosonde RS41 | 401.5 MHz weather balloon | `rs41mod --json` | id/lat/lon/alt frames → map |
| P25 | 859.9375 MHz Memphis Fire/EMS | `dsd-neo` | trunk-follow voice → phone audio stream |
| C4FM / YSF | 444.4 MHz Fusion | `dsd-neo -fy` | digital voice → phone audio stream |
| DMR | 442.4375 MHz TDMA | `dsd-neo -fs` | digital voice → phone audio stream |
| NXDN96 | 444.9375 MHz | `dsd-neo -fn` | digital voice → phone audio stream |
| D-STAR | 444.9875 MHz | `dsd-neo -fd` | digital voice → phone audio stream |
| M17 | 441.45 MHz | `dsd-neo -fz` | open digital voice → phone audio stream |
| WSPR | 28.1261 MHz | `wsprd` | weak-signal QRP reports |
| FT8 | 144.174 MHz | `rtl-ft8` (graceful absent) | decode attempt, no hard fail |
| RDS | broadcast FM | `redsea` | station/program metadata |
| Wideband sweep | 24–1700 MHz | `rtl_power` | power/SNR grid + peak detection |
| raw IQ | any band | `rtl_tcp` | remote SDR for any client |

## Position layers

The phone UI plots live markers for **ADS-B**, **AIS**, **APRS**, and **RS41
radiosondes** on a Leaflet map; satellite passes record imagery under
`~/sdr-captures/` and SSTV pictures under `~/sdr-captures/sstv/`. Widescan
returns peak frequency/dB via `GET /api/widescan`; the digital-voice decoders
(P25/YSF/DMR/NXDN/D-STAR/M17) fan their decoded audio to the phone over
`/stream`.

### Native pass prediction

`GET /api/passes` predicts upcoming **Meteor-M2-4 / M2-3 LRPT** and **ISS SSTV**
passes for the Millington station on the board itself: `python3-sgp4` propagates
the elements and az/el, AOS/LOS, max elevation and duration are interpolated at
15 s. TLEs are merged from a Celestrak refresh (`weather` + `stations`, written to
`~/.config/sdr-monitor/tle.txt` every 6 h), satdump's cache and the committed
snapshots, keeping the newest epoch per satellite. The phone card lists the next
24 h and loads a pass's decoder; setting `SDR_AUTOSAT` (e.g. `1` or `meteor,iss`)
starts a pass automatically at AOS without preempting a live stream or job.
Validated against the independent WhereTheISS ephemeris — the sub-satellite point
matched to 0.001° once current elements were used.

### Optional SondeHub federation

RS41 telemetry is tracked **locally by default**. Setting the `SONDEHUB_AMATEUR`
env var to the operator's callsign makes `sdr-web` also publish decoded frames to
SondeHub's v2 amateur telemetry API (`https://api.v2.sondehub.org/amateur/telemetry`,
throttled to one upload per sonde per 20 s). Leave it unset for a purely local
sensor; the uploader is off unless explicitly configured.

## Sub-sensors on the same box

- `sdr-ble` — Bluetooth observer (Remote ID drones, surveillance gear, trackers)
- `sdr-wifi-scan` / `sdr-wifi-pull` — Wi-Fi AP census over iw + jessy vantage
- `sdr-transcribe` — offline STT (Vosk) + whisper.cpp HQ pass over radio clips

## Lawful use

The operator is responsible for authorized reception only. Digital data links
(ACARS, pagers, telemetry) are machine-readable metadata; this surface does not
decode private voice/comms beyond the operator's permitted trunked copy.

## MOC / Radio

MOC AIR/SEA/RF layers and the ingest contract are described in `SDR_AGENT.md`
and `FEEDS.md`.