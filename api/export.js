/* ============================================================
   Easynet IT Solutions — Enquiry CSV export (Vercel)
   GET /api/export?token=YOUR_SECRET
   ------------------------------------------------------------
   Downloads every stored enquiry as a CSV file (enquiries.csv).
   Protected by the LEADS_EXPORT_TOKEN environment variable —
   set it in Vercel → Settings → Environment Variables.
   ============================================================ */
"use strict";

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
const EXPORT_TOKEN = process.env.LEADS_EXPORT_TOKEN || "";

const HEADER = [
  "sequence_no",
  "timestamp",
  "name",
  "company",
  "email",
  "phone",
  "service",
  "message",
];

function csvSafe(v) {
  v = String(v == null ? "" : v);
  return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

module.exports = async (req, res) => {
  if (!EXPORT_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: "Export disabled — set the LEADS_EXPORT_TOKEN environment variable first.",
    });
  }
  const token = (req.query && req.query.token) || "";
  if (token !== EXPORT_TOKEN) {
    return res.status(403).json({ ok: false, error: "Invalid token." });
  }
  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(503).json({ ok: false, error: "Storage not configured." });
  }

  const r = await fetch(REDIS_URL + "/lrange/enquiries/0/-1", {
    headers: { Authorization: "Bearer " + REDIS_TOKEN },
  });
  if (!r.ok) {
    return res.status(502).json({ ok: false, error: "Storage error." });
  }
  const body = await r.json();
  const items = Array.isArray(body.result) ? body.result : [];

  const lines = [HEADER.join(",")];
  for (const item of items) {
    let rec;
    try { rec = JSON.parse(item); } catch { continue; }
    lines.push(HEADER.map((k) => csvSafe(rec[k])).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="enquiries.csv"');
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).send(lines.join("\r\n") + "\r\n");
};
