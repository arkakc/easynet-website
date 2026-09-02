/* ============================================================
   Easynet IT Solutions — Site JavaScript
   ============================================================ */

/* ---- Company contact config — update these values in ONE place ---- */
const EASYNET = {
  name: "Easynet IT Solutions Limited",
  email: "hello.easynet@hotmail.com",
  phone: "+675 72743186",             // TODO: replace with the company phone
  whatsapp: "67572743186",               // TODO: replace with the WhatsApp number (country code + number, digits only)
  whatsappMsg: "Hello Easynet IT Solutions! I would like to discuss a technology solution for my business.",
  address: "Port Moresby, Papua New Guinea"
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

/* ---- WhatsApp links: prefill message ---- */
document.querySelectorAll("a[data-whatsapp]").forEach(a => {
  a.href = "https://wa.me/" + EASYNET.whatsapp + "?text=" +
    encodeURIComponent(a.dataset.whatsapp === "1" ? EASYNET.whatsappMsg : (a.dataset.whatsapp || EASYNET.whatsappMsg));
});

/* ---- Header: scroll state ---- */
const header = document.querySelector(".site-header");
const onScroll = () => header && header.classList.toggle("scrolled", window.scrollY > 10);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

/* ---- Mobile menu ---- */
const menuBtn = document.querySelector(".mobile-menu-btn");
const mobileMenu = document.querySelector(".mobile-menu");
if (menuBtn && mobileMenu) {
  menuBtn.addEventListener("click", () => {
    const open = mobileMenu.classList.toggle("open");
    menuBtn.setAttribute("aria-expanded", open);
  });
  mobileMenu.querySelectorAll("a").forEach(a =>
    a.addEventListener("click", () => mobileMenu.classList.remove("open"))
  );
}

/* ---- Hero: parallax background + content on scroll ---- */
const heroBg = document.querySelector(".hero-bg");
const heroInner = document.querySelector(".hero-inner");
if (heroBg && heroInner && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let ticking = false;
  const parallax = () => {
    ticking = false;
    const y = window.scrollY;
    const vh = window.innerHeight;
    if (y < vh * 1.3) {
      heroBg.style.transform = "translate3d(0," + (y * 0.38).toFixed(1) + "px,0)";
      heroInner.style.transform = "translate3d(0," + (y * 0.18).toFixed(1) + "px,0)";
      heroInner.style.opacity = Math.max(0, 1 - y / (vh * 0.95)).toFixed(3);
    }
  };
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(parallax); }
  }, { passive: true });
}

/* ---- Count-up for all [data-count] stats (hero + glance band), on visibility ---- */
const runCounter = el => {
  const target = parseInt(el.dataset.count, 10);
  const suffix = el.dataset.suffix || "";
  const dur = 1500, t0 = performance.now();
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
    el.textContent = Math.round(target * eased) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};
const ioCount = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      setTimeout(() => runCounter(e.target), e.target.closest(".hero") ? 700 : 150);
      ioCount.unobserve(e.target);
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll("[data-count]").forEach(el => ioCount.observe(el));

/* ---- Auto-stagger reveal delays inside grids ---- */
document.querySelectorAll(".grid, .packages, .team-grid, .vm-grid").forEach(parent => {
  const kids = parent.querySelectorAll(":scope > .reveal");
  kids.forEach((el, i) => { el.style.transitionDelay = (i * 80) + "ms"; });
});

/* ---- Scroll progress bar + back-to-top button ---- */
const progressBar = document.querySelector(".scroll-progress");
const backTop = document.querySelector(".back-top");
const onScrollUI = () => {
  const h = document.documentElement;
  const max = h.scrollHeight - h.clientHeight;
  if (progressBar) progressBar.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + "%";
  if (backTop) backTop.classList.toggle("show", h.scrollTop > 600);
};
window.addEventListener("scroll", onScrollUI, { passive: true });
onScrollUI();
if (backTop) backTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

/* ---- FAQ accordion ---- */
document.querySelectorAll(".faq-q").forEach(btn => {
  btn.addEventListener("click", () => {
    const item = btn.closest(".faq-item");
    const ans = item.querySelector(".faq-a");
    const isOpen = item.classList.contains("open");
    document.querySelectorAll(".faq-item.open").forEach(o => {
      if (o !== item) { o.classList.remove("open"); o.querySelector(".faq-a").style.maxHeight = "0"; }
    });
    item.classList.toggle("open", !isOpen);
    ans.style.maxHeight = isOpen ? "0" : ans.scrollHeight + "px";
  });
});

/* ---- Reveal on scroll ---- */
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add("visible"); io.unobserve(e.target); }
  });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

/* ---- Contact form ---- */
const sanitize = v => String(v)
  .replace(/[<>]/g, "")
  .replace(/[\u0000-\u0008\u000B-\u001F]/g, "")
  .trim();
