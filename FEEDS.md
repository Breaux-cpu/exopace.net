# EXOpace FEEDS (production)

`EXOPACE_ENV=prod` on the shipped site. Demo / invented catalogs are **off**.

## Env (deploy / ingest)

| Var | Where | Purpose |
|-----|--------|---------|
| `EXOPACE_ENV` | `env.js` / systemd | `prod` locks Demo |
| `EXOPACE_TLE_URLS` | `env.js` | CelesTrak GP groups |
| `EXOPACE_BRIDGE` | `env.js` | ingest origin, e.g. `http://127.0.0.1:8210` |
| `EXOPACE_INGEST_HOST` | ingest | default `127.0.0.1` |
| `EXOPACE_INGEST_PORT` | ingest | `8210` |
| `EXOPACE_DATA` | ingest | `/mnt/gsdata/exopace-data` |
| `EXOPACE_CORS` | ingest | `https://exopace.net` |
| `EXOPACE_DEVICE_TOKEN` | Radio / SDR agent | minted; **never in git** |

## Sources

| Feed | Live | On failure |
|------|------|------------|
| TLE | CelesTrak `access-control-allow-origin: *` | **CACHED** last successful pull, else **ERROR** (empty globe, not fake sats) |
| IMAGERY | ArcGIS / CARTO tiles (no key) | shipped Blue Marble (real Earth albedo) + IMAGERY LIMITED |
| AIR | OpenSky — CORS **not** open to this origin | **ERROR**, layer empty |
| SEA | ingest/bridge AIS only | **ERROR**, layer empty |
| RF | `GET {BRIDGE}/rf/grid` | **NO RF SAMPLES** |

## Run ingest

```
python3 /mnt/gsdata/exopace/bridge/ingest_server.py
python3 /mnt/gsdata/exopace/bridge/token_tool.py mint radio1
# POST /ingest  Authorization: Bearer exo_…
# GET  /rf/grid  /rf/samples  /rf/deadzones  /rf/export.csv  /rf/export.geojson
```

No placeholder API keys in the repo.
