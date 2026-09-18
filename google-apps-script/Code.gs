/**
 * ============================================================
 * Easynet IT Solutions — Lead capture into this Google Sheet
 * ============================================================
 * Receives leads as JSON POSTs from the website backends and
 * appends each one as a row in the "Leads" tab of THIS
 * spreadsheet, with a reference (sequence) number:
 *
 *   • Website enquiry form   → source "Website form"
 *   • WhatsApp chat widget   → source "WhatsApp chat"
 *     Saved in two moments, exactly as the chat runs:
 *       1. the client sends their PHONE NUMBER (name + phone are
 *          the row's first two data fields) → a row is created
 *          with its Ref No.
 *       2. at the end of the chat every remaining answer (email,
 *          company, service) is written into that same row, under
 *          its own column, with
 *              { action: "update", ref: <Ref No.>, … }
 *
 * ── ONE-TIME SETUP (about 3 minutes) ─────────────────────────
 * 1. Create a Google Sheet, e.g. "Easynet — Website Enquiries".
 * 2. In the Sheet: Extensions → Apps Script, delete the sample
 *    code and paste this whole file.
 * 3. Change SHARED_SECRET below to a long random string. It must
 *    match the SHEETS_SECRET environment variable used by the
 *    website backend (Vercel / server.py / whatsapp server).
 * 4. Deploy → New deployment → gear icon → "Web app"
 *      Description : Easynet lead capture
 *      Execute as  : Me
 *      Who has access: Anyone            ← required
 *    Click Deploy and authorise the script (it only touches this
 *    spreadsheet).
 * 5. Copy the Web app URL (ends in /exec) and set it as the
 *    SHEETS_WEBAPP_URL environment variable on the backend(s).
 * 6. Optional: run testAppend() from the editor once to confirm
 *    a row lands in the "Leads" tab.
 *
 * NOTE: if the sheet was created by an earlier version of this
 * script, the column headings are upgraded automatically on the
 * next write (old rows are re-ordered to the new column order —
 * nothing is deleted).
 * ============================================================ */

var SHEET_NAME = "Leads";

/** All "Date & Time" values are stored in PNG time (Pacific/Port_Moresby, UTC+10),
    no matter which backend sent the lead or in what timezone. */
var PNG_TZ = "Pacific/Port_Moresby";

/** Converts an incoming timestamp (e.g. the ISO/UTC string from the website)
    to PNG local time; with no value it uses the current time. */
function pngTimestamp_(value) {
  var d = value ? new Date(value) : new Date();
  if (isNaN(d.getTime())) d = new Date(); // unparsable input → fall back to now
  return Utilities.formatDate(d, PNG_TZ, "yyyy-MM-dd HH:mm:ss");
}

/** Must equal the SHEETS_SECRET env var on the website backend. */
var SHARED_SECRET = "easynet-live-Xk92mPq7Rw43Tz";

/**
 * Column headings the team sees in the Sheet, in order. FIELDS holds
 * the matching JSON keys sent by the website backends — keep the two
 * arrays the same length and order.
 */
var HEADERS = [
  "Ref No.",      // 1  sequence number, assigned here (shared by all channels)
  "Lead ID",      // 2  anonymous chat-session id — both saves of one chat carry
                  //     it, so the second save always finds the SAME row
  "Date & Time",  // 3  when the lead was captured (PNG time, UTC+10)
  "Source",       // 4  "Website form" / "WhatsApp chat" / "WhatsApp"
  "Name",         // 5  ┐
  "Phone",        // 6  │ the 6 enquiry fields from the chat / contact form
  "Email",        // 7  │ (optional fields are simply left blank)
  "Company",      // 8  │
  "Service",      // 9  │
  "Message",      // 10 ┘
  "Page URL",     // 11 page the lead came from
  "User Agent",   // 12 browser (contact form only)
  "Details"       // 13 raw payload / full WhatsApp text
];
var FIELDS = [
  "sequence_no", "lead_id", "timestamp", "source", "name", "phone", "email",
  "company", "service", "message", "page", "user_agent", "raw"
];

/** Headings used by earlier versions — mapped so old sheets upgrade in place. */
var LEGACY_FIELDS = [
  "sequence_no", "timestamp", "source", "name", "company", "email", "phone",
  "service", "message", "page", "user_agent", "raw"
];

/** Human-readable channel names stored in the "Source" column. */
var SOURCE_LABELS = {
  "website": "Website form",
  "whatsapp-chat": "WhatsApp chat",
  "whatsapp-chat-widget": "WhatsApp chat",
  "whatsapp": "WhatsApp",
  "test": "Test"
};

