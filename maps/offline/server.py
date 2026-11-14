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
}


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
