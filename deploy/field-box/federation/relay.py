#!/usr/bin/env python3
"""Stateless ciphertext relay. It stores nothing and it does not log bodies."""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KINDS = {"sentinel", "tle", "room"}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        return

    def _send(self, code, obj):
        raw = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.startswith("/health"):
            self._send(200, {"ok": True, "stored": False, "demo": False})
            return
        self._send(404, {"ok": False, "status": "OFFLINE"})

    def do_POST(self):
        try:
            n = int(self.headers.get("content-length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > 65536:
            self._send(400, {"ok": False, "status": "REJECTED"})
            return
        try:
            body = json.loads(self.rfile.read(n).decode())
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send(400, {"ok": False, "status": "REJECTED"})
            return
        if not isinstance(body, dict):
            self._send(400, {"ok": False, "status": "REJECTED"})
            return
        cipher = body.get("cipher")
        kind = body.get("kind")
        if kind not in KINDS or not isinstance(cipher, str) or not cipher:
            self._send(400, {"ok": False, "status": "REJECTED"})
            return
        self._send(200, {
            "ok": True,
            "stored": False,
            "kind": kind,
            "iv": body.get("iv") if isinstance(body.get("iv"), str) else "",
            "salt": body.get("salt") if isinstance(body.get("salt"), str) else "",
            "cipher": cipher,
        })


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8780), Handler).serve_forever()