/* ---------- NEW-LEAD WHATSAPP NOTIFICATION ---------- */
/**
 * Whenever a new Ref No. is added to the Leads sheet, a WhatsApp message
 * with the lead's details is sent to a fixed number (e.g. the owner's).
 *
 * TWO WAYS TO SWITCH IT ON (run once from the Apps Script editor):
 *
 *  A) Official Meta WhatsApp Cloud API:
 *       setWhatsAppSettings("cloud-api", "67571234567", "YOUR_META_TOKEN", "YOUR_PHONE_NUMBER_ID")
 *     • Sends from your WhatsApp Business number.
 *     • Meta only delivers free-form messages to a number that wrote to you
 *       in the last 24 hours. For an always-works notification create an
 *       APPROVED TEMPLATE with 4 body variables ({{1}} Ref, {{2}} Name,
 *       {{3}} Phone, {{4}} Service), then store it as the 5th argument:
 *         setWhatsAppSettings("cloud-api", "67571234567", "TOKEN", "PHONE_ID", "new_lead_alert")
 *
 *  B) CallMeBot (simplest — message to your OWN personal number):
 *       1. On your phone, WhatsApp "I allow callmebot to send me messages"
 *          to +34 621 331 709 and receive your API key.
 *       2. setWhatsAppSettings("callmebot", "67571234567", "YOUR_API_KEY")
 *
 *  Then run:  installNewLeadTrigger()   ← creates the automatic trigger
 *  Then test: testNewLeadNotification() ← sends a sample message now
 *
 * Settings are stored in Script Properties, so they SURVIVE pasting a
 * newer version of this file. removeNewLeadTriggers() undoes the trigger.
 */

var NOTIFY_KEYS = {
  mode: "notify.mode",        // "cloud-api" | "callmebot"
  admin: "notify.admin",      // recipient digits with country code, e.g. 67571234567
  token: "notify.token",      // cloud-api: Meta access token | callmebot: API key
  phoneId: "notify.phone_id", // cloud-api only: WhatsApp business phone number ID
  template: "notify.template",// cloud-api only: optional approved template name
  lastRef: "notify.last_ref"  // last Ref No. we already notified (dedupe)
};

/** One-time setup helper — run from the editor. Example:
    setWhatsAppSettings("callmebot", "67571234567", "123456") */
function setWhatsAppSettings(mode, adminNumber, token, phoneId, template) {
  var props = PropertiesService.getScriptProperties();
  mode = String(mode || "").trim();
  adminNumber = String(adminNumber || "").replace(/[^\d]/g, "");
  if (["cloud-api", "callmebot"].indexOf(mode) === -1) {
    throw new Error('mode must be "cloud-api" or "callmebot"');
  }
  if (adminNumber.length < 8) throw new Error("adminNumber must include the country code, e.g. 67571234567");
  props.setProperty(NOTIFY_KEYS.mode, mode);
  props.setProperty(NOTIFY_KEYS.admin, adminNumber);
  props.setProperty(NOTIFY_KEYS.token, String(token || ""));
  props.setProperty(NOTIFY_KEYS.phoneId, String(phoneId || ""));
  props.setProperty(NOTIFY_KEYS.template, String(template || ""));
  Logger.log("Saved ✔  mode=%s → %s | token=…%s | phoneId=%s | template=%s",
    mode, mask_(adminNumber), mask_(String(token || "")), phoneId || "-", template || "-");
}

function mask_(s) { return s.length <= 4 ? "****" : "****" + s.slice(-4); }

/** Reads the stored settings; null when not configured yet. */
function getNotifyCfg_() {
  var p = PropertiesService.getScriptProperties().getProperty.bind(
          PropertiesService.getScriptProperties());
  var mode = p(NOTIFY_KEYS.mode);
  var admin = p(NOTIFY_KEYS.admin);
  if (!mode || !admin) return null;
  return {
    mode: mode, admin: admin, token: p(NOTIFY_KEYS.token) || "",
    phoneId: p(NOTIFY_KEYS.phoneId) || "", template: p(NOTIFY_KEYS.template) || ""
  };
}

/** Run ONCE: creates the automatic trigger that fires when a row is added. */
function installNewLeadTrigger() {
  removeNewLeadTriggers();
  ScriptApp.newTrigger("onNewLeadChange")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  Logger.log("✔ Automatic new-lead trigger installed. You will now get a WhatsApp message for every new Ref No.");
}

