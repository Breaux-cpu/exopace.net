# Phase 1 API

Routes: GET /v1/health and GET /v1/satellites/{noradId}.

The catalog is tle/stations.txt, tle/visual.txt, and tle/weather.txt. The first NORAD wins. An unknown NORAD is HTTP 404 with code NOT_FOUND. No satellite is invented.

Deploy with the existing Cloudflare Pages project. Do not add a root package.json. Do not point scripts/monitor-exopace.mjs at /v1/health until this deploy is live.

Check after deploy:

```
node scripts/monitor-v1.mjs
```

Against a deployed origin, when one exists:

```
curl -sS https://exopace.net/v1/health
curl -sS https://exopace.net/v1/satellites/25544
```

## Rollback

1. In Cloudflare Pages, open the exopace.net project and roll back production to the previous deployment.
2. Leave DECIDE_URL empty.
3. Do not add a root package.json.
4. The two routes leave with that deployment. Confirm the previous build is the one serving the apex.

verify.release stays BLOCKED.
