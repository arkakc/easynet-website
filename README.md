# Easynet IT Solutions — Website

Static website (HTML/CSS/JS, no build step) for **Easynet IT Solutions Limited** —
a 100% PNG-owned IT company in Port Moresby.

## Repository layout

```
public/               ← THE WEBSITE (this folder is what gets deployed)
  index.html          Home (single page, all sections)
  about.html          About Us
  contact.html        Contact Us + enquiry form
  404.html            Custom error page
  assets/             css / js / images
  robots.txt · sitemap.xml · security.txt · .well-known/
  llms.txt            Plain-text company summary for AI assistants / LLMs
  site.webmanifest    PWA manifest (installable, themed)

vercel.json           Vercel config (security headers, caching, output dir = public)
api/                  Vercel serverless functions (used in production)
  contact.js          POST /api/contact       — enquiry form (Sheet + email)
  whatsapp-lead.js    POST /api/whatsapp-lead — WhatsApp chat widget (Sheet)
  export.js           GET  /api/export        — jump to the leads Sheet
google-apps-script/   Code.gs — the Sheet app that stores every lead row
server.py             Optional secure local/dev server (python3 server.py)
.htaccess             Apache / LiteSpeed config (if you host on cPanel instead)
nginx.conf.example    nginx reference config
SECURITY.md           Security hardening checklist
whatsapp-api/         WhatsApp Cloud API lead-capture server (Node.js)
```

> **Only `public/` is published.** `SECURITY.md`, `server.py`, `whatsapp-api/`
> and the lead database stay in the repo but are never served to the internet.

---

# Contact form (enquiry) backend

The enquiry form on `contact.html` submits to **`POST /api/contact`**. Every
enquiry gets a **sequence number**, is **saved as a row in a Google Sheet**
(your live leads database) and is **emailed** to **hello.easynet@hotmail.com**
with the subject **`WEB Enquiry Sequence No. {n}`** (the visitor's email is set
as Reply-To).

> ⚠️ **Hotmail/Outlook can no longer be used to SEND email from apps** —
> Microsoft retired password/app-password SMTP for personal accounts in
> March 2026. Emails are therefore sent via **Resend** (free: 3,000/month)
> and simply *delivered to* the Hotmail inbox.

## On Vercel (production)

The endpoint is a serverless function: `api/contact.js`. Enquiries are saved
to a **Google Sheet** via a tiny Apps Script Web App — no Upstash/Redis and no
Google API keys needed. One-time setup:

1. **Resend** — sign up at https://resend.com **using
   hello.easynet@hotmail.com**, create an API key, then in Vercel →
   *Settings → Environment Variables* add `RESEND_API_KEY`.
2. **Google Sheet** — see **`google-apps-script/Code.gs`** for the 3-minute
   walkthrough. In short: create a Sheet → *Extensions → Apps Script* → paste
   `Code.gs` → set `SHARED_SECRET` → *Deploy → Web app* (Execute as **Me**,
   access **Anyone**) → copy the URL ending in `/exec`.
3. In Vercel → *Settings → Environment Variables* add:
   - `SHEETS_WEBAPP_URL` — the Web app URL from step 2
   - `SHEETS_SECRET` — the same value as `SHARED_SECRET` in `Code.gs`
   - `SHEETS_SPREADSHEET_URL` — the Sheet's normal browser URL (lets
     `https://YOUR-DOMAIN/api/export?token=…` jump straight to the Sheet;
     protect it with a long random `LEADS_EXPORT_TOKEN`)
4. **Redeploy** the project so the env vars take effect.

Each new row lands in the Sheet's **"Leads"** tab — the same sheet is shared
with the WhatsApp chat widget (see below). Columns, in order:

| Column | Notes |
|---|---|
| `Ref No.` | 1, 2, 3… assigned by the Sheet — the same number the client sees |
| `Date & Time` | when the lead was captured |
| `Source` | `Website form` / `WhatsApp chat` / `WhatsApp` |
| `Name` · `Phone` · `Email` · `Company` · `Service` · `Message` | the enquiry fields (optional ones may be blank) |
| `Page URL` · `User Agent` · `Details` | where it came from, browser, raw payload |

A **WhatsApp chat row is created when the client sends their phone number** and
is **completed at the end of the chat** (see the next section) — so a chat that
is abandoned half-way still leaves name + phone in the Sheet.

