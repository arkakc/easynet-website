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
   `easynetsolutions.com.pg` → **Add**.
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
- [ ] Open https://easynetsolutions.com.pg/ and test all 3 pages + forms
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
