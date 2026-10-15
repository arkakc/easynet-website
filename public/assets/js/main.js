/* ============================================================
   Easynet IT Solutions — Site JavaScript
   ============================================================ */

/* ---- Company contact config — update these values in ONE place ---- */
const EASYNET = {
  name: "Easynet IT Solutions Limited",
  email: "sales@easynetpng.com",
  phone: "7238 0387",                 // visible frontend phone number shown to visitors
  whatsapp: "67572743186",            // WhatsApp number kept same for backend/chat flow
  whatsappMsg: "Hello Easynet IT Solutions! I would like to discuss a technology solution for my business.",
  address: "Port Moresby 121"
};
/* expose for other modules (whatsapp-chat.js) */
window.EASYNET = EASYNET;

/* ---- Inject contact details anywhere [data-easynet="key"] ---- */
document.querySelectorAll("[data-easynet]").forEach(el => {
  const key = el.getAttribute("data-easynet");
  if (EASYNET[key] && EASYNET[key] !== "" && !/XXX/.test(EASYNET[key])) {
    el.textContent = EASYNET[key];
  }
});