/** Removes the automatic trigger(s) if you ever want to stop the messages. */
function removeNewLeadTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction && t.getHandlerFunction() === "onNewLeadChange") {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/** Installable trigger entry point — fires on any structural sheet change. */
function onNewLeadChange(e) {
  try {
    if (!e || e.changeType !== "INSERT_ROW") return;
    var ss = (e && e.source) || SpreadsheetApp.getActive();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) return;
    notifyNewLeadForRow_(sheet, sheet.getLastRow());
  } catch (err) {
    console.error("[notify] trigger: " + (err && err.message));
  }
}

/** Sends the notification for one row — skips silently if already notified
    (the row's Ref No. must be greater than the last one we announced). */
function notifyNewLeadForRow_(sheet, rowNumber) {
  var cfg = getNotifyCfg_();
  if (!cfg) return; // not configured yet — lead saving is never blocked

  var ref = String(sheet.getRange(rowNumber, 1).getValue()).trim();
  if (!/^\d+$/.test(ref)) return; // not a data row (or header/blank insert)

  var props = PropertiesService.getScriptProperties();
  var lastRef = parseInt(props.getProperty(NOTIFY_KEYS.lastRef) || "0", 10);
  if (parseInt(ref, 10) <= lastRef) return; // already announced (trigger + direct call both fire)
  props.setProperty(NOTIFY_KEYS.lastRef, ref);

  var values = sheet.getRange(rowNumber, 1, 1, FIELDS.length).getValues()[0];
  var d = {};
  FIELDS.forEach(function (key, i) { d[key] = values[i] == null ? "" : String(values[i]).trim(); });

  var msg = "🔔 *New Lead — Ref No. " + ref + "*\n" +
    (d.name ? "👤 " + d.name + "\n" : "") +
    (d.phone ? "📞 " + d.phone + "\n" : "") +
    (d.service ? "🛠 " + d.service + "\n" : "") +
    (d.company ? "🏢 " + d.company + "\n" : "") +
    (d.email ? "✉️ " + d.email + "\n" : "") +
    (d.page ? "📄 " + d.page + "\n" : "") +
    (d.timestamp ? "🕒 " + d.timestamp + " (PNG)" : "");

  try {
    if (cfg.mode === "callmebot") {
      waSendCallmebot_(cfg, msg);
    } else {
      waSendCloud_(cfg, msg, ref, d);
    }
    console.log("[notify] Ref No. " + ref + " sent to …" + mask_(cfg.admin));
  } catch (err) {
    console.error("[notify] Ref No. " + ref + " FAILED: " + (err && err.message));
  }
}

/** Official Meta WhatsApp Cloud API (free-form text or approved template). */
function waSendCloud_(cfg, text, ref, d) {
  var payload;
  if (cfg.template) {
    payload = {
      messaging_product: "whatsapp", to: cfg.admin, type: "template",
      template: {
        name: cfg.template, language: { code: "en" },
        components: [{ type: "body", parameters: [
          { type: "text", text: String(ref) },
          { type: "text", text: (d && d.name) || "-" },
          { type: "text", text: (d && d.phone) || "-" },
          { type: "text", text: (d && d.service) || "-" }
        ]}]
      }
    };
  } else {
    payload = { messaging_product: "whatsapp", to: cfg.admin, type: "text", text: { body: text } };
  }
  var resp = UrlFetchApp.fetch(
    "https://graph.facebook.com/v20.0/" + cfg.phoneId + "/messages", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + cfg.token },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  var body = resp.getContentText();
  if (resp.getResponseCode() >= 300) {
    if (body.indexOf("13247") !== -1 || body.indexOf("template") !== -1) {
      throw new Error('Meta refused the message (24h window). Either message your business number once from the admin phone, or create an approved template and store its name as the 5th argument of setWhatsAppSettings.');
    }
    throw new Error("Meta API " + resp.getResponseCode() + ": " + body.slice(0, 200));
  }
}

/** CallMeBot — free notifications to your own WhatsApp number. */
function waSendCallmebot_(cfg, text) {
  var url = "https://api.callmebot.com/whatsapp.php?phone=%2B" + cfg.admin +
    "&text=" + encodeURIComponent(text) + "&apikey=" + encodeURIComponent(cfg.token);
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() >= 300) {
    throw new Error("CallMeBot HTTP " + resp.getResponseCode() + " — check the API key / allowed number");
  }
}