const form = document.getElementById("contact-form");
if (form) {
  // time-trap: record when the page opened (bots submit within milliseconds)
  const openedEl = document.getElementById("page-opened-at");
  if (openedEl) openedEl.value = Date.now();

  form.addEventListener("submit", e => {
    e.preventDefault();
    // honeypot: if a bot filled the hidden field, pretend success and drop it
    const hp = document.getElementById("hp-field");
    if (hp && hp.value.trim() !== "") { e.stopImmediatePropagation(); return; }
    // time-trap: reject submissions faster than a human could complete
    const opened = parseInt(openedEl && openedEl.value, 10);
    if (opened && Date.now() - opened < 4000) return;
    // clear previous error state so animations re-trigger
    form.querySelectorAll(".f-field.invalid").forEach(f => {
      f.classList.remove("invalid");
      void f.offsetWidth;
    });
    let ok = true;
    form.querySelectorAll("[required]").forEach(field => {
      const wrap = field.closest(".f-field");
      const valid = field.value.trim() !== "" &&
        (field.type !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value.trim()));
      wrap.classList.toggle("invalid", !valid);
      if (!valid) ok = false;
    });
    if (!ok) return;

    const raw = Object.fromEntries(new FormData(form).entries());
    const data = {};
    for (const [k, v] of Object.entries(raw)) data[k] = sanitize(v);
    const subject = `Website Enquiry — ${data.service || "General"} (${data.name || ""})`;
    const body =
      `Name: ${data.name}\nCompany: ${data.company || "-"}\nEmail: ${data.email}\nPhone: ${data.phone}\n` +
      `Service Required: ${data.service}\n\nMessage:\n${data.message}\n\n— Sent from ${EASYNET.name} website`;

    // Submit to the backend — only show success when the enquiry is actually saved
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.disabled = true; btn.style.opacity = ".7"; }
    fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(20000)
    })
      .then(r => r.json().catch(() => ({})).then(j => ({ ok: r.ok, json: j })))
      .then(({ ok, json }) => {
        if (ok && json.ok !== false) { showSuccess(json.sequence_no); }
        else { showError(); }
      })
      .catch(() => showError());

    function resetBtn() {
      if (btn) { btn.disabled = false; btn.style.opacity = ""; }
    }

    function showError() {
      resetBtn();
      let errBox = document.getElementById("form-error");
      if (!errBox) {
        errBox = document.createElement("p");
        errBox.id = "form-error";
        errBox.setAttribute("role", "alert");
        errBox.style.cssText = "margin-top:14px;padding:12px 14px;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:14px;text-align:center";
        form.appendChild(errBox);
      }
      errBox.textContent = "Sorry, we couldn't send your enquiry right now. Please try again, or email us directly at " + EASYNET.email + ".";
    }

    function showSuccess(seq) {
      resetBtn();
      form.style.display = "none";
      const s = document.getElementById("form-success");
      if (seq) {
        const h = s.querySelector("h3");
        if (h) h.textContent = "Enquiry Sent! (Ref #" + seq + ")";
      }
      s.classList.add("show");
      s.scrollIntoView({ behavior: "smooth", block: "center" });
      // Fallback: also prepare a mailto link so nothing is lost without a backend
      const mail = document.getElementById("mailto-fallback");
      if (mail) mail.href = "mailto:" + EASYNET.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
    }
  });

  // clear error state while typing
  form.addEventListener("input", e => {
    const wrap = e.target.closest(".f-field");
    if (wrap) wrap.classList.remove("invalid");
  });
}

/* ---- Footer year ---- */
document.querySelectorAll("[data-year]").forEach(el => el.textContent = new Date().getFullYear());

/* ---- View toggle: Desktop View / Mobile View ---- */
(function () {
  var btn = document.createElement("button");
  btn.className = "view-toggle";
  btn.setAttribute("aria-label", "Switch between Desktop and Mobile view");
  btn.title = "Switch to Mobile / Desktop view";
  btn.innerHTML =
    '<svg class="vt-mobile" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>' +
    '<svg class="vt-desktop" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';
  btn.addEventListener("click", function () {
    var isMobile = document.documentElement.classList.toggle("is-mobile");
    document.cookie = "easynet_view=" + (isMobile ? "mobile" : "desktop") + "; path=/; max-age=31536000";
  });
  document.body.appendChild(btn);
})();

/* ---- Generic scroll parallax for [data-parallax] (showcase band, images, 3D cubes) ---- */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var els = document.querySelectorAll("[data-parallax]");
  if (!els.length || reduced) return;
  var ticking = false;
  function update() {
    ticking = false;
    var vh = window.innerHeight;
    els.forEach(function (el) {
      var r = el.parentElement.getBoundingClientRect();
      if (r.bottom < -100 || r.top > vh + 100) return;
      var sp = parseFloat(el.dataset.parallax) || 0.2;
      var sc = parseFloat(el.dataset.scale) || 1;
      var y = ((r.top + r.height / 2) - vh / 2) * -sp;
      el.style.transform = "scale(" + sc + ") translate3d(0," + y.toFixed(1) + "px,0)";
    });
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  update();
})();

/* ---- 3D tilt on hover (cards, packages, stats, team) — pointer devices only ---- */
(function () {
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  if (reduced || !fine) return;
  document.querySelectorAll(".card, .pkg, .glance-item, .member").forEach(function (el) {
    el.addEventListener("mousemove", function (e) {
      var r = el.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = "perspective(750px) rotateX(" + (-y * 5).toFixed(2) + "deg) rotateY(" + (x * 5).toFixed(2) + "deg) translateY(-4px)";
    });
    el.addEventListener("mouseleave", function () { el.style.transform = ""; });
  });
})();

/* ---- Smooth scroll for same-page anchor links (#services, #packages) ---- */
(function(){
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("click", function(e){
    var t = e.target;
    var a = t.closest ? t.closest('a[href^="#"]') : null;
    if(!a) return;
    var id = a.getAttribute("href");
    if(id.length < 2) return;
    var el;
    try { el = document.querySelector(id); } catch(err){ return; }
    if(!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.pushState(null, "", id);
  });
})();
