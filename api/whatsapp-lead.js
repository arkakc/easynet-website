/* ============================================================
   Easynet IT Solutions — WhatsApp chat lead endpoint (Vercel)
   POST /api/whatsapp-lead
   ------------------------------------------------------------
   Called by the WhatsApp chat widget (wa-fab) the moment the
   client taps the SEND button, after name + phone have been
   collected. Appends one row to the same Google Sheet used by
   the contact form — via the Apps Script Web App — and returns
   the reference number shown to the client on WhatsApp.

   Required : name, phone
   Optional : email, company, service, message, page

   Environment variables (Vercel → Settings → Env Vars):
     SHEETS_WEBAPP_URL — Apps Script Web App URL (ends in /exec)
     SHEETS_SECRET     — must match SHARED_SECRET in Code.gs

   Response: { ok: true, ref: 12 }
             { ok: false, error: "…" }   ← widget then falls back
             to sending the full enquiry inside the WhatsApp text,
             so a lead is never lost.
   ============================================================ */
"use strict";

const SHEETS_WEBAPP_URL = (process.env.SHEETS_WEBAPP_URL || "").trim();
const SHEETS_SECRET = process.env.SHEETS_SECRET || "";
const SOURCE = "whatsapp-chat";

function sanitize(v, limit) {
  return String(v == null ? "" : v)
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, "")
    .trim()
    .slice(0, limit);
}

const PHONE_RE = /^[+\d][\d\s().-]{6,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* Google Apps Script Web Apps answer the first POST with a 302
   redirect to a one-time URL. fetch() would follow it as a GET and
   lose the payload, so we follow manually and POST the body again. */
const SHEETS_TIMEOUT_MS = 8000;
async function postToWebApp(url, body) {
  const headers = { "Content-Type": "text/plain;charset=utf-8" };
  const payload = JSON.stringify(body);

  let r = await fetch(url, {
    method: "POST",
    headers,
    body: payload,
    redirect: "manual",
    signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
  });
  const loc =
    r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
  if (loc) {
    r = await fetch(loc, {
      method: "POST",
      headers,
      body: payload,
      signal: AbortSignal.timeout(SHEETS_TIMEOUT_MS),
    });
  }
  if (!r.ok) throw new Error("Sheets web app HTTP " + r.status);

  const text = await r.text();
  let out;
  try { out = JSON.parse(text); } catch { out = null; }
  if (!out || out.ok !== true) {
    throw new Error(
      "Sheets web app error: " +
        (out && out.error ? out.error : text.slice(0, 120))
    );
  }
  return out;
}

function pagePath(req, payload) {
  const given = sanitize(payload.page, 200);
  if (given) return given;
  const ref = req && req.headers ? String(req.headers.referer || "") : "";
  return sanitize(ref ? ref.slice(ref.indexOf("/", 8)) : "/", 200);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed." });
  }

  let payload = req.body;
  if (typeof payload === "string") {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid JSON." });
  }

  // Honeypot — silently accept and drop bot submissions
  if (String(payload.company_website || "").trim()) {
    return res.status(200).json({ ok: true, ref: null });
  }

  const data = {
    name: sanitize(payload.name, 80),
    phone: sanitize(payload.phone, 25),
    email: sanitize(payload.email, 120),
    company: sanitize(payload.company, 80),
    service: sanitize(payload.service, 80),
    message: sanitize(payload.message, 2000),
  };

  // Only name + phone are compulsory in the chat — the rest may be blank.
  const missing = [];
  if (data.name.length < 2) missing.push("name");
  if (!PHONE_RE.test(data.phone)) missing.push("phone");
  if (data.email && !EMAIL_RE.test(data.email)) missing.push("email");
  if (missing.length) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing or invalid fields.", fields: missing });
  }

  if (!SHEETS_WEBAPP_URL) {
    console.error(
      "[whatsapp-lead] SHEETS_WEBAPP_URL not set — lead NOT saved to Google Sheets"
    );
    return res
      .status(503)
      .json({ ok: false, error: "storage_unavailable" });
  }

  try {
    const out = await postToWebApp(SHEETS_WEBAPP_URL, {
      secret: SHEETS_SECRET || undefined,
      source: SOURCE,
      timestamp: new Date().toISOString(),
      name: data.name,
      phone: data.phone,
      email: data.email,
      company: data.company,
      service: data.service,
      message: data.message,
      page: pagePath(req, payload),
      user_agent: sanitize(
        req.headers ? String(req.headers["user-agent"] || "") : "", 300
      ),
    });
    const ref = parseInt(out.ref != null ? out.ref : out.seq, 10);
    return res.status(200).json({ ok: true, ref: ref || null });
  } catch (err) {
    console.error("[whatsapp-lead]", err && err.message);
    return res
      .status(503)
      .json({ ok: false, error: "storage_unavailable" });
  }
};
