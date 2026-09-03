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

Each new row lands in the Sheet's **"Leads"** tab with columns
`sequence_no, timestamp, source, name, company, email, phone, service,
message, page, user_agent, raw`. If the Sheet is temporarily unreachable the
enquiry is still emailed (with a `T########` fallback reference); if email
fails it is still saved to the Sheet.

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
- The WhatsApp chat widget works out of the box on Vercel (it opens
  `wa.me` links; the optional Cloud API server in `whatsapp-api/` runs
  separately on a VPS or as a Vercel Function later).
- To deploy a preview of any branch/pull request: Vercel does this
  automatically (Preview URLs) — great for reviewing changes.
