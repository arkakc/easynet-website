#!/usr/bin/env node
/* ============================================================
   Easynet IT Solutions — WhatsApp Cloud API Lead Server
   Zero-dependency Node.js server (Node 18+)
   ------------------------------------------------------------
   • Verifies the Meta webhook (GET /webhook)
   • Receives WhatsApp messages (POST /webhook)
   • Parses the structured lead format from the website widget
     (or plain text enquiries)
   • Stores every lead → Google Sheet (primary, when configured)
     or leads/leads.csv + leads/leads.jsonl (offline fallback);
     leads/leads.jsonl is always kept so GET /leads keeps working
   • Sends an automatic thank-you reply via the WhatsApp API
   • GET /leads  — view captured leads (token protected)

   Run:
     WHATSAPP_VERIFY_TOKEN=my-secret PORT=3000 node server.js
   (Token/Phone-ID are optional locally — auto-reply is skipped
    until you supply a real WHATSAPP_TOKEN.)
   ============================================================ */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "easynet-verify-2026";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || "";
const GRAPH_URL = "https://graph.facebook.com/v20.0";
const LEADS_DIR = path.join(__dirname, "leads");
const LEADS_CSV = path.join(LEADS_DIR, "leads.csv");
const LEADS_JSONL = path.join(LEADS_DIR, "leads.jsonl");
const LEADS_TOKEN = process.env.LEADS_ACCESS_TOKEN || "";
// Google Sheets lead storage (see ../google-apps-script/Code.gs for setup).
// Without SHEETS_WEBAPP_URL leads fall back to leads/leads.csv.
const SHEETS_WEBAPP_URL = (process.env.SHEETS_WEBAPP_URL || "").trim();
const SHEETS_SECRET = process.env.SHEETS_SECRET || "";

const AUTO_REPLY =
  "✅ Thank you for contacting Easynet IT Solutions!\n\n" +
  "We've received your details and our team will respond within 1 business day (Mon–Fri, 8:30 AM – 5:00 PM).\n\n" +
  "For anything urgent, visit: https://easynetpng.com";

/* ---------- storage ---------- */

/* Google Apps Script Web Apps answer the first POST with a 302
   redirect to a one-time URL; fetch() would follow it as a GET and
   lose the payload, so we follow manually and POST the body again. */
async function postToWebApp(url, body) {
  const headers = { "Content-Type": "text/plain;charset=utf-8" };
  const payload = JSON.stringify(body);
  let r = await fetch(url, { method: "POST", headers, body: payload, redirect: "manual" });
  const loc = r.status >= 300 && r.status < 400 ? r.headers.get("location") : null;
  if (loc) r = await fetch(loc, { method: "POST", headers, body: payload });
  if (!r.ok) throw new Error("Sheets web app HTTP " + r.status);
  const out = await r.json().catch(() => null);
  if (!out || out.ok !== true) throw new Error("Sheets web app error: " + JSON.stringify(out));
  return out;
}

/* Append a lead to the Google Sheet (fire-and-forget — the Meta
   webhook must be acknowledged within seconds, so we never block). */
function saveLeadToSheets(lead) {
  postToWebApp(SHEETS_WEBAPP_URL, {
    secret: SHEETS_SECRET || undefined,
    source: "whatsapp",
    timestamp: lead.timestamp,
    name: lead.name || "",
    company: lead.company || "",
    email: lead.email || "",
    phone: lead.phone || "",
    service: lead.service || "",
    message: lead.message || "",
    raw: (lead.raw || "").slice(0, 4000),
  })
    .then(out => console.log(`[sheets] lead ${lead.id} appended (seq ${out.seq})`))
    .catch(err => {
      console.error("[sheets] Google Sheets save failed, falling back to CSV:", err.message);
      appendLeadFiles(lead); // don't lose the lead
    });
}

function ensureStore() {
  if (!fs.existsSync(LEADS_DIR)) fs.mkdirSync(LEADS_DIR);
}
function csvSafe(v) {
  v = String(v == null ? "" : v);
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}
function appendLeadFiles(lead) {
  ensureStore();
  if (!fs.existsSync(LEADS_CSV)) fs.writeFileSync(LEADS_CSV, "id,timestamp,name,phone,email,company,service,message,raw\n");
  fs.appendFileSync(LEADS_CSV,
    [lead.id, lead.timestamp, lead.name, lead.phone, lead.email, lead.company, lead.service, lead.message, lead.raw]
      .map(csvSafe).join(",") + "\n");
}
function saveLead(lead) {
  lead.id = crypto.randomBytes(6).toString("hex").toUpperCase();
  lead.timestamp = new Date().toISOString();
  // Google Sheet is the primary store; CSV is only written when the
  // Sheet is not configured (or as an emergency fallback on failure).
  if (SHEETS_WEBAPP_URL) {
    saveLeadToSheets(lead);
  } else {
    appendLeadFiles(lead);
  }
  // JSONL mirror — powers GET /leads
  ensureStore();
  fs.appendFileSync(LEADS_JSONL, JSON.stringify(lead) + "\n");
  return lead;
}

