/* ============================================================
   Easynet WhatsApp Lead Chat — guided lead capture widget
   Collects contact data step-by-step, auto-advances replies,
   then delivers a structured lead to Easynet's WhatsApp
   (and POSTs to /api/whatsapp-lead for future backend).
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.EASYNET || { name: "Easynet IT Solutions", whatsapp: "675XXXXXXXX" };
  var SERVICES = [
    "Website Development", "Digital Marketing", "ERP / Automation",
    "IT Infrastructure", "Cybersecurity", "Managed IT Support",
    "WhatsApp Automation", "Not Sure Yet"
  ];

  /* ---------- build DOM ---------- */
  var fab = document.createElement("button");
  fab.className = "wa-fab";
  fab.setAttribute("aria-label", "Chat with Easynet on WhatsApp");
  fab.innerHTML =
    '<svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "wa-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Easynet WhatsApp chat");
  panel.innerHTML =
    '<div class="wa-head">' +
      '<div class="wa-avatar"><img src="assets/images/logo.png" alt=""></div>' +
      '<div class="wa-head-info"><b>Easynet IT Solutions</b><span><i class="wa-dot"></i>Online · replies within 1 business day</span></div>' +
      '<button class="wa-close" aria-label="Close chat">✕</button>' +
    '</div>' +
    '<div class="wa-body"></div>' +
    '<div class="wa-input-row" style="display:none">' +
      '<button class="wa-skip" style="display:none">Skip</button>' +
      '<input class="wa-input" type="text" autocomplete="off">' +
      '<button class="wa-send" aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></button>' +
    '</div>';

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  var body = panel.querySelector(".wa-body");
  var inputRow = panel.querySelector(".wa-input-row");
  var input = panel.querySelector(".wa-input");
  var sendBtn = panel.querySelector(".wa-send");
  var skipBtn = panel.querySelector(".wa-skip");
  var closeBtn = panel.querySelector(".wa-close");

  var state = { step: -1, data: {}, started: false };
  var timers = [];

  function now() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function scrollBottom() { body.scrollTop = body.scrollHeight; }

  function addMsg(cls, html) {
    var d = document.createElement("div");
    d.className = "wa-msg " + cls;
    d.innerHTML = html + '<span class="wa-time">' + now() + (cls === "bot" ? ' ✓✓' : '') + '</span>';
    body.appendChild(d);
    scrollBottom();
    return d;
  }

  function addTyping() {
    var d = document.createElement("div");
    d.className = "wa-msg bot wa-typing";
    d.innerHTML = "<i></i><i></i><i></i>";
    body.appendChild(d);
    scrollBottom();
    return d;
  }

  function botReply(html, cb, delay) {
    var t = addTyping();
    timers.push(setTimeout(function () {
      t.remove();
      addMsg("bot", html);
      if (cb) cb();
    }, delay || 850));
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  /* ---------- validation ---------- */
  function validPhone(v) { return /^[+\d][\d\s().-]{6,19}$/.test(v); }
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }
  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

  /* ---------- steps ---------- */
  var STEPS = [
    { // 1 name
      ask: "Hi! 👋 Thanks for reaching out to <b>Easynet IT Solutions</b>.<br>To help our team assist you faster — what's your <b>full name</b>?",
      type: "text", key: "name", label: "Your full name…", required: true,
      validate: function (v) { return v.length >= 2; }, err: "Please enter your name."
    },
    { // 2 phone
      ask: "Great, thanks! 📞 What's the best <b>phone / WhatsApp number</b> for us to reach you?",
      type: "text", key: "phone", label: "e.g. +675 7012 3456", required: true,
      validate: validPhone, err: "Please enter a valid phone number."
    },
    { // 3 email (skippable)
      ask: "And your <b>email address</b>? <span style='color:#667781;font-size:12.5px'>(optional — for our written quotation)</span>",
      type: "text", key: "email", label: "you@company.com.pg", required: false,
      validate: function (v) { return v === "" || validEmail(v); }, err: "That email doesn't look right."
    },
    { // 4 company (skippable)
      ask: "Which <b>company or business</b> do you represent? <span style='color:#667781;font-size:12.5px'>(optional)</span>",
      type: "text", key: "company", label: "e.g. Mako Trading Ltd", required: false
    },
    { // 5 service (chips)
      ask: "Which service are you interested in? 👇",
      type: "chips", key: "service", required: true
    },
    { // 6 message (skippable)
      ask: "Lastly, anything you'd like us to know about your project? <span style='color:#667781;font-size:12.5px'>(optional)</span>",
      type: "text", key: "message", label: "Tell us about your project…", required: false,
      validate: function (v) { return v.length <= 1000; }, err: "Please keep it under 1000 characters."
    }
  ];

  function showInput(step) {
    inputRow.style.display = "flex";
    inputRow.style.position = "relative";
    input.value = "";
    input.placeholder = step.label || "";
    input.type = step.key === "phone" ? "tel" : step.key === "email" ? "email" : "text";
    input.maxLength = step.key === "message" ? 1000 : 120;
    inputRow.style.padding = "12px";
    if (step.type === "text" && step.key === "message") {
      input.style.borderRadius = "14px";
      inputRow.style.flexWrap = "wrap";
    } else {
      input.style.borderRadius = "22px";
      inputRow.style.flexWrap = "nowrap";
    }
    skipBtn.style.display = step.required ? "none" : "inline-flex";
    sendBtn.disabled = false;
    input.focus();
  }

  function buildChips(step) {
    var wrap = document.createElement("div");
    wrap.className = "wa-chips";
    SERVICES.forEach(function (svc) {
      var b = document.createElement("button");
      b.className = "wa-chip";
      b.textContent = svc;
      b.addEventListener("click", function () {
        wrap.querySelectorAll(".wa-chip").forEach(function (c) { c.classList.remove("selected"); });
        b.classList.add("selected");
        state.data[step.key] = svc;
        addMsg("user", esc(svc));
        advance();
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    scrollBottom();
  }

  function submitCurrent() {
    var step = STEPS[state.step];
    if (step.type === "chips") return;
    var v = input.value.trim();
    if (step.required && v === "") { fail(step.err); return; }
    if (step.validate && !step.validate(v)) { fail(step.err); return; }
    state.data[step.key] = v;
    addMsg("user", esc(v) || "(skipped)");
    advance();
  }

  function fail(msg) {
    input.classList.remove("invalid");
    void input.offsetWidth;
    input.classList.add("invalid");
    addMsg("bot", "⚠️ " + msg);
    input.focus();
  }

  function advance() {
    inputRow.style.display = "none";
    state.step++;
    if (state.step < STEPS.length) {
      botReply(STEPS[state.step].ask, function () {
        if (STEPS[state.step].type === "chips") buildChips(STEPS[state.step]);
        else showInput(STEPS[state.step]);
      });
    } else {
      showSummary();
    }
  }

  function buildWhatsAppMessage() {
    var d = state.data;
    return [
      "📋 *New Enquiry — Easynet IT Solutions*",
      "👤 Name: " + (d.name || "-"),
      "📞 Phone: " + (d.phone || "-"),
      "✉️ Email: " + (d.email || "-"),
      "🏢 Company: " + (d.company || "-"),
      "🛠 Service: " + (d.service || "-"),
      "💬 Message: " + (d.message || "-")
    ].join("\n");
  }

  function showSummary() {
    var d = state.data;
    var card = document.createElement("div");
    card.className = "wa-summary";
    card.innerHTML =
      "<h4>📋 Your Enquiry</h4>" +
      "<div><span class='k'>Name</span><span class='v'>" + esc(d.name) + "</span></div>" +
      "<div><span class='k'>Phone</span><span class='v'>" + esc(d.phone) + "</span></div>" +
      (d.email ? "<div><span class='k'>Email</span><span class='v'>" + esc(d.email) + "</span></div>" : "") +
      (d.company ? "<div><span class='k'>Company</span><span class='v'>" + esc(d.company) + "</span></div>" : "") +
      "<div><span class='k'>Service</span><span class='v'>" + esc(d.service) + "</span></div>" +
      "<div><span class='k'>Message</span><span class='v'>" + (esc(d.message) || "—") + "</span></div>";
    body.appendChild(card);
    scrollBottom();

    botReply("Everything looks good! ✅ Tap below to send your details to <b>Easynet</b> on WhatsApp — our team will respond within 1 business day.", function () {
      var cta = document.createElement("button");
      cta.className = "wa-cta";
      cta.innerHTML = '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg> Send on WhatsApp';
      cta.addEventListener("click", function () { sendLead(); }, { once: true });
      body.appendChild(cta);
      scrollBottom();
    });
  }

  function sendLead() {
    var text = buildWhatsAppMessage();
    // future backend hook (works once an API endpoint exists)
    try {
      fetch("/api/whatsapp-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: state.data, channel: "whatsapp-widget", source: location.href })
      }).catch(function () {});
    } catch (e) {}

    var url = "https://wa.me/" + CFG.whatsapp + "?text=" + encodeURIComponent(text);
    window.open(url, "_blank", "noopener");

    clearTimers();
    body.innerHTML = "";
    addMsg("bot", "📤 <b>Enquiry sent!</b> Your details are on their way to the Easynet team via WhatsApp.");
    addMsg("bot", "✅ <b>Thank you, " + esc(state.data.name) + "!</b><br>Our team will respond within <b>1 business day</b>. If WhatsApp didn't open, you can also use our <a href='contact.html'>Contact page</a>.");
    addMsg("bot", "Is there anything else I can help you with? 😊");
    state.started = false;
    state.data = {};
    state.step = -1;
  }

  /* ---------- open / close ---------- */
  function openPanel() {
    panel.classList.add("open");
    fab.style.display = "none";
    if (!state.started) {
      state.started = true;
      state.step = 0;
      botReply(STEPS[0].ask, function () { showInput(STEPS[0]); }, 900);
    }
  }
  function closePanel() {
    panel.classList.remove("open");
    fab.style.display = "flex";
    clearTimers();
  }

  fab.addEventListener("click", openPanel);
  closeBtn.addEventListener("click", closePanel);
  sendBtn.addEventListener("click", submitCurrent);
  skipBtn.addEventListener("click", function () {
    state.data[STEPS[state.step].key] = "";
    addMsg("user", "(skipped)");
    advance();
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); submitCurrent(); } });
  input.addEventListener("input", function () { input.classList.remove("invalid"); });
})();