/** Run from the editor to send a sample notification to yourself. */
function testNewLeadNotification() {
  var cfg = getNotifyCfg_();
  if (!cfg) throw new Error('Not configured yet — run setWhatsAppSettings(...) first (see the notes above).');
  var msg = "🔔 *New Lead — Ref No. 1 (TEST)*\n👤 Test Person\n📞 +675 7000 0000\n🛠 Setup test\n🕒 " +
    Utilities.formatDate(new Date(), PNG_TZ, "yyyy-MM-dd HH:mm:ss") + " (PNG)";
  if (cfg.mode === "callmebot") waSendCallmebot_(cfg, msg);
  else waSendCloud_(cfg, msg, 1, { name: "Test Person", phone: "+675 7000 0000", service: "Setup test" });
  Logger.log("✔ Test message sent — check the admin WhatsApp.");
}

/* ---------- Web app entry points ---------- */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!body || typeof body !== "object") {
      return json_({ ok: false, error: "bad json" });
    }
    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return json_({ ok: false,
        error: "unauthorized: secret mismatch - SHARED_SECRET in Code.gs must equal the SHEETS_SECRET env var on the backend" });
    }
    /* An existing lead is completed as the chat continues: the widget saves
       name + phone first (creating the row + Ref No.) and then writes the
       answers that follow — email, company, service — into the SAME row,
       each one under its own column. */
    if (body.action === "update" || body.update === true) {
      var updated = updateLead_(body);
      return json_({ ok: true, ref: updated, seq: updated, updated: true });
    }
    var seq = appendLead_(body);
    return json_({ ok: true, ref: seq, seq: seq });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** Health check — open the /exec URL in a browser to verify the deployment.
    VERSION lets you confirm THIS code (not an older deployment) is live. */
var VERSION = "2026-09-18 lead-id-upsert";
function doGet() {
  return json_({
    ok: true,
    service: "easynet-lead-capture",
    version: VERSION,
    sheet: SHEET_NAME,
    columns: HEADERS
  });
}

/* ---------- core ---------- */

/**
 * Appends one lead row and returns its reference (sequence) number.
 * Missing optional fields are written as empty cells.
 */
function appendLead_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // serialise appends so reference numbers stay unique
  try {
    var sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);

    var leadId = String(body.lead_id != null ? body.lead_id : "").trim();

    /* The chat saves each lead in two moments (name + phone first, the rest
       at the end). Both requests carry the same anonymous Lead ID, so if a
       row with this ID already exists the new answers are written into THAT
       row and its existing Ref No. is returned — a duplicate row is never
       appended, even if the first save's Ref No. never reached the browser. */
    if (leadId) {
      var existing = findRowByField_(sheet, "lead_id", leadId);
      if (existing !== -1) {
        writeLeadFields_(sheet, existing, body);
        var existingRef = parseInt(sheet.getRange(existing, 1).getValue(), 10);
        return existingRef || existing;
      }
    }

    // Header occupies row 1 → the next empty row number == data-row count + 1
    var seq = sheet.getLastRow();
    body.sequence_no = seq; // write the computed number into the row itself
    if (leadId) body.lead_id = leadId;

    if (!body.timestamp) {
      body.timestamp = pngTimestamp_(); // current PNG time
    } else {
      body.timestamp = pngTimestamp_(body.timestamp); // convert to PNG time
    }
    if (body.source) {
      body.source = SOURCE_LABELS[String(body.source)] || String(body.source);
    }
    sheet.appendRow(FIELDS.map(function (key) {
      var v = body[key];
      return v === undefined || v === null ? "" : String(v).slice(0, 5000);
    }));

    // 🔔 announce the new lead on WhatsApp (never blocks the save)
    try {
      notifyNewLeadForRow_(sheet, sheet.getLastRow());
    } catch (notifyErr) {
      console.error("[notify] " + (notifyErr && notifyErr.message));
    }
    return seq;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Writes the answers that arrive after the phone number — email, company,
 * service, message — into the row already created for this lead, each one
 * under its own column heading.
 *
 * The row is found by Ref No.; if that fails (e.g. the Ref No. was lost on
 * the way back to the browser), it is found by the chat's Lead ID instead.
 *
 * Only the fields present in the request are written, so an empty/skipped
 * answer never erases what is already in the row.
 */