If the Sheet is temporarily unreachable the enquiry is still emailed (with a
`T########` fallback reference); if email fails it is still saved to the Sheet.
An older Sheet (created before the friendly headings) is upgraded in place on
the next write — old rows are re-ordered to the new column order, nothing is
deleted.

## Local / VPS (`server.py`)

`python3 server.py` serves the site AND handles `/api/contact` itself:

1. Enquiries are appended to your **Google Sheet** — set `SHEETS_WEBAPP_URL`
   and `SHEETS_SECRET` (see `google-apps-script/Code.gs`) before starting.
2. If the Sheet is not configured or unreachable, enquiries fall back to
   `data/enquiries.csv` (git-ignored, never served) so nothing is ever lost.
3. Emails are sent via Resend — set `RESEND_API_KEY` before starting, or any
   generic SMTP provider via `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
   `SMTP_PASS`. With neither configured, each email is saved to
   `data/outbox/enquiry-XXXXX.eml` so nothing is ever lost.
4. `CONTACT_TO` overrides the destination (default hello.easynet@hotmail.com).

---

# WhatsApp chat widget (`wa-fab`)

The green WhatsApp bubble on every page opens a guided chat
(`public/assets/js/whatsapp-chat.js`). It saves to the Google Sheet in **two
moments**, exactly as the chat runs:

```
Hi! 👋 Thanks for reaching out to Easynet IT Solutions.
To help our team assist you faster — what's your full name?
                        ← arka
Great, thanks! 📞 What's the best phone / WhatsApp number for us to reach you?
                        ← 41411651        ★ the moment this is sent,
                                            NAME + PHONE are saved to the
                                            Google Sheet → row + Ref No. #12
                        →
And your email address? (optional — for our written quotation)
Which company or business do you represent? (optional)
Which service are you interested in? 👇
                        ★ final SEND button → the rest of the answers are
                          written into THAT SAME ROW, beside the name and
                          phone, each under its own column
                        →
                        ★ then WhatsApp opens (short message + Ref No.)
                        ★ and the chat ends:
                          "🎉 Thank you, John! Our team will contact you shortly."
