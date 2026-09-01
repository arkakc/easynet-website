# Easynet IT Solutions — Website Security Checklist

*Prepared 2026-08-29 · Static site (HTML/CSS/JS) · Applies to the production domain*

## 1. What is already implemented in this codebase

| Control | Where | Status |
|---|---|---|
| Strict Content-Security-Policy (no external resources at all) | `server.py`, `.htaccess`, `nginx.conf.example`, `<meta>` fallback in every page | ✅ |
| `X-Frame-Options: DENY` (site can't be iframed / clickjacking) | server + `.htaccess` + nginx | ✅ |
| `X-Content-Type-Options: nosniff` | all configs | ✅ |
| HSTS (1 year, includeSubDomains, preload) | all configs | ✅ |
| `Referrer-Policy`, `Permissions-Policy`, COOP/CORP headers | all configs | ✅ |
| No directory listing | `server.py` (403), `Options -Indexes`, nginx `autoindex off` | ✅ |
| Dotfiles blocked (`.git`, `.env`, `.htaccess`…) | `server.py`, `.htaccess`, nginx | ✅ |
| Sensitive file types blocked (`.md`, `.sql`, `.log`, `.key`, …) | all configs | ✅ |
| `security.txt` vulnerability disclosure (RFC 9116) | `/security.txt` + `/.well-known/security.txt` | ✅ |
| Anti-spam form: honeypot field + 4-second time-trap | `contact.html` + `main.js` | ✅ |
| Client-side input sanitization + field length limits | `main.js` + `maxlength` attributes | ✅ |
| Cache policy: HTML no-cache, assets 7 days | all configs | ✅ |
| Zero third-party scripts (no analytics/CDN = no supply-chain risk) | whole site | ✅ |

## 2. Hosting (do at the server level)

1. **Force HTTPS everywhere** — use Let's Encrypt (free) or Cloudflare's SSL.
   Keep the HTTP→HTTPS 301 redirect (see `nginx.conf.example`).
2. **Enable HSTS preload** once you confirm no HTTP-only subdomains:
   submit the domain at https://hstspreload.org
3. **Server software hygiene**
   - If using Apache/LiteSpeed: `.htaccess` included — also set `ServerTokens Prod` in main config.
   - If using nginx: use the provided server block.
   - If hosting on Python (this `server.py`): run it behind a reverse proxy with TLS (Caddy is the easiest: `tls email@example.com` one-liner).
4. **Remove any unused technology** from the host (e.g. disable PHP if not needed).
5. **Firewall**: only ports 80/443 open to the world; SSH on a non-standard port,
   key-based auth only, fail2ban.

## 3. Cloudflare (recommended, free tier is enough)

- Proxy the domain (orange cloud) → hides the origin IP, gives DDoS protection
- SSL mode: **Full (strict)**
- Enable: **Bot Fight Mode** (free), **Rate Limiting** on `/` and contact endpoint,
  **Browser Integrity Check**
- Security Level: **Medium** (raises to High during incidents)
- Auto minify + Brotli: on (site is already lean)

## 4. Email security for the domain (SPF / DKIM / DMARC)

Required before `hello.easynet@hotmail.com` sends mail — prevents your domain from
being spoofed for phishing. Add these DNS records at your registrar:

| Type | Name | Value |
|---|---|---|
| TXT | `@` | `v=spf1 include:_spf.google.com ~all` *(adjust for your mail provider)* |
| TXT | `easynet._domainkey` | *(DKIM public key from your mail provider, e.g. Google Workspace)* |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:hello.easynet@hotmail.com; pct=100` |

Start DMARC at `p=quarantine`, move to `p=reject` after 2–4 weeks of clean reports.

## 5. When the lead-capture backend is added later

- Validate & sanitize all input server-side (the JS sanitization is a first layer only)
- Use prepared statements / ORM (no raw SQL) — prevents SQL injection
- CSRF token on every form POST (Laravel does this automatically)
- Rate-limit the contact endpoint (e.g. 5 submissions / 10 min / IP)
- Store leads with least-privilege DB user; never commit the DB dump to the web root
  (lesson from the reference site we audited: its robots.txt leaked `bhudev_it_solution.sql`)
- Send mail via a transactional provider (SendGrid/SES) with DKIM, not PHP `mail()`

## 6. Backups & recovery (3-2-1 rule)

- **3** copies of the website (web root is only 2–3 MB)
- **2** different media (e.g. host snapshot + **Backblaze B2** account — you already
  list B2 as a partner; use `b2_rsync` or CloudBerry)
- **1** off-site (B2 *is* off-site)
- Schedule: automatic daily, keep 30 days. Test a restore once a quarter.

## 7. Monitoring & incident response

- Uptime check: UptimeRobot / BetterStack (free) on `/`
- Certificate expiry alerts (Let's Encrypt auto-renews; Cloudflare shows expiry)
- Dependency check: this site has **zero** dependencies, so there is nothing to
  update — review if any CDN/script is ever added (that is when supply-chain risk starts)
- Incident steps:
  1. Take the site offline (DNS → maintenance page) if compromise is suspected
  2. Snapshot the current state for forensics
  3. Restore from last known-good backup
  4. Rotate all credentials (host, DB, email, registrar)
  5. Review access logs for the incident window
  6. Document what happened and update this checklist

## 8. Ongoing review (every 6 months)

- [ ] Headers still correct (test: https://securityheaders.com / Mozilla Observatory)
- [ ] HSTS preload status
- [ ] DMARC report review
- [ ] Backup restore test
- [ ] Firewall / access review
- [ ] Renew `security.txt` `Expires` date