function updateLead_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ref = String(body.ref != null ? body.ref : body.sequence_no || "").trim();
    var leadId = String(body.lead_id != null ? body.lead_id : "").trim();
    if (!ref && !leadId) throw new Error("update needs the lead's ref or lead id");

    var sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("no leads in the sheet yet (ref " + (ref || leadId) + ")");

    // Find the row: by Ref No. first, then by the chat's Lead ID.
    var row = -1;
    if (ref) row = findRowByField_(sheet, "sequence_no", ref);
    if (row === -1 && leadId) row = findRowByField_(sheet, "lead_id", leadId);
    if (row === -1) throw new Error("unknown lead (ref " + (ref || leadId) + ")");

    writeLeadFields_(sheet, row, body);
    return parseInt(ref, 10) ||
           parseInt(sheet.getRange(row, 1).getValue(), 10) || ref || leadId;
  } finally {
    lock.releaseLock();
  }
}

/** First data row whose given field column equals value → row number, else -1. */
function findRowByField_(sheet, fieldKey, value) {
  var col = FIELDS.indexOf(fieldKey) + 1;
  if (col === 0) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var values = sheet.getRange(2, col, lastRow - 1, 1).getValues();
  var needle = String(value).trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]).trim() === needle) return i + 2;
  }
  return -1;
}

/** Writes the chat's answers (lead_id, name, phone, email, company, service,
    message, page, user agent, raw) into one row, each under its own column.
    Ref No., Date & Time and Source are never touched. Blank/skipped answers
    in the request are skipped too, so nothing already saved is erased. */
function writeLeadFields_(sheet, row, body) {
  var updatable = ["lead_id", "name", "phone", "email", "company", "service",
                   "message", "page", "user_agent", "raw"];
  FIELDS.forEach(function (key, idx) {
    if (updatable.indexOf(key) === -1) return;
    var v = body[key];
    if (v === undefined || v === null || String(v).trim() === "") return;
    sheet.getRange(row, idx + 1).setValue(String(v).slice(0, 5000));
  });
}

/**
 * Makes sure row 1 holds HEADERS. A sheet created by an older version
 * of this script (plain keys as headings) is rewritten in the new
 * column order — existing rows are preserved, only the order of the
 * cells changes, so no lead is ever lost.
 */
function ensureHeaders_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow === 0) {
    sheet.appendRow(HEADERS);
    styleHeader_(sheet);
    return;
  }

  var width = HEADERS.length;
  var current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), width)).getValues()[0];
  var same = true;
  for (var i = 0; i < width; i++) {
    if (String(current[i] || "").trim() !== HEADERS[i]) { same = false; break; }
  }
  if (same) return;

  // Map each existing column to an internal field name (new or legacy).
  var source = [];
  for (var c = 0; c < current.length; c++) {
    var h = String(current[c] || "").trim();
    var field = FIELDS.indexOf(h) !== -1 ? h : (LEGACY_FIELDS.indexOf(h) !== -1 ? h : "");
    source.push(field);
  }

  var body = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, current.length).getValues() : [];
  var rebuilt = body.map(function (row) {
    var record = {};
    source.forEach(function (field, idx) {
      if (field) record[field] = row[idx];
    });
    return FIELDS.map(function (key) {
      var v = record[key];
      return v === undefined || v === null ? "" : v;
    });
  });

  sheet.clear();
  sheet.appendRow(HEADERS);
  if (rebuilt.length) {
    sheet.getRange(2, 1, rebuilt.length, width).setValues(rebuilt);
  }
  styleHeader_(sheet);
}

/** Bold + freeze row 1 so the headings stay visible while scrolling. */
function styleHeader_(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function getOrCreateSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Run from the editor to confirm the Sheet is writable (adds one test row). */
function testAppend() {
  var ref = appendLead_({
    source: "test",
    name: "Test Person",
    company: "Test Co",
    email: "test@example.com",
    phone: "+675 7000 0000",
    service: "Setup test",
    message: "If you can read this row, lead capture works. You can delete it.",
  });
  Logger.log("Appended test lead with Ref No. = %s", ref);
}

/** Run from the editor to test completing an existing lead (uses Ref No. 1). */
function testUpdate() {
  var ref = updateLead_({
    ref: 1,
    email: "completed@example.com",
    company: "Completed Co",
    service: "Managed IT Support",
  });
  Logger.log("Updated Ref No. %s — check that the email/company/service columns filled in.", ref);
}

/** Run from the editor to check/repair the column headings without adding a row. */
function repairHeaders() {
  var sheet = getOrCreateSheet_();
  ensureHeaders_(sheet);
  Logger.log("Columns: %s", HEADERS.join(" | "));
}