```

1. **Name** and **2. Phone / WhatsApp number** — when the phone is sent
   (enter or the send button), **`POST /api/whatsapp-lead`** creates the row:
   `Ref No.`, `Date & Time`, `Source = WhatsApp chat`, `Name`, `Phone`. The
   client sees a small note: *"✓ Your details are saved — Ref No. 12"*.
2. **Email** *(optional)* · **Company** *(optional)* · **Service** — then the
   final **SEND** button posts `{ action: "update", ref: 12, email, company,
   service }`, so the answers land **next to the name and phone in the same
   row** (`EMAIL` under `Email`, `COMPANY` under `Company`, `SERVICE` under
   `Service`). Skipped answers are simply left blank.
3. **Redirect to WhatsApp** with a short message carrying the Ref No.:

   ```
   Hi Easynet 👋 I just sent my enquiry through your website.

   Ref No. 12
   👤 Name: John Mako
   📞 Phone: +675 7012 3456
   🛠 Service: IT Infrastructure
   ```
4. The chat **ends with the thank-you message**:
   *"🎉 Thank you, John! Our team will contact you shortly."*

Nothing is lost if the Sheet is unreachable:

| When it fails | What happens |
|---|---|
| The early save (name + phone) | The final SEND creates the row with **all** the answers instead |
| The final update | The row keeps name + phone, and the WhatsApp message carries the Ref No. **and** the missing details |
| The whole endpoint | WhatsApp still opens with the full structured enquiry inside the message |

Closing and reopening the widget starts a fresh enquiry.

There is **no "anything you'd like us to know about your project?" step** — the
message field is reserved for the contact form and the WhatsApp Cloud API
server, and stays blank for chat leads.

**Requirements:** the same `SHEETS_WEBAPP_URL` + `SHEETS_SECRET` env vars used
by the contact form (see `google-apps-script/Code.gs`). Nothing else to set up —
the widget shows an error-free fallback if they are missing.

---

# SEO & AI / GEO (Generative Engine Optimisation)

The site is built to rank in classic search **and** to be cited accurately by AI
assistants (ChatGPT, Perplexity, Gemini, Claude, Google AI Overviews).

| Lever | Where | Notes |
|---|---|---|
| Unique `<title>` + meta description per page | every page | keep under ~60 / ~160 chars |
| Canonical URL + `hreflang` (`en-pg`, `x-default`) | every page | single-language geo-targeting |
| `robots` meta (`index, follow, max-image-preview:large, max-snippet:-1`) | index/about/contact | lets engines show rich snippets |
| schema.org JSON-LD | every page | `ProfessionalService`+`LocalBusiness`, `WebSite`, `WebPage` (+`speakable`), `FAQPage`, `AboutPage`, `ContactPage`, `BreadcrumbList`, full `OfferCatalog` of services & packages |
| `llms.txt` | `public/llms.txt` | machine-readable company facts for LLMs; **update it whenever facts change** |
| AI crawlers explicitly allowed | `public/robots.txt` | GPTBot, ClaudeBot, PerplexityBot, Google-Extended, etc. |
| Image sitemap + `width`/`height` + `loading="lazy"` | `sitemap.xml`, pages | zero layout shift, rich image results |
| Consistent NAP (name/address/phone) | pages + JSON-LD + `llms.txt` | keep identical everywhere |

**Maintenance rule:** when the phone number, address, hours, team, services or
packages change, update **all four** places — the page HTML, `main.js` `EASYNET`
config, the JSON-LD blocks, and `llms.txt`. Inconsistent facts confuse both
Google and AI engines.

---

# How to host: GitHub + Vercel (step by step)

## Step 1 — Create the GitHub repository
1. Go to **https://github.com** → sign in (create a free account if needed).
2. Click **"+" → "New repository"**.
   - Repository name: `easynet-website` (public or private — both work)
   - Leave it **empty** (do NOT initialize with a README — we already have one)
   - Click **Create repository**
3. In your terminal, inside this folder:
   ```bash
   cd easynet-website
   git init
   git add .
   git commit -m "Easynet IT Solutions — launch website"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/easynet-website.git
   git push -u origin main
   ```
   (If you don't use a terminal: on GitHub click **"uploading an existing
   file"** and drag the whole folder in — or use a desktop app like
   GitHub Desktop / VS Code.)

   > Every future change works the same way: edit → `git add . && git commit
   > -m "..." && git push` → Vercel redeploys automatically within ~30 seconds.

## Step 2 — Deploy on Vercel
1. Go to **https://vercel.com** → **Sign Up** (use your GitHub account —
   click "Continue with GitHub").
2. Click **Add New… → Project** → find `easynet-website` → **Import**.
3. Vercel auto-detects it as a static site. Check the settings:
   - **Framework Preset:** Other
   - **Output Directory:** `public`  ← *(already set in vercel.json; confirm it shows "public")*
   - Build Command: *(leave empty)*
4. Click **Deploy**. In about 30–60 seconds you get a live URL:
   **https://easynet-website.vercel.app** (or a random project name).

   ✅ Done — the site is live with free SSL, global CDN, automatic
   security headers (from `vercel.json`) and auto-deploys on every push.

## Step 3 — Connect your custom domain
1. In Vercel: your project → **Settings → Domains** → enter
   `easynetpng.com` → **Add**.
2. Vercel shows DNS records. Add them at your domain registrar:

   | Type | Host/Name | Value |
   |------|-----------|-------|
   | A    | `@`       | `76.76.21.21` |
   | CNAME| `www`     | `cname.vercel-dns.com` |

   *(Vercel shows the current values in its UI — use those.)*
3. Wait for DNS propagation (a few minutes to a few hours). Vercel
   automatically issues a **free SSL certificate** — HTTPS goes live by itself.
4. Once verified (green check in Vercel), delete or keep the `.vercel.app`
   URL — both work; the custom domain is primary.

## Step 4 — Post-launch checklist
- [ ] Open https://easynetpng.com/ and test all 3 pages + forms
- [ ] Test on your phone (Mobile View should activate automatically)
- [ ] **Google Search Console**: verify the domain → submit `sitemap.xml`
      → Request Indexing on the 3 pages
- [ ] Set the real WhatsApp number + email/phone in `public/assets/js/main.js`
      (`EASYNET` config at the top) → commit & push
- [ ] (Email) Add SPF / DKIM / DMARC DNS records for the domain
      (see `SECURITY.md` section 4) before `info@` sends mail

## Notes
- **No build, no Node required** — Vercel simply publishes `public/`.
- The WhatsApp chat widget works out of the box on Vercel: it saves each lead
  to the Google Sheet via `/api/whatsapp-lead` and opens `wa.me` with a short
  message + Ref No. (the optional Cloud API server in `whatsapp-api/` runs
  separately on a VPS, or as a Vercel Function later).
- To deploy a preview of any branch/pull request: Vercel does this
  automatically (Preview URLs) — great for reviewing changes.
