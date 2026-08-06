const SHEET_NAME = "RSVP";
const SPREADSHEET_ID = "1Cj2k9eOVFuznTmHmFoRQD14IJ04QpQVIgbkYwoHwg48";
const NOTIFICATION_RECIPIENTS = [
  "frankellydeleon@hotmail.com",
  "simibenedikova@gmail.com",
];
const HEADERS = [
  "submitted_at",
  "invitee_name",
  "invitee_email",
  "attendance",
  "accompanying_guest_count",
  "accompanying_guest_names",
  "preferences",
  "admin_notification_status",
  "attendee_confirmation_status",
  "email_error_details",
];

function doGet() {
  return ContentService.createTextOutput(
    JSON.stringify({
      ok: true,
      message:
        "Wedding RSVP endpoint is live. Submit RSVP data with an HTTP POST request.",
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const sheet = getOrCreateSheet_();
  const payload = parsePayload_(e);
  const guests = Array.isArray(payload.accompanyingGuests)
    ? payload.accompanyingGuests.join(", ")
    : "";
  const emailResults = sendEmails_(payload, guests);

  sheet.appendRow([
    payload.submittedAt || new Date().toISOString(),
    payload.inviteeName || "",
    payload.inviteeEmail || "",
    payload.attendance || "",
    Array.isArray(payload.accompanyingGuests) ? payload.accompanyingGuests.length : 0,
    guests,
    payload.preferences || "",
    emailResults.adminStatus,
    emailResults.attendeeStatus,
    emailResults.errorDetails,
  ]);

  return ContentService.createTextOutput(
    JSON.stringify({ ok: true })
  ).setMimeType(ContentService.MimeType.JSON);
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (error) {
      // Fallback to form-encoded payload below.
    }
  }

  if (e && e.parameter && e.parameter.payload) {
    return JSON.parse(e.parameter.payload);
  }

  throw new Error("Missing RSVP payload.");
}

function getOrCreateSheet_() {
  const spreadsheet = getSpreadsheet_();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  } else {
    ensureHeaders_(sheet);
  }

  return sheet;
}

function ensureHeaders_(sheet) {
  const existing = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const sheetHasHeader = existing[0] === "submitted_at";
  const sheetHeaderIsEmpty = existing.every((value) => value === "");

  if (sheetHasHeader || sheetHeaderIsEmpty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }
}

function sendEmails_(payload, guests) {
  const results = {
    adminStatus: "not_sent",
    attendeeStatus: "not_sent",
    errorDetails: "",
  };
  const errors = [];

  try {
    sendRsvpNotification_(payload, guests);
    results.adminStatus = "sent";
  } catch (error) {
    results.adminStatus = "failed";
    errors.push(`admin: ${error.message || error}`);
  }

  try {
    sendAttendeeConfirmation_(payload);
    results.attendeeStatus = "sent";
  } catch (error) {
    results.attendeeStatus = "failed";
    errors.push(`attendee: ${error.message || error}`);
  }

  if (errors.length > 0) {
    results.errorDetails = errors.join(" | ");
  }

  return results;
}

function sendRsvpNotification_(payload, guests) {
  const attendance = payload.attendance || "";
  const guestCount = Array.isArray(payload.accompanyingGuests)
    ? payload.accompanyingGuests.length
    : 0;
  const guestNames = guests || "None";
  const preferences = payload.preferences || "None";
  const inviteeName = payload.inviteeName || "Unknown invitee";
  const inviteeEmail = payload.inviteeEmail || "No email provided";
  const submittedAt = payload.submittedAt || new Date().toISOString();

  const subject = `New wedding RSVP: ${inviteeName}`;
  const body = [
    "A new RSVP was submitted.",
    "",
    `Name: ${inviteeName}`,
    `Email: ${inviteeEmail}`,
    `Attendance: ${attendance}`,
    `Accompanying guests count: ${guestCount}`,
    `Accompanying guests names: ${guestNames}`,
    `Food/drink preferences: ${preferences}`,
    `Submitted at: ${submittedAt}`,
  ].join("\n");

  MailApp.sendEmail({
    to: NOTIFICATION_RECIPIENTS.join(","),
    subject,
    body,
  });
}

function sendAttendeeConfirmation_(payload) {
  const inviteeEmail = (payload.inviteeEmail || "").trim();
  if (!inviteeEmail) {
    throw new Error("Missing attendee email.");
  }

  const inviteeName = payload.inviteeName || "Guest";
  const attendance = (payload.attendance || "").toLowerCase();
  const attendanceLabel = attendance === "yes" ? "Yes" : attendance === "no" ? "No" : payload.attendance || "";

  const subject = "Simona & Frankelly's Wedding RSVP confirmation";
  const body = [
    `Dear ${inviteeName},`,
    "",
    "Thank you for your RSVP.",
    `Your attendance response: ${attendanceLabel}`,
    "",
    "If anything changes, a special request was missed or any other detail, please contact us directly.",
    "",
    "Our contact numbers are:",
    "WhatsApp +48 883 843 438 (Frankelly) / +48 882 366 354 (Simona).",
    "",
    "With love,",
    "Simona & Frankelly",
  ].join("\n");

  MailApp.sendEmail({
    to: inviteeEmail,
    subject,
    body,
  });
}

function getSpreadsheet_() {
  if (SPREADSHEET_ID && !SPREADSHEET_ID.includes("PASTE_YOUR_GOOGLE_SHEET_ID_HERE")) {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  }

  const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!activeSpreadsheet) {
    throw new Error("No active spreadsheet found. Set SPREADSHEET_ID in Code.gs.");
  }

  return activeSpreadsheet;
}

function authorizeRsvpScript_() {
  getSpreadsheet_().getId();
  MailApp.getRemainingDailyQuota();
}

function sendTestEmails_() {
  const testPayload = {
    submittedAt: new Date().toISOString(),
    inviteeName: "RSVP Test User",
    inviteeEmail: "frankellydeleon@hotmail.com",
    attendance: "yes",
    accompanyingGuests: ["Test Guest"],
    preferences: "Test run",
  };

  sendRsvpNotification_(testPayload, "Test Guest");
  sendAttendeeConfirmation_(testPayload);
}

function authorizeRsvpScript() {
  authorizeRsvpScript_();
}

function sendTestEmails() {
  sendTestEmails_();
}
