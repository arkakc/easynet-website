/* ============================================================
   Easynet IT Solutions — Enquiry export (Vercel)
   GET /api/export?token=YOUR_SECRET
   ------------------------------------------------------------
   Enquiries live in a Google Sheet (see google-apps-script/
   Code.gs), so this endpoint simply forwards you to the live
   spreadsheet — always up to date, filterable, shareable.
   Protected by LEADS_EXPORT_TOKEN; the Sheet URL is read from
   the SHEETS_SPREADSHEET_URL environment variable
   (set both in Vercel → Settings → Environment Variables).
   ============================================================ */
"use strict";

const EXPORT_TOKEN = process.env.LEADS_EXPORT_TOKEN || "";
const SHEETS_SPREADSHEET_URL = (process.env.SHEETS_SPREADSHEET_URL || "").trim();

module.exports = async (req, res) => {
  if (!EXPORT_TOKEN) {
    return res.status(503).json({
      ok: false,
      error:
        "Export disabled — set the LEADS_EXPORT_TOKEN environment variable first.",
    });
  }
  const token = (req.query && req.query.token) || "";
  if (token !== EXPORT_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid token." });
  }
  if (!SHEETS_SPREADSHEET_URL) {
    return res.status(503).json({
      ok: false,
      error:
        "SHEETS_SPREADSHEET_URL not set — paste your Google Sheet's browser URL as an environment variable.",
    });
  }

  res.setHeader("Cache-Control", "no-store");
  return res.redirect(302, SHEETS_SPREADSHEET_URL);
};
