/* ============================================================
   Easynet IT Solutions — Contact form endpoint (Vercel)
   POST /api/contact
   ------------------------------------------------------------
   • Validates + sanitizes the enquiry from public/contact.html
   • Saves it as a row in a Google Sheet (via an Apps Script
     Web App — see google-apps-script/Code.gs for the 3-minute
     setup) and assigns the next sequence number from the Sheet
   • Emails it to CONTACT_TO via Resend with subject:
       "WEB Enquiry Sequence No. {n}"
   Environment variables (set in Vercel → Settings → Env Vars):
     SHEETS_WEBAPP_URL — Apps Script Web App URL (ends in /exec)
     SHEETS_SECRET     — must match SHARED_SECRET in Code.gs
     RESEND_API_KEY    — from resend.com
     CONTACT_TO        — default: hello.easynet@hotmail.com
     CONTACT_FROM      — default: onboarding@resend.dev
   ============================================================ */
"use strict";

const SHEETS_WEBAPP_URL = (process.env.SHEETS_WEBAPP_URL || "").trim();
const SHEETS_SECRET = process.env.SHEETS_SECRET || "";
const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const CONTACT_TO = process.env.CONTACT_TO || "hello.easynet@hotmail.com";
const CONTACT_FROM =
  process.env.CONTACT_FROM || "Easynet Website <onboarding@resend.dev>";

function sanitize(v, limit) {
  return String(v == null ? "" : v)
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, "")
    .trim()
    .slice(0, limit);
}

/* Google Apps Script Web Apps answer the first POST with a 302
   redirect to a one-time URL. fetch() would follow it as a GET and
   lose the payload, so we follow manually and POST the body again. */
async function postToWebApp(url, body) {
  const headers = { "Content-Type": "text/plain;charset=utf-8" };
  const payload = JSON.stringify(body);

  let r = await fetch(url, {
    method: "POST",
    headers,
    body: payload,
    redirect: "manual",
  });
  const loc =
    r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
  if (loc) {
    r = await fetch(loc, { method: "POST", headers, body: payload });
  }
  if (!r.ok) throw new Error("Sheets web app HTTP " + r.status);

  const text = await r.text();
  let out;
  try { out = JSON.parse(text); } catch { out = null; }
  if (!out || out.ok !== true) {
    throw new Error("Sheets web app error: " + (out && out.error ? out.error : text.slice(0, 120)));
  }
  return out;
}

/* Save the enquiry to the Google Sheet; returns its sequence number. */
async function saveToSheets(data, req) {
  const ref = req && req.headers ? String(req.headers.referer || "") : "";
  const ua = req && req.headers ? String(req.headers["user-agent"] || "") : "";
  const out = await postToWebApp(SHEETS_WEBAPP_URL, {
    secret: SHEETS_SECRET || undefined,
    source: "website",
    timestamp: new Date().toISOString(),
    name: data.name,
    company: data.company,
    email: data.email,
    phone: data.phone,
    service: data.service,
    message: data.message,
    page: sanitize(ref ? ref.slice(ref.indexOf("/", 8)) : "/contact.html", 200),
    user_agent: sanitize(ua, 300),
  });
  const seq = parseInt(out.seq, 10);
  if (!seq) throw new Error("Sheets web app returned no sequence number");
  return seq;
}

async function sendEmail(seq, data) {
  const subject = "WEB Enquiry Sequence No. " + seq;
  const text =
    "New website enquiry — Easynet IT Solutions\n" +
    "===========================================\n\n" +
    "Sequence No.  : " + seq + "\n" +
    "Name          : " + (data.name || "-") + "\n" +
    "Company       : " + (data.company || "-") + "\n" +
    "Email         : " + (data.email || "-") + "\n" +
    "Phone         : " + (data.phone || "-") + "\n" +
    "Service       : " + (data.service || "-") + "\n\n" +
    "Message:\n" + (data.message || "-") + "\n\n" +
    "— Sent automatically from the Easynet website contact form.";
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + RESEND_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: CONTACT_FROM,
      to: [CONTACT_TO],
      reply_to: data.email || undefined,
      subject,
      text,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error("Resend HTTP " + r.status + " " + body.slice(0, 300));
  }
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
    return res.status(200).json({ ok: true });
  }

  const data = {
    name: sanitize(payload.name, 80),
    company: sanitize(payload.company, 80),
    email: sanitize(payload.email, 120),
    phone: sanitize(payload.phone, 25),
    service: sanitize(payload.service, 80),
    message: sanitize(payload.message, 2000),
  };
  const missing = ["name", "email", "phone", "service", "message"].filter(
    (k) => !data[k]
  );
  if (missing.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    return res
      .status(400)
      .json({ ok: false, error: "Missing or invalid fields.", fields: missing });
  }

  // 1) Save to the Google Sheet (sequence number comes from the Sheet)
  let seq = null;
  let stored = false;
  if (SHEETS_WEBAPP_URL) {
    try {
      seq = await saveToSheets(data, req);
      stored = true;
    } catch (err) {
      console.error("[sheets]", err && err.message);
    }
  } else {
    console.error(
      "[sheets] SHEETS_WEBAPP_URL not set — enquiry not saved to Google Sheets"
    );
  }
  if (!seq) {
    // Fallback reference if the Sheet is unavailable — enquiry still emailed
    seq = "T" + Date.now().toString().slice(-8);
  }

  // 2) Email via Resend
  let emailed = false;
  if (RESEND_API_KEY) {
    try {
      await sendEmail(seq, data);
      emailed = true;
    } catch (err) {
      console.error("[resend]", err && err.message);
    }
  } else {
    console.error("[resend] RESEND_API_KEY not set — email skipped");
  }

  if (!stored && !emailed) {
    return res
      .status(500)
      .json({ ok: false, error: "Could not save or send the enquiry." });
  }
  return res.status(200).json({ ok: true, sequence_no: seq });
};
