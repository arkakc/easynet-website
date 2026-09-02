/* ============================================================
   Easynet IT Solutions — Contact form endpoint (Vercel)
   POST /api/contact
   ------------------------------------------------------------
   • Validates + sanitizes the enquiry from public/contact.html
   • Stores it in Upstash Redis (sequence counter + lead list)
   • Emails it to CONTACT_TO via Resend with subject:
       "WEB Enquiry Sequence No. {n}"
   Environment variables (set in Vercel → Settings → Env Vars):
     UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
       (auto-added by the Upstash integration; KV_REST_API_URL /
        KV_REST_API_TOKEN also accepted)
     RESEND_API_KEY   — from resend.com
     CONTACT_TO       — default: hello.easynet@hotmail.com
     CONTACT_FROM     — default: onboarding@resend.dev
   ============================================================ */
"use strict";

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
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

async function redis(commands) {
  // Upstash REST pipeline: [["INCR","key"], ["RPUSH","key","val"], ...]
  const r = await fetch(REDIS_URL + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("Redis HTTP " + r.status);
  return r.json();
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

  // 1) Sequence number + storage (Upstash Redis)
  let seq = null;
  let stored = false;
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      const inc = await redis([["INCR", "enquiry:seq"]]);
      seq = inc && inc[0] && inc[0].result;
      const record = Object.assign(
        { sequence_no: seq, timestamp: new Date().toISOString() },
        data
      );
      await redis([["RPUSH", "enquiries", JSON.stringify(record)]]);
      stored = true;
    } catch (err) {
      console.error("[redis]", err && err.message);
    }
  }
  if (!seq) {
    // Fallback reference if storage is unavailable — enquiry still emailed
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
