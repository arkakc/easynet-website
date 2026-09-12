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

/** Must equal the SHEETS_SECRET env var on the website backend. */
var SHARED_SECRET = "easynet-live-Xk92mPq7Rw43Tz";

/**
 * Column headings the team sees in the Sheet, in order. FIELDS holds
 * the matching JSON keys sent by the website backends — keep the two
 * arrays the same length and order.
 */
var HEADERS = [
  "Ref No.",      // 1  sequence number, assigned here (shared by all channels)
  "Date & Time",  // 2  when the lead was captured
  "Source",       // 3  "Website form" / "WhatsApp chat" / "WhatsApp"
  "Name",         // 4  ┐
  "Phone",        // 5  │ the 6 enquiry fields from the chat / contact form
  "Email",        // 6  │ (optional fields are simply left blank)
  "Company",      // 7  │
  "Service",      // 8  │
  "Message",      // 9  ┘
  "Page URL",     // 10 page the lead came from
  "User Agent",   // 11 browser (contact form only)
  "Details"       // 12 raw payload / full WhatsApp text
];
var FIELDS = [
  "sequence_no", "timestamp", "source", "name", "phone", "email", "company",
  "service", "message", "page", "user_agent", "raw"
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

/* ---------- Web app entry points ---------- */

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!body || typeof body !== "object") {
      return json_({ ok: false, error: "bad json" });
    }
    if (SHARED_SECRET && body.secret !== SHARED_SECRET) {
      return json_({ ok: false, error: "unauthorized" });
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

/** Health check — open the /exec URL in a browser to verify the deployment. */
function doGet() {
  return json_({
    ok: true,
    service: "easynet-lead-capture",
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

    // Header occupies row 1 → the next empty row number == data-row count + 1
    var seq = sheet.getLastRow();
    body.sequence_no = seq; // write the computed number into the row itself

    if (!body.timestamp) {
      body.timestamp = Utilities.formatDate(
        new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"
      );
    }
    if (body.source) {
      body.source = SOURCE_LABELS[String(body.source)] || String(body.source);
    }
    sheet.appendRow(FIELDS.map(function (key) {
      var v = body[key];
      return v === undefined || v === null ? "" : String(v).slice(0, 5000);
    }));
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
 * Only the fields present in the request are written, so an empty/skipped
 * answer never erases what is already in the row.
 */
function updateLead_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ref = String(body.ref != null ? body.ref : body.sequence_no || "").trim();
    if (!ref) throw new Error("update needs the lead's ref");

    var sheet = getOrCreateSheet_();
    ensureHeaders_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("no leads in the sheet yet (ref " + ref + ")");

    // Find the row whose "Ref No." column holds this reference.
    var refs = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var row = -1;
    for (var i = 0; i < refs.length; i++) {
      if (String(refs[i][0]).trim() === ref) { row = i + 2; break; }
    }
    if (row === -1) throw new Error("unknown ref " + ref);

    // Columns the chat is allowed to fill in later — never the Ref No.,
    // the original date/time or the channel.
    var updatable = ["name", "phone", "email", "company", "service", "message",
                     "page", "user_agent", "raw"];
    FIELDS.forEach(function (key, idx) {
      if (updatable.indexOf(key) === -1) return;
      var v = body[key];
      if (v === undefined || v === null || String(v).trim() === "") return; // keep what's there
      sheet.getRange(row, idx + 1).setValue(String(v).slice(0, 5000));
    });
    return parseInt(ref, 10) || ref;
  } finally {
    lock.releaseLock();
  }
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
