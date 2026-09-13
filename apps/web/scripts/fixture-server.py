#!/usr/bin/env python3
"""Serves a built web app plus recorded relayer responses, in ~10 MB of RAM.

For machines too small to run the relayer and headless Chromium side by side (1 CPU / 1.5 GB sandboxes):
record /api/config and /api/events once while the relayer is up, stop it, and point shoot.mjs here.
Seat state still comes live from the chain (the app reads seatStates over RPC), so screenshots reflect
whatever anvil holds; only the relayer-published metadata is frozen, and every POST answers 503. Passports
(`PUT/GET /api/passport/:address`) are kept in memory and NOT signature-checked here — that is the relayer's
job (apps/relayer/test/passport.test.ts); this only lets the vault UI round-trip a blob for a screenshot.

    curl -s http://127.0.0.1:8787/api/config > fixtures/config.json
    curl -s http://127.0.0.1:8787/api/events > fixtures/events.json
    python3 scripts/fixture-server.py            # dist-lite/ + fixtures/ on :4174
    python3 scripts/fixture-server.py --dir dist --fixtures fixtures --port 4174
"""
import argparse
import http.server
import json
import os
import posixpath
import time

parser = argparse.ArgumentParser()
parser.add_argument("--dir", default="dist-lite", help="built app to serve (SPA fallback to index.html)")
parser.add_argument("--fixtures", default="fixtures", help="directory with config.json / events.json")
parser.add_argument("--port", type=int, default=4174)
parser.add_argument("--host", default="127.0.0.1")
args = parser.parse_args()

root = os.path.abspath(args.dir)
fixtures = os.path.abspath(args.fixtures)
api = {"/api/config": "config.json", "/api/events": "events.json"}
passports = {}  # address (lowercase) → {blob, issuedAt, updatedAt}; process memory only


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=root, **kw)

    def log_message(self, fmt, *rest):  # quiet; shoot.mjs prints what matters
        pass

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path in api:
            return self.send_file(os.path.join(fixtures, api[path]), "application/json")
        if path.startswith("/api/passport/"):
            record = passports.get(path.rsplit("/", 1)[1].lower())
            if not record or record["blob"] == "":
                return self.send_json({"error": {"code": "NOT_FOUND", "message": "No passport stored"}}, 404)
            return self.send_json(record)
        if path.startswith("/api/"):
            return self.send_error(404, "not recorded")
        local = os.path.join(root, posixpath.normpath(path).lstrip("/"))
        if os.path.isfile(local):
            return super().do_GET()
        self.path = "/index.html"  # client-side routes (/e/…, /t/…, /gate/…, /me)
        return super().do_GET()

    def do_POST(self):
        self.send_error(503, "fixture server: writes need the real relayer")

    def do_PUT(self):
        path = self.path.split("?", 1)[0]
        if not path.startswith("/api/passport/"):
            return self.send_error(503, "fixture server: writes need the real relayer")
        body = json.loads(self.rfile.read(int(self.headers.get("content-length", 0)) or 0) or b"{}")
        now = int(time.time() * 1000)
        passports[path.rsplit("/", 1)[1].lower()] = {
            "blob": body.get("blob", ""),
            "issuedAt": body.get("issuedAt", now),
            "updatedAt": now,
        }
        return self.send_json({"ok": True, "updatedAt": now, "cleared": body.get("blob", "") == ""})

    def send_json(self, value, status=200):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, file, content_type):
        try:
            with open(file, "rb") as f:
                body = f.read()
        except OSError:
            return self.send_error(404, f"missing fixture {file}")
        self.send_response(200)
        self.send_header("content-type", content_type)
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)


print(f"fixture server on http://{args.host}:{args.port} · {root} · fixtures {fixtures}", flush=True)
http.server.ThreadingHTTPServer((args.host, args.port), Handler).serve_forever()