/* ---------- parse structured lead text from the website widget ---------- */
/* format:
   📋 *New Enquiry — Easynet IT Solutions*
   👤 Name: ...
   📞 Phone: ...
   ✉️ Email: ...
   🏢 Company: ...
   🛠 Service: ...
   💬 Message: ...                                   */
function parseLeadText(text) {
  const pick = (label) => {
    const m = text.match(new RegExp(label + ":(.*)"));
    return m ? m[1].trim() : "";
  };
  return {
    name: pick("👤 Name"),
    phone: pick("📞 Phone"),
    email: pick("✉️ Email"),
    company: pick("🏢 Company"),
    service: pick("🛠 Service"),
    message: pick("💬 Message"),
    raw: text
  };
}

/* ---------- send automatic reply (real API or simulated) ---------- */
function sendAutoReply(from) {
  if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
    console.log("[auto-reply: simulated]", from);
    return;
  }
  const payload = {
    messaging_product: "whatsapp",
    to: from,
    type: "text",
    text: { preview_url: false, body: AUTO_REPLY }
  };
  fetch(`${GRAPH_URL}/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }).then(r => r.json()).then(d => console.log("[auto-reply sent]", d.messages ? d.messages[0].id : JSON.stringify(d)))
    .catch(e => console.error("[auto-reply error]", e.message));
}

/* ---------- helpers ---------- */
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cache-Control": "no-store"
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => { data += c; if (data.length > 1e6) { reject(new Error("payload too large")); req.destroy(); } });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
function checkSignature(req, rawBody) {
  if (!process.env.WHATSAPP_WEBHOOK_SECRET) return true; // signature check optional locally
  const sig = req.headers["x-hub-signature-256"];
  if (!sig) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", process.env.WHATSAPP_WEBHOOK_SECRET).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

/* ---------- server ---------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  /* webhook verification handshake (Meta calls this with ?hub.mode=subscribe) */
  if (req.method === "GET" && url.pathname === "/webhook") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(challenge);
      console.log("[webhook verified]");
    } else {
      sendJson(res, 403, { error: "forbidden" });
    }
    return;
  }

  /* incoming WhatsApp events */
  if (req.method === "POST" && url.pathname === "/webhook") {
    const raw = await readBody(req).catch(() => "");
    if (!checkSignature(req, raw)) return sendJson(res, 401, { error: "bad signature" });

    let evt;
    try { evt = JSON.parse(raw); } catch { return sendJson(res, 400, { error: "bad json" }); }

    const entry = (evt.entry || [])[0];
    const change = entry && entry.changes && entry.changes[0];
    const msg = change && change.value && change.value.messages && change.value.messages[0];
    const from = change && change.value && change.value.metadata && change.value.metadata.phone_number_id
      ? (change.value.contacts && change.value.contacts[0] && change.value.contacts[0].phone_jid)
      : "";

    if (msg && msg.type === "text" && from) {
      const text = (msg.text && msg.text.body) || "";
      const lead = text.includes("New Enquiry — Easynet")
        ? parseLeadText(text)
        : { name: "", phone: from.split("@")[0], email: "", company: "", service: "General enquiry", message: text, raw: text };
      const saved = saveLead(lead);
      console.log(`[lead ${saved.id}] ${saved.name || "?"} <${saved.phone || from}> — ${saved.service}`);
      sendAutoReply(from);
    }
    /* always ack fast (Meta expects 200 within seconds) */
    return sendJson(res, 200, { challenge: "ACK" });
  }

  /* view captured leads */
  if (req.method === "GET" && url.pathname === "/leads") {
    if (LEADS_TOKEN && url.searchParams.get("token") !== LEADS_TOKEN) {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    if (!fs.existsSync(LEADS_JSONL)) return sendJson(res, 200, []);
    const leads = fs.readFileSync(LEADS_JSONL, "utf8").trim().split("\n").map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    return sendJson(res, 200, leads);
  }

  if (req.method === "GET" && url.pathname === "/") {
    return sendJson(res, 200, { status: "ok", service: "easynet-whatsapp-lead-server", endpoints: ["GET /webhook (verify)", "POST /webhook (events)", "GET /leads?token=..."] });
  }

  sendJson(res, 404, { error: "not found" });
});

ensureStore();
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Easynet WhatsApp lead server on http://0.0.0.0:${PORT}`);
  console.log(`VERIFY_TOKEN=${VERIFY_TOKEN ? "set" : "DEFAULT (change in production!)"} | API token: ${WHATSAPP_TOKEN ? "set" : "not set (auto-reply simulated)"}`);
});
