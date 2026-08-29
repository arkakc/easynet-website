#!/usr/bin/env python3
"""
Easynet IT Solutions — Secure Static File Server
=================================================
Production-ready static server with:
  • No directory listing
  • Dotfiles (.htaccess, .git, .env…) and sensitive file types blocked
  • Full security header set (CSP, HSTS, X-Frame-Options DENY, …)
  • Cache-Control (no-cache for HTML, 7-day for assets)
  • Correct 404/403 responses

Run:  python3 server.py [port]     (default 8000, binds 0.0.0.0)
"""
import http.server
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; "
       "img-src 'self' data:; font-src 'self'; connect-src 'self'; "
       "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'")

SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=(), payment=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}

# Sensitive file types that must never be served (checked on every dot-component,
# so "nginx.conf.example" or "server.py.bak" are also blocked)
BLOCKED_NAMES = {
    "md", "sql", "bak", "log", "env", "py", "sh", "conf", "ini", "json",
    "key", "pem", "p12", "crt", "cert", "tar", "gz", "zip", "htaccess",
}


class SecureHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---- add security + cache headers to every response ----
    def end_headers(self):
        for key, value in SECURITY_HEADERS.items():
            self.send_header(key, value)
        path = self.path.split("?")[0].lstrip("/")
        is_html = (path == "" or path.endswith(".html"))
        self.send_header(
            "Cache-Control",
            "no-cache" if is_html else "public, max-age=604800",
        )
        super().end_headers()

    # ---- never list directories ----
    def list_directory(self, path):
        self.send_error(403, "Directory listing is disabled.")
        return None

    # ---- access control ----
    def send_head(self):
        abs_path = self.translate_path(self.path)
        rel = os.path.relpath(abs_path, ROOT).replace(os.sep, "/")

        # block dotfiles anywhere in the path (rel "." is the site root — allowed)
        segments = [p for p in rel.split("/") if p not in ("", ".")]
        if any(seg.startswith(".") for seg in segments):
            if rel not in (".well-known/security.txt", "well-known/security.txt"):
                self.send_error(404, "Not found.")
                return None

        # block sensitive file types on any dot-component of the filename
        name_parts = os.path.basename(abs_path).lower().split(".")
        if any(part in BLOCKED_NAMES for part in name_parts[1:]):
            self.send_error(404, "Not found.")
            return None

        if os.path.isdir(abs_path):
            index_file = os.path.join(abs_path, "index.html")
            if os.path.isfile(index_file):
                self.path = self.path.rstrip("/") + "/index.html"
            else:
                return self.list_directory(abs_path)
        return super().send_head()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


    # ---- Desktop View / Mobile View (device-optimized serving) ----
    def _current_view(self):
        """Cookie override wins; otherwise detect from User-Agent."""
        m = re.search(r"easynet_view=(mobile|desktop)", self.headers.get("Cookie", "") or "")
        if m:
            return m.group(1)
        ua = self.headers.get("User-Agent", "") or ""
        if re.search(r"Mobile|Android|iPhone|iPod|iPad|Windows Phone|BlackBerry|Opera Mini|IEMobile", ua, re.I):
            return "mobile"
        return "desktop"

    def _serve_html(self, abs_path):
        try:
            with open(abs_path, "rb") as f:
                raw = f.read()
        except OSError:
            self.send_error(404, "Not found.")
            return
        if self._current_view() == "mobile":
            # Mobile View: flag the document so CSS serves the
            # optimized mobile layout (light hero, stacked grids, lean animations)
            text = raw.decode("utf-8", "replace")
            text = text.replace('<html lang="en">', '<html lang="en" class="is-mobile">', 1)
            raw = text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        abs_path = self.translate_path(self.path)
        rel = os.path.relpath(abs_path, ROOT).replace(os.sep, "/")

        # same access control as send_head
        segments = [p for p in rel.split("/") if p not in ("", ".")]
        if any(seg.startswith(".") for seg in segments) and rel not in (
            ".well-known/security.txt", "well-known/security.txt"
        ):
            self.send_error(404, "Not found.")
            return
        name_parts = os.path.basename(abs_path).lower().split(".")
        if any(part in BLOCKED_NAMES for part in name_parts[1:]):
            self.send_error(404, "Not found.")
            return

        if os.path.isdir(abs_path):
            index_file = os.path.join(abs_path, "index.html")
            if os.path.isfile(index_file):
                self._serve_html(index_file)
                return
            self.list_directory(abs_path)
            return
        if os.path.isfile(abs_path) and abs_path.endswith(".html"):
            self._serve_html(abs_path)
            return
        super().do_GET()


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), SecureHandler) as httpd:
        print(f"Easynet secure server running on http://0.0.0.0:{PORT}")
        httpd.serve_forever()
