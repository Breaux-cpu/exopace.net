#!/bin/bash
# Download the field-map app and a world elevation copy into ~/exopace-maps.
# The public site does not use this directory.
set -euo pipefail
ROOT="${HOME}/exopace-maps"
SITE="${EXOPACE_SITE:-https://exopace.net}"
FILES=(
  maps/index.html
  maps/maps.css
  maps/legend.html
  maps/host.json
  maps/mgrs.js
  maps/sheets.js
  maps/terrain.js
  maps/style.js
  maps/print.js
  maps/atak.js
  maps/search.js
  maps/garmin.js
  maps/app.js
  maps/sw.js
  maps/manifest.webmanifest
  maps/vendor/maplibre-gl.js
  maps/vendor/maplibre-gl.css
  maps/vendor/LICENSE.maplibre.txt
  maps/atak/usgs-imagery-topo.xml
  maps/atak/world-imagery.xml
  maps/atak/world-hillshade.xml
  maps/atak/SETUP.txt
  maps/offline/server.py
  maps/offline/fetch_world.py
  maps/offline/pull.sh
  icon.svg
  icon-192.png
)
mkdir -p "$ROOT"
for f in "${FILES[@]}"; do
  mkdir -p "$ROOT/$(dirname "$f")"
  if curl -fsSL "$SITE/$f" -o "$ROOT/$f"; then
    continue
  fi
  case "$f" in
    maps/vendor/maplibre-gl.js)
      curl -fsSL "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js" -o "$ROOT/$f" ;;
    maps/vendor/maplibre-gl.css)
      curl -fsSL "https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css" -o "$ROOT/$f" ;;
    *)
      echo "missing $f" >&2
      exit 1 ;;
  esac
done
chmod +x "$ROOT/maps/offline/pull.sh" "$ROOT/maps/offline/server.py" "$ROOT/maps/offline/fetch_world.py"
python3 "$ROOT/maps/offline/fetch_world.py"
echo "Open the copy with: python3 $ROOT/maps/offline/server.py"
echo "The server prints its URL. The default port is 8765, on this machine only."
echo "If 8765 is taken, start it with EXOPACE_MAP_PORT set to a free port."
