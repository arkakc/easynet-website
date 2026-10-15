// Privacy-light, first-party SEO conversion event logging.
// Logs only event type and site path; no names, emails, messages, cookies or IPs.
const EVENTS = new Set(["whatsapp_click", "phone_click", "quote_click", "contact_success"]);
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const origin = req.headers.origin || "";
  if (origin && !/^https:\/\/(www\.)?easynetpng\.com$/.test(origin)) return res.status(403).end();
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const event = typeof body.event === "string" ? body.event : "";
  const path = typeof body.path === "string" ? body.path : "";
  if (!EVENTS.has(event) || !/^\/[a-z0-9/_-]{0,120}(?:\.html)?$/.test(path)) return res.status(400).end();
  console.log("[seo-conversion]", JSON.stringify({event, path, source:"website"}));
  return res.status(204).end();
};
