/* ============================================================
   Easynet WhatsApp Lead Chat — guided lead capture widget
   ------------------------------------------------------------
   The chat runs like this:

    1. "Hi! 👋 Thanks for reaching out to Easynet IT Solutions.
        To help our team assist you faster — what's your full name?"
    2. "Great, thanks! 📞 What's the best phone / WhatsApp number
        for us to reach you?"
        → the moment the client hits enter/send, NAME + PHONE are
          saved to Easynet's Google Sheet (POST /api/whatsapp-lead),
          creating the row and its Ref No.
    3. the chat carries on: email (optional) → company (optional)
       → which service?  👇
    4. final SEND button → the rest of the answers are written into
       THAT SAME ROW, beside the name and phone (email under Email,
       company under Company, service under Service …)
    5. then the client is redirected to WhatsApp (short message with
       the Ref No.) and the chat ends with the thank-you:
       "🎉 Thank you, John! Our team will contact you shortly."

   If the Sheet cannot be reached the full enquiry is put in the
   WhatsApp message instead, so a lead is never lost.
   ============================================================ */
(function () {
  "use strict";

  var CFG = window.EASYNET || { name: "Easynet IT Solutions", whatsapp: "675XXXXXXXX" };
  var SERVICES = [
    "Website Development", "Digital Marketing", "ERP / Automation",
    "IT Infrastructure", "Cybersecurity", "Managed IT Support",
    "WhatsApp Automation", "Not Sure Yet"
  ];
  var SAVE_TIMEOUT_MS = 12000;

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
      '<div class="wa-avatar">Hello</div>' +
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

  var state = freshState();
  var timers = [];
  var ctaBtn = null;

  function freshState() {
    return {
      step: -1, data: {}, started: false, sending: false, done: false,
      ref: null,          // Ref No. of the row created after the phone number
      createPromise: null // the save fired as soon as the phone was sent
    };
  }

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

  /* small centred note, e.g. "✓ Your details are saved — Ref No. 12" */
  function sysNote(html) {
    var d = document.createElement("div");
    d.className = "wa-sysnote";
    d.innerHTML = html;
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
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

  /* ---------- steps ---------- */
  var STEPS = [
    { // 1 name — saved together with the phone number at step 2
      ask: "Hi! 👋 Thanks for reaching out to <b>Easynet IT Solutions</b>.<br>To help our team assist you faster — what's your <b>full name</b>?",
      type: "text", key: "name", label: "Your full name…", required: true,
      validate: function (v) { return v.length >= 2; }, err: "Please enter your name."
    },
    { // 2 phone — on enter/send, name + phone go to the Google Sheet
      ask: "Great, thanks! 📞 What's the best <b>phone / WhatsApp number</b> for us to reach you?",
      type: "text", key: "phone", label: "e.g. +675 7012 3456", required: true,
      validate: validPhone, err: "Please enter a valid phone number.", saveNow: true
    },
    { // 3 email (skippable) — written into the same row at the final send
      ask: "And your <b>email address</b>? <span style='color:#667781;font-size:12.5px'>(optional — for our written quotation)</span>",
      type: "text", key: "email", label: "you@company.com.pg", required: false,
      validate: function (v) { return v === "" || validEmail(v); }, err: "That email doesn't look right."
    },
    { // 4 company (skippable) — same row
      ask: "Which <b>company or business</b> do you represent? <span style='color:#667781;font-size:12.5px'>(optional)</span>",
      type: "text", key: "company", label: "e.g. Mako Trading Ltd", required: false
    },
    { // 5 service (chips) — same row
      ask: "Which service are you interested in? 👇",
      type: "chips", key: "service", required: true
    }
    /* End of questions — the final SEND button follows. */
  ];

  function showInput(step) {
    inputRow.style.display = "flex";
    inputRow.style.position = "relative";
    input.value = "";
    input.placeholder = step.label || "";
    input.type = step.key === "phone" ? "tel" : step.key === "email" ? "email" : "text";
    input.maxLength = 120;
    inputRow.style.padding = "12px";
    input.style.borderRadius = "22px";
    inputRow.style.flexWrap = "nowrap";
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
        wrap.querySelectorAll(".wa-chip").forEach(function (c) { c.disabled = true; });
        advance();
      });
      wrap.appendChild(b);
    });
    body.appendChild(wrap);
    scrollBottom();
  }

  function submitCurrent() {
    var step = STEPS[state.step];
    if (!step || step.type === "chips") return;
    var v = input.value.trim();
    if (step.required && v === "") { fail(step.err); return; }
    if (step.validate && !step.validate(v)) { fail(step.err); return; }
    state.data[step.key] = v;
    addMsg("user", esc(v) || "(skipped)");
    if (step.saveNow) saveNameAndPhone();   // ← the phone was just sent
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

  /* ---------- the API: one endpoint, two moments ---------- */
  /* POST /api/whatsapp-lead — {name, phone, …} creates the row,
     {action:"update", ref, email, company, service} fills the rest of it. */
  function postLead(payload) {
    return new Promise(function (resolve) {
      var settled = false;
      function settle(result) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      }
      var ctrl = null;
      var timer = null;
      try { ctrl = new AbortController(); } catch (e) { ctrl = null; }
      if (ctrl) {
        timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, SAVE_TIMEOUT_MS);
      }
      try {
        fetch("/api/whatsapp-lead", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          signal: ctrl ? ctrl.signal : undefined
        })
          .then(function (r) { return r.json().catch(function () { return {}; }); })
          .then(function (out) {
            settle(out && out.ok === true
              ? { ok: true, ref: out.ref || null, updated: out.updated === true }
              : { ok: false, ref: null });
          })
          .catch(function () { settle({ ok: false, ref: null }); });
      } catch (e) {
        settle({ ok: false, ref: null });
      }
    });
  }

  function baseBody() {
    return { page: location.pathname + location.search, company_website: "" };
  }

  /* Step 2 — name + phone are saved the moment the phone is sent. */
  function saveNameAndPhone() {
    if (state.createPromise || state.ref) return;
    var chat = state;                 // the chat this save belongs to
    var payload = baseBody();
    payload.name = state.data.name || "";
    payload.phone = state.data.phone || "";
    state.createPromise = postLead(payload).then(function (res) {
      if (state !== chat) return res; // the chat was reset meanwhile — don't touch it
      if (res.ok && res.ref) {
        state.ref = res.ref;
        sysNote("✓ Your details are saved — Ref No. " + esc(String(res.ref)));
      }
      return res;
    });
  }

  /* ---------- summary + final send button ---------- */
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
      "<div><span class='k'>Service</span><span class='v'>" + esc(d.service) + "</span></div>";
    body.appendChild(card);
    scrollBottom();

    botReply("All done! ✅ Tap below to finish — we'll save the rest of your details and open WhatsApp so you can chat with <b>Easynet</b> straight away.", function () {
      ctaBtn = document.createElement("button");
      ctaBtn.className = "wa-cta";
      ctaBtn.innerHTML = waIcon() + " Send on WhatsApp";
      ctaBtn.addEventListener("click", sendLead);
      body.appendChild(ctaBtn);
      scrollBottom();
    });
  }

  function waIcon() {
    return '<svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>';
  }

  function setCtaBusy(busy) {
    if (!ctaBtn) return;
    ctaBtn.disabled = busy;
    ctaBtn.classList.toggle("sending", busy);
    ctaBtn.innerHTML = busy
      ? '<span class="wa-spin"></span> Saving your details…'
      : waIcon() + " Send on WhatsApp";
  }

  /* ---------- final SEND: save the rest, then redirect to WhatsApp ---------- */
  function sendLead() {
    if (state.sending || state.done) return;
    state.sending = true;
    setCtaBusy(true);

    // Start the WhatsApp tab inside the click gesture so the browser
    // doesn't block it; its address is filled in once the save is done.
    var win = null;
    try { win = window.open("about:blank", "_blank"); } catch (e) { win = null; }

    var rest = {
      email: state.data.email || "",
      company: state.data.company || "",
      service: state.data.service || ""
    };

    // Wait for the early save (name + phone) if it is still in flight.
    var first = state.createPromise || Promise.resolve({ ok: false, ref: null });

    first
      .then(function (res) {
        if (!state.ref && res && res.ok && res.ref) state.ref = res.ref;
        if (state.ref) {
          // The row exists → write the rest of the answers beside it.
          var payload = baseBody();
          payload.action = "update";
          payload.ref = state.ref;
          payload.email = rest.email;
          payload.company = rest.company;
          payload.service = rest.service;
          return postLead(payload).then(function (out) {
            return { ref: state.ref, restSaved: !!(out && out.ok) };
          });
        }
        // The early save never landed → create the row now, with everything.
        var payload = baseBody();
        payload.name = state.data.name || "";
        payload.phone = state.data.phone || "";
        payload.email = rest.email;
        payload.company = rest.company;
        payload.service = rest.service;
        return postLead(payload).then(function (out) {
          var ok = !!(out && out.ok);
          return { ref: ok ? (out.ref || state.ref) : state.ref, restSaved: ok };
        });
      })
      .then(function (r) {
        state.sending = false;
        showThanks(r.ref, r.restSaved, win);
      });
  }

  /* ---------- WhatsApp handoff + closing thank-you ---------- */
  /* Short form — everything is already in the Sheet row. */
  function buildShortMessage(ref) {
    var d = state.data;
    var lines = ["Hi Easynet 👋 I just sent my enquiry through your website.", ""];
    if (ref) lines.push("Ref No. " + ref);
    if (d.name) lines.push("👤 Name: " + d.name);
    if (d.phone) lines.push("📞 Phone: " + d.phone);
    if (d.service) lines.push("🛠 Service: " + d.service);
    return lines.join("\n");
  }

  /* Long form — used when the Sheet does not hold the full record, so
     nothing is lost. */
  function buildFullMessage(ref) {
    var d = state.data;
    var out = ["📋 *New Enquiry — Easynet IT Solutions*"];
    if (ref) out.push("🔖 Ref No: " + ref);
    out.push("👤 Name: " + (d.name || "-"));
    out.push("📞 Phone: " + (d.phone || "-"));
    out.push("✉️ Email: " + (d.email || "-"));
    out.push("🏢 Company: " + (d.company || "-"));
    out.push("🛠 Service: " + (d.service || "-"));
    return out.join("\n");
  }

  function openWhatsApp(url, win) {
    try {
      if (win && !win.closed) {
        win.opener = null;
        win.location.href = url;
        return true;
      }
    } catch (e) {}
    var w = null;
    try { w = window.open(url, "_blank", "noopener"); } catch (e) { w = null; }
    return !!w;
  }

  function showThanks(ref, restSaved, win) {
    state.done = true;
    var name = state.data.name || "there";
    var url = "https://wa.me/" + CFG.whatsapp +
      "?text=" + encodeURIComponent(restSaved ? buildShortMessage(ref) : buildFullMessage(ref));

    var opened = openWhatsApp(url, win);

    inputRow.style.display = "none";
    if (ctaBtn) { ctaBtn.remove(); ctaBtn = null; }

    if (!opened) {
      addMsg("bot", "👉 <a href='" + url + "' target='_blank' rel='noopener'><b>Tap here to open WhatsApp</b></a> and send your enquiry message.");
    }
    if (ref && restSaved) sysNote("✓ Saved to our leads — Ref No. " + esc(String(ref)));

    var reach = [];
    if (CFG.email) reach.push("<a href='mailto:" + esc(CFG.email) + "'>" + esc(CFG.email) + "</a>");
    if (CFG.phone) reach.push("<a href='tel:" + esc(String(CFG.phone).replace(/[^\d+]/g, "")) + "'>" + esc(CFG.phone) + "</a>");
    addMsg("bot", "🎉 <b>Thank you, " + esc(name) + "!</b><br>Our team will contact you shortly." +
      (reach.length ? "<br>In a hurry? " + reach.join(" · ") : ""));
    scrollBottom();
  }

  /* ---------- open / close ---------- */
  function openPanel() {
    panel.classList.add("open");
    fab.style.display = "none";
    if (state.done) resetChat();
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
    if (state.done) resetChat();
  }
  function resetChat() {
    body.innerHTML = "";
    state = freshState();
    ctaBtn = null;
    inputRow.style.display = "none";
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
