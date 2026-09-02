# Easynet WhatsApp Automation — Setup Guide

How the pieces fit together:

```
Customer clicks green WhatsApp bubble on your website
        │
        ▼
Guided chat collects: Name · Phone · Email · Company · Service · Message
        │  (auto-replies advance each step)
        ▼
Customer taps "Send on WhatsApp"
        │
        ├──► Their phone opens WhatsApp with a pre-filled STRUCTURED message
        │         (📋 New Enquiry — Name / Phone / Email / Company / Service / Message)
        │
        ▼
Easynet's WhatsApp Business receives the structured lead
        │
        ├──► Option A: Your team sees it and replies (works TODAY, zero cost)
        │
        └──► Option B: WhatsApp Cloud API (this folder) receives it via webhook,
              stores it in your Google Sheet automatically, and replies instantly
              with a thank-you — 24/7, even before a human sees it
```

## Option A — works immediately (no API, no cost)

1. Put your **real WhatsApp Business number** in `assets/js/main.js` →
   `EASYNET.whatsapp` (country code + number, digits only, e.g. `67570123456`).
2. Every website enquiry arrives in your WhatsApp inbox as a clean, structured
   message — no manual data entry, no copy-paste.
3. In the **WhatsApp Business app**, set up for fast human replies:
   - **Greeting message**: "Hi! 👋 Thanks for contacting Easynet IT Solutions.
     Tell us your name, phone number and what you need — we'll respond within 1 business day."
   - **Quick replies** (Settings → Tools → Quick replies):
     - `#hours` → "Mon–Fri, 8:30 AM – 5:00 PM"
     - `#quote` → "Sure! Please share your project details and I'll prepare a quotation."
     - `#packages` → "Our packages: Business Starter, Digital Growth, Business Automation, IT Office Setup, Managed IT. Which one fits your business?"

## Option B — WhatsApp Cloud API (full automation)

### 1. Meta Business setup (free)
1. Create a **Meta Business Portfolio**: https://business.facebook.com
2. **WhatsApp Manager** → API Setup → create a **Phone number ID**
   (you can use the test number first; a business-verified number is needed
   for production volumes)
3. Create a **temporary access token** (or permanent after business verification)
4. Register the **pre-approved message templates** you'll send first
   (Meta requires templates for business-initiated messages):
   - `enquiry_thanks` — the thank-you text from `server.js`
   - `enquiry_followup` — "Hi {{1}}, following up on your enquiry about {{2}}…"
5. In WhatsApp Manager → **API Setup → Webhooks**, subscribe to the
   `messages` field and set the callback URL to your server:
   `https://yourdomain.com/webhook` with your verify token.

### 2. Run the server
```bash
cd whatsapp-api
export PORT=3000
export WHATSAPP_VERIFY_TOKEN="a-long-random-string"
export WHATSAPP_PHONE_NUMBER_ID="1234567890"
export WHATSAPP_TOKEN="EAAG..."
export WHATSAPP_WEBHOOK_SECRET="the-app-secret-from-meta"   # enables signature verification
export LEADS_ACCESS_TOKEN="another-random-string"           # protects /leads
node server.js
```
In production run it under `pm2` / systemd and front it with nginx + TLS
(see `../nginx.conf.example` pattern).

### 3. Test locally (no Meta account needed)
```bash
node server.js &
# simulate Meta verification
curl "http://localhost:3000/webhook?hub.mode=subscribe&hub.verify_token=easynet-verify-2026&hub.challenge=123"
# simulate a lead from the website widget
curl -X POST http://localhost:3000/webhook -H 'Content-Type: application/json' -d '{
  "entry":[{"changes":[{"value":{
    "contacts":[{"phone_jid":"675701234567@s.whatsapp.net"}],
    "messages":[{"type":"text","text":{"body":"📋 *New Enquiry — Easynet IT Solutions*\n👤 Name: John Mako\n📞 Phone: +675 7012 3456\n✉️ Email: john@mako.com.pg\n🏢 Company: Mako Trading\n🛠 Service: IT Infrastructure\n💬 Message: Need network + CCTV for new office"}}]}
  }}]"
}'
# view captured leads
curl "http://localhost:3000/leads?token=easynet"
```
Leads are saved to your **Google Sheet** (set `SHEETS_WEBAPP_URL` +
`SHEETS_SECRET` from `../google-apps-script/Code.gs` — see step 4 below) or,
when the Sheet is not configured, to `leads/leads.csv` + `leads/leads.jsonl`.

### 4. Optional: store leads in a Google Sheet
Add the two environment variables before starting the server:
```bash
export SHEETS_WEBAPP_URL="https://script.google.com/macros/s/.../exec"
export SHEETS_SECRET="the-same-value-as-SHARED_SECRET-in-Code.gs"
node server.js
```
Setup of the Sheet itself takes ~3 minutes — see `../google-apps-script/Code.gs`.
WhatsApp leads land in the same "Leads" tab as website enquiries, with
`source` = `whatsapp`. If the Sheet can't be reached, the lead is written to
`leads/leads.csv` so nothing is ever lost.

## Privacy & compliance notes
- Tell customers what you collect (your Contact page + Privacy section already
  states data is used for service contact only).
- Keep leads access-controlled (`LEADS_ACCESS_TOKEN`, private storage, backups
  with encryption at rest — e.g. Backblaze B2 with SSE).
- Never log customer messages to public logs longer than needed.
