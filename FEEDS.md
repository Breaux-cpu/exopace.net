# EXOpace FEEDS

Public edge is static Pages (`exopace.net`). Live COP at `:8200` is a separate sessioned API.

## Sources (GATE A)

| Feed | Live attempt | Key | Fallback |
|------|----------------|-----|----------|
| TLE / GP | CelesTrak `stations` `visual` `weather` | no | CACHED → SYNTHETIC fleet |
| AIR | OpenSky CONUS bbox (no key) | no | CACHED → SYNTHETIC routes |
| SEA | Optional `exopace-bridge` COP `/ships` | no on Pages | CACHED → SYNTHETIC hulls |
| IMAGERY | ArcGIS World Imagery + CARTO (no key) | no | blue-marble + **IMAGERY LIMITED** |
| MESH | Demo Memphis mesh | n/a | always MESH |

`key` in the FEEDS panel is **yes / no / bridge** — never a secret.

## Provenance badges (honest)

FEEDS debug for imagery / sats / air / sea is **only** `LIVE | CACHED | SYNTHETIC`.

| Badge | Means what’s on the globe |
|-------|---------------------------|
| LIVE | This session fetched remote data and that data is displayed |
| CACHED | Displaying a prior remote pull from localStorage |
| SYNTHETIC | Bundled or generated (blue marble, synth fleet, synth tracks) |

OpenSky `Access-Control-Allow-Origin` is `opensky-network.org` only. Browser on `exopace.net` **cannot** be AIR LIVE. Badge is SYNTHETIC (or CACHED if a prior proxy write exists). Do not claim otherwise.

Default imagery is shipped blue marble → **SYNTHETIC**. Switching SATELLITE/STREETS/HYBRID/DARK and getting tiles → **LIVE**. Tile fail → SYNTHETIC + IMAGERY LIMITED.

## Operator actions

- **RETRY** — refetch TLE + air + sea
- **EXPORT DIAG** — JSON with statuses, CORS, counts. No tokens.
- Imagery: SATELLITE · STREETS · HYBRID · DARK

## Cold start (A1)

1. UI chrome + synthetic sats/air/sea immediately (never infinite zeros)
2. CACHED TLE if present
3. Live fetch ≤15s → LIVE or stay SYNTHETIC/CACHED

## Bridge (optional)

```
localStorage.setItem('exopace-bridge', 'http://127.0.0.1:8200')
```

Requires a viewer session cookie. Unsigned public Pages will not see COP keys.

## Legal

OpenSky / OSM / Esri / CARTO tiles are used as published. AIS live needs an operator key on the COP, not in the client.
