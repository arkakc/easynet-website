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
  • Contact form endpoint POST /api/contact → saves each enquiry to
    your Google Sheet (google-apps-script/Code.gs) and emails it;
    falls back to data/enquiries.csv if the Sheet is not configured

Run:  python3 server.py [port]     (default 8000, binds 0.0.0.0)
"""
import csv
import http.server
import json
import os
import re
import smtplib
import sys
import threading
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from email.utils import formatdate

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# ---- Contact form / enquiry settings ----
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
ENQUIRIES_CSV = os.path.join(DATA_DIR, "enquiries.csv")
OUTBOX_DIR = os.path.join(DATA_DIR, "outbox")   # emails saved here if SMTP not configured
CSV_HEADER = ["sequence_no", "timestamp", "name", "company", "email", "phone", "service", "message"]
CSV_LOCK = threading.Lock()

CONTACT_TO = os.environ.get("CONTACT_TO", "hello.easynet@hotmail.com")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
CONTACT_FROM = os.environ.get("CONTACT_FROM", "Easynet Website <onboarding@resend.dev>")
# Google Sheets lead storage (see google-apps-script/Code.gs for setup).
# Without SHEETS_WEBAPP_URL the server falls back to data/enquiries.csv.
SHEETS_WEBAPP_URL = os.environ.get("SHEETS_WEBAPP_URL", "").strip()
SHEETS_SECRET = os.environ.get("SHEETS_SECRET", "")
SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
MAX_BODY = 16 * 1024  # 16 KB is plenty for a contact form


def _sanitize(value, limit=2000):
    value = re.sub(r"[<>]", "", str(value or ""))
    value = re.sub(r"[\u0000-\u0008\u000B-\u001F]", "", value)
    return value.strip()[:limit]


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Surfaces 3xx responses so we can re-POST manually (see sheets_post)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


# Apps Script Web Apps answer the first POST with a 302 redirect to a
# one-time URL; urllib would follow it as a GET and lose the payload,
# so we follow manually and POST the body again.
def sheets_post(url, payload, timeout=15):
    body = json.dumps(payload).encode("utf-8")
    opener = urllib.request.build_opener(_NoRedirect)
    for _ in range(5):
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={"Content-Type": "text/plain;charset=utf-8"})
        try:
            with opener.open(req, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            loc = exc.headers.get("Location") if exc.status in (301, 302, 303, 307, 308) else None
            if not loc:
                raise
            url = urllib.parse.urljoin(url, loc)
    raise RuntimeError("too many redirects from Apps Script web app")


def save_enquiry_sheets(data, user_agent=""):
    """Append the enquiry to the Google Sheet and return its sequence number.

    Raises on any failure so the caller can fall back to the local CSV.
    """
    out = sheets_post(SHEETS_WEBAPP_URL, {
        "secret": SHEETS_SECRET or None,
        "source": "website",
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "name": data.get("name", ""),
        "company": data.get("company", ""),
        "email": data.get("email", ""),
        "phone": data.get("phone", ""),
        "service": data.get("service", ""),
        "message": data.get("message", ""),
        "page": "/contact.html",
        "user_agent": _sanitize(user_agent, 300),
    })
    if not isinstance(out, dict) or not out.get("ok"):
        raise RuntimeError("Sheets web app error: %s" % (out or "empty response"))
    seq = int(out["seq"])
    if seq <= 0:
        raise RuntimeError("Sheets web app returned no sequence number")
    return seq


def save_enquiry(data):
    """Append the enquiry to data/enquiries.csv and return its sequence number.

    Fallback storage — used only when the Google Sheet is unreachable
    or SHEETS_WEBAPP_URL is not configured.
    """
    with CSV_LOCK:
        os.makedirs(DATA_DIR, exist_ok=True)
        new_file = not os.path.isfile(ENQUIRIES_CSV)
        seq = 1
        if not new_file:
            with open(ENQUIRIES_CSV, newline="", encoding="utf-8") as f:
                seq = sum(1 for _ in csv.reader(f))  # header counts as row 1 → next seq
        row = [seq,
               datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
               data.get("name", ""), data.get("company", ""), data.get("email", ""),
               data.get("phone", ""), data.get("service", ""), data.get("message", "")]
        with open(ENQUIRIES_CSV, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if new_file:
                writer.writerow(CSV_HEADER)
            writer.writerow(row)
        return seq


def build_email(seq, data):
    msg = EmailMessage()
    msg["Subject"] = "WEB Enquiry Sequence No. %s" % seq
    msg["From"] = SMTP_USER or "website@easynetsolutions.com.pg"
    msg["To"] = CONTACT_TO
    msg["Date"] = formatdate(localtime=True)
    if data.get("email"):
        msg["Reply-To"] = data["email"]
    msg.set_content(
        "New website enquiry — Easynet IT Solutions\n"
        "===========================================\n\n"
        "Sequence No.  : %s\n"
        "Name          : %s\n"
        "Company       : %s\n"
        "Email         : %s\n"
        "Phone         : %s\n"
        "Service       : %s\n\n"
        "Message:\n%s\n\n"
        "— Sent automatically from the Easynet website contact form."
        % (seq, data.get("name", "-"), data.get("company", "-") or "-",
           data.get("email", "-"), data.get("phone", "-"),
           data.get("service", "-"), data.get("message", "-"))
    )
    return msg


def send_enquiry_email(seq, data):
    """Send the enquiry email (Resend API preferred, generic SMTP as an
    alternative); if neither is configured, save it to data/outbox/."""
    # 1) Resend API (recommended — Hotmail/Outlook no longer allow password SMTP)
    if RESEND_API_KEY:
        try:
            import urllib.request
            payload = json.dumps({
                "from": CONTACT_FROM,
                "to": [CONTACT_TO],
                "reply_to": data.get("email") or None,
                "subject": "WEB Enquiry Sequence No. %s" % seq,
                "text": build_email(seq, data).get_content(),
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails", data=payload, method="POST",
                headers={"Authorization": "Bearer " + RESEND_API_KEY,
                         "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                resp.read()
            sys.stderr.write("[mail] Enquiry #%s emailed to %s via Resend\n" % (seq, CONTACT_TO))
            return
        except Exception as exc:  # noqa: BLE001 — never lose a lead over a mail error
            sys.stderr.write("[mail] Resend send failed for enquiry #%s: %s\n" % (seq, exc))
    # 2) Generic SMTP (any provider that still allows authenticated SMTP)
    msg = build_email(seq, data)
    if SMTP_HOST and SMTP_USER and SMTP_PASS:
        try:
            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
                smtp.starttls()
                smtp.login(SMTP_USER, SMTP_PASS)
                smtp.send_message(msg)
            sys.stderr.write("[mail] Enquiry #%s emailed to %s\n" % (seq, CONTACT_TO))
            return
        except Exception as exc:  # noqa: BLE001
            sys.stderr.write("[mail] SMTP send failed for enquiry #%s: %s\n" % (seq, exc))
    # Fallback: keep a copy on disk so no enquiry is ever lost
    os.makedirs(OUTBOX_DIR, exist_ok=True)
    eml_path = os.path.join(OUTBOX_DIR, "enquiry-%05d.eml" % int(seq))
    with open(eml_path, "wb") as f:
        f.write(bytes(msg))
    sys.stderr.write("[mail] Email not configured/failed — enquiry #%s saved to %s\n" % (seq, eml_path))

CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
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

    # ---- Contact form endpoint: POST /api/contact ----
    def _json_response(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.split("?")[0] != "/api/contact":
            self.send_error(404, "Not found.")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            length = 0
        if length <= 0 or length > MAX_BODY:
            self._json_response(400, {"ok": False, "error": "Invalid request body."})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
        except (ValueError, UnicodeDecodeError):
            self._json_response(400, {"ok": False, "error": "Invalid JSON."})
            return

        # honeypot — silently accept and drop bot submissions
        if str(payload.get("company_website", "")).strip():
            self._json_response(200, {"ok": True})
            return

        data = {
            "name": _sanitize(payload.get("name"), 80),
            "company": _sanitize(payload.get("company"), 80),
            "email": _sanitize(payload.get("email"), 120),
            "phone": _sanitize(payload.get("phone"), 25),
            "service": _sanitize(payload.get("service"), 80),
            "message": _sanitize(payload.get("message"), 2000),
        }
        missing = [k for k in ("name", "email", "phone", "service", "message") if not data[k]]
        if missing or not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", data["email"]):
            self._json_response(400, {"ok": False, "error": "Missing or invalid fields.", "fields": missing})
            return

        user_agent = self.headers.get("User-Agent", "") or ""
        seq = None
        stored_in = None
        if SHEETS_WEBAPP_URL:
            # Primary storage: append the row to the Google Sheet
            try:
                seq = save_enquiry_sheets(data, user_agent)
                stored_in = "google-sheets"
                sys.stderr.write("[sheets] Enquiry #%s appended to Google Sheet\n" % seq)
            except Exception as exc:  # noqa: BLE001 — fall back so no lead is lost
                sys.stderr.write("[sheets] Google Sheets save failed: %s\n" % exc)
        if seq is None:
            # Fallback: local CSV (also used when SHEETS_WEBAPP_URL is not set)
            try:
                seq = save_enquiry(data)
                stored_in = "csv"
                sys.stderr.write("[csv] Enquiry #%s appended to %s\n" % (seq, ENQUIRIES_CSV))
            except OSError as exc:
                sys.stderr.write("[csv] Failed to save enquiry: %s\n" % exc)
                self._json_response(500, {"ok": False, "error": "Could not save enquiry."})
                return

        # send the email in the background so the visitor gets an instant response
        threading.Thread(target=send_enquiry_email, args=(seq, data), daemon=True).start()
        self._json_response(200, {"ok": True, "sequence_no": seq, "storage": stored_in})


if __name__ == "__main__":
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), SecureHandler) as httpd:
        print(f"Easynet secure server running on http://0.0.0.0:{PORT}")
        httpd.serve_forever()
