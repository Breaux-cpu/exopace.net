#!/usr/bin/env python3
"""Local field-map host. Binds to 127.0.0.1 only. Not the public site."""

import json
import os
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HOST = "127.0.0.1"
PORT = int(os.environ.get("EXOPACE_MAP_PORT", "8765"))
TILE = ROOT / "maps" / "tiles" / "terrarium"
AWS = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".xml": "application/xml",
    ".txt": "text/plain; charset=utf-8",
    ".sh": "text/plain; charset=utf-8",
    ".wasm": "application/wasm",
}


def overlay_body(query):
    from urllib.parse import parse_qs, quote, urlencode
    q = parse_qs(query)
    kind = q.get("kind", [""])[0]
    try:
        s, w, n, e = (float(q.get(k, ["x"])[0]) for k in ("s", "w", "n", "e"))
    except ValueError:
        return b'{"error":"bbox","features":[]}'
    if not (s < n and w < e and s >= -90 and n <= 90 and w >= -180 and e <= 180):
        return b'{"error":"bbox","features":[]}'
    span = 0.75 if kind == "flood" else 0.45
    if n - s > span or e - w > span:
        return b'{"error":"zoom","features":[]}'
    if kind == "flood":
        geometry = f"{w},{s},{e},{n}"
        url = (
            "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query"
            "?where=1%3D1&geometry=" + quote(geometry)
            + "&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects"
            + "&outFields=FLD_ZONE,ZONE_SUBTY&returnGeometry=true&outSR=4326&f=geojson"
            + "&resultRecordCount=300&geometryPrecision=5"
        )
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=12) as res:
                data = json.loads(res.read().decode())
        except Exception:
            return b'{"error":"unavailable","features":[]}'
        if data.get("exceededTransferLimit"):
            return b'{"error":"zoom","features":[]}'
        features = []
        for row in (data.get("features") or [])[:300]:
            props = row.get("properties") or {}
            zone = str(props.get("FLD_ZONE") or "")
            geom = row.get("geometry")
            if not zone or not geom:
                continue
            features.append({
                "type": "Feature",
                "properties": {"zone": zone[:12], "subtype": str(props.get("ZONE_SUBTY") or "")[:40], "source": "FEMA NFHL"},
                "geometry": geom,
            })
        return json.dumps({"features": features, "source": "FEMA NFHL"}).encode()
    if kind not in ("ham", "leaf"):
        return b'{"error":"kind","features":[]}'
    bbox = f"({s},{w},{n},{e})"
    if kind == "ham":
        statement = f'[out:json][timeout:8];node["communication:amateur_radio"]{bbox};out body 200;'
    else:
        statement = (
            "[out:json][timeout:8];("
            f'way["natural"="wood"]["leaf_type"]{bbox};'
            f'way["landuse"="forest"]["leaf_type"]{bbox};'
            f'way["natural"="wood"]["leaf_cycle"]{bbox};'
            f'way["landuse"="forest"]["leaf_cycle"]{bbox};'
            ");out geom 200;"
        )
    payload = urlencode({"data": statement}).encode()
    elements = None
    for host in ("https://overpass.openstreetmap.fr/api/interpreter", "https://overpass.osm.ch/api/interpreter"):
        try:
            req = urllib.request.Request(
                host,
                data=payload,
                headers={"User-Agent": "exopace.net/maps (https://exopace.net/maps/)", "Accept": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=8) as res:
                elements = json.loads(res.read().decode()).get("elements") or []
            break
        except Exception:
            elements = None
    if elements is None:
        return b'{"error":"unavailable","features":[]}'
    features = []
    for el in elements[:200]:
        tags = el.get("tags") or {}
        if kind == "ham" and el.get("type") == "node":
            raw = str(tags.get("communication:amateur_radio") or "")
            call = raw if raw and raw not in ("yes", "no") else str(tags.get("callsign") or "")
            features.append({
                "type": "Feature",
                "properties": {"label": (call or "OSM amateur radio")[:32], "source": "OpenStreetMap"},
                "geometry": {"type": "Point", "coordinates": [el.get("lon"), el.get("lat")]},
            })
            continue
        ring = [[p.get("lon"), p.get("lat")] for p in (el.get("geometry") or [])]
        leaf = str(tags.get("leaf_type") or "")
        cycle = str(tags.get("leaf_cycle") or "")
        if len(ring) < 4 or not (leaf or cycle):
            continue
        if abs(ring[0][0] - ring[-1][0]) > 1e-5 or abs(ring[0][1] - ring[-1][1]) > 1e-5:
            continue
        features.append({
            "type": "Feature",
            "properties": {"leaf": leaf[:24], "cycle": cycle[:24], "source": "OpenStreetMap"},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
    return json.dumps({"features": features, "truncated": len(elements) >= 200, "source": "OpenStreetMap"}).encode()


def safe(url_path):
    rel = url_path.split("?", 1)[0]
    if rel in ("", "/"):
        rel = "/maps/"
    if ".." in rel.split("/"):
        return None
    path = (ROOT / rel.lstrip("/")).resolve()
    if path != ROOT and ROOT not in path.parents:
        return None
    return path


def tile_ok(z, x, y):
    if not (isinstance(z, int) and isinstance(x, int) and isinstance(y, int)):
        return False
    if z < 0 or z > 15 or x < 0 or y < 0:
        return False
    return x < 2**z and y < 2**z


def fetch_tile(z, x, y):
    dest = TILE / str(z) / str(x) / f"{y}.png"
    if dest.is_file() and dest.stat().st_size > 80:
        return dest.read_bytes()
    req = urllib.request.Request(AWS.format(z=z, x=x, y=y), headers={"User-Agent": "exopace.net"})
    with urllib.request.urlopen(req, timeout=30) as res:
        data = res.read()
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
    return data


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/maps":
            self.send_response(302)
            self.send_header("location", "/maps/")
            self.end_headers()
            return
        if path == "/maps/host.json":
            body = b'{"offlineHost": true}\n'
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/geocode":
            from urllib.parse import parse_qs, quote
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            text = parse_qs(query).get("q", [""])[0].strip()
            if len(text) < 2 or len(text) > 80:
                body = b"[]"
            else:
                req = urllib.request.Request(
                    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=" + quote(text),
                    headers={"User-Agent": "exopace.net/maps (https://exopace.net/maps/)", "Accept": "application/json"},
                )
                try:
                    with urllib.request.urlopen(req, timeout=8) as res:
                        rows = json.loads(res.read().decode())
                except Exception:
                    rows = []
                out = []
                for row in rows[:5] if isinstance(rows, list) else []:
                    try:
                        lat = float(row.get("lat"))
                        lon = float(row.get("lon"))
                    except (TypeError, ValueError):
                        continue
                    if abs(lat) > 90 or abs(lon) > 180:
                        continue
                    out.append({"lat": lat, "lon": lon, "label": str(row.get("display_name") or "")[:140]})
                body = json.dumps(out).encode()
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/overlay":
            body = overlay_body(self.path.split("?", 1)[1] if "?" in self.path else "")
            self.send_response(200)
            self.send_header("content-type", "application/json")
            self.send_header("content-length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        parts = path.strip("/").split("/")
        if len(parts) == 5 and parts[0] == "api" and parts[1] == "terrain":
            try:
                z, x, y = (int(parts[2]), int(parts[3]), int(parts[4]))
            except ValueError:
                self.send_error(400)
                return
            if not tile_ok(z, x, y):
                self.send_error(400)
                return
            try:
                data = fetch_tile(z, x, y)
            except Exception:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("content-type", "image/png")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        file_path = safe(path)
        if file_path is None:
            self.send_error(404)
            return
        if file_path.is_dir():
            file_path = file_path / "index.html"
        if not file_path.is_file():
            self.send_error(404)
            return
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("content-type", TYPES.get(file_path.suffix, "application/octet-stream"))
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/prefetch":
            self.send_error(404)
            return
        length = int(self.headers.get("content-length", "0"))
        if length <= 0 or length > 200000:
            self.send_error(400)
            return
        try:
            payload = json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            self.send_error(400)
            return
        tiles = payload.get("tiles") if isinstance(payload, dict) else None
        if not isinstance(tiles, list) or len(tiles) > 800:
            self.send_error(400)
            return
        saved = 0
        failed = 0
        for tile in tiles:
            if not isinstance(tile, dict):
                failed += 1
                continue
            z, x, y = tile.get("z"), tile.get("x"), tile.get("y")
            if not tile_ok(z, x, y):
                failed += 1
                continue
            try:
                fetch_tile(z, x, y)
                saved += 1
            except Exception:
                failed += 1
        body = json.dumps({"saved": saved, "failed": failed}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    os.makedirs(TILE, exist_ok=True)
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Field maps at http://{HOST}:{PORT}/maps/")
    print("This listener is local. It is not exopace.net.")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
