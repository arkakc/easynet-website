/**
 * ============================================================
 * Easynet IT Solutions — Lead capture into this Google Sheet
 * ============================================================
 * Receives contact-form enquiries (and WhatsApp leads) as JSON
 * POSTs from the website backends and appends each one as a row
 * in the "Leads" tab of THIS spreadsheet, with a sequence number.
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
 * ============================================================ */

var SHEET_NAME = "Leads";

/** Must equal the SHEETS_SECRET env var on the website backend. */
var SHARED_SECRET = "CHANGE-ME-to-a-long-random-string";

var HEADERS = [
  "sequence_no", "timestamp", "source", "name", "company", "email",
  "phone", "service", "message", "page", "user_agent", "raw",
];

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
    var seq = appendLead_(body);
    return json_({ ok: true, seq: seq });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** Health check — open the /exec URL in a browser to verify the deployment. */
function doGet() {
  return json_({ ok: true, service: "easynet-lead-capture", sheet: SHEET_NAME });
}

/* ---------- core ---------- */

/** Appends one lead row and returns its sequence number. */
function appendLead_(body) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000); // serialise appends so sequence numbers stay unique
  try {
    var sheet = getOrCreateSheet_();
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);

    // Header occupies row 1 → the next empty row number == data-row count + 1
    var seq = sheet.getLastRow();

    if (!body.timestamp) {
      body.timestamp = Utilities.formatDate(
        new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss"
      );
    }
    sheet.appendRow(HEADERS.map(function (h) {
      var v = body[h];
      return v === undefined || v === null ? "" : String(v).slice(0, 5000);
    }));
    return seq;
  } finally {
    lock.releaseLock();
  }
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
  var seq = appendLead_({
    source: "test",
    name: "Test Person",
    company: "Test Co",
    email: "test@example.com",
    phone: "+675 7000 0000",
    service: "Setup test",
    message: "If you can read this row, lead capture works. You can delete it.",
  });
  Logger.log("Appended test lead with sequence_no = %s", seq);
}
