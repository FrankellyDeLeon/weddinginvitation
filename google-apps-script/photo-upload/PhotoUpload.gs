// Wedding photo upload endpoint.
// Deploy this file as its OWN Apps Script project (separate from the RSVP Code.gs),
// see PHOTO-UPLOAD-SETUP.md in the repository root.
// appsscript.json holds the required scopes and web app settings (used by clasp).

const PHOTO_FOLDER_ID = "19Avm1YQFreAAk0w1O_PePsc0wHtEqJK4";
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB
const ALLOWED_MIME_PREFIXES = ["image/", "video/"];
const DRIVE_UPLOAD_URL_PREFIX = "https://www.googleapis.com/upload/drive/";

function doGet() {
  return json_({
    ok: true,
    message: "Wedding photo upload endpoint is live.",
  });
}

function doPost(e) {
  try {
    const request = JSON.parse((e && e.postData && e.postData.contents) || "{}");

    if (request.action === "start") {
      return json_(startUpload_(request));
    }
    if (request.action === "chunk") {
      return json_(uploadChunk_(request));
    }
    throw new Error("Unknown action.");
  } catch (error) {
    return json_({ ok: false, error: String((error && error.message) || error) });
  }
}

// Creates a Drive resumable upload session and returns its URL to the browser.
function startUpload_(request) {
  const size = Number(request.size);
  const mimeType = String(request.mimeType || "application/octet-stream");

  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("The file is empty.");
  }
  if (size > MAX_FILE_SIZE_BYTES) {
    throw new Error("The file is too large.");
  }
  if (!ALLOWED_MIME_PREFIXES.some((prefix) => mimeType.indexOf(prefix) === 0)) {
    throw new Error("Only photos and videos can be uploaded.");
  }

  const folder = getFolder_();
  const name = buildFileName_(request.fileName, request.guestName);

  const response = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(size),
      },
      payload: JSON.stringify({
        name: name,
        mimeType: mimeType,
        parents: [folder.getId()],
        description: request.guestName ? "Uploaded by " + sanitize_(request.guestName, 80) : "",
      }),
      muteHttpExceptions: true,
    }
  );

  const code = response.getResponseCode();
  const headers = response.getAllHeaders();
  const uploadUrl = headers.Location || headers.location;
  if (code !== 200 || !uploadUrl) {
    throw new Error("Could not start upload (" + code + "): " + response.getContentText());
  }

  return { ok: true, uploadUrl: uploadUrl };
}

// Forwards one chunk (base64) to the Drive resumable upload session.
function uploadChunk_(request) {
  const uploadUrl = String(request.uploadUrl || "");
  if (uploadUrl.indexOf(DRIVE_UPLOAD_URL_PREFIX) !== 0) {
    throw new Error("Invalid upload session.");
  }

  const start = Number(request.start);
  const total = Number(request.total);
  const bytes = Utilities.base64Decode(String(request.data || ""));
  if (!bytes.length) {
    throw new Error("Empty chunk.");
  }
  const end = start + bytes.length - 1;

  const response = UrlFetchApp.fetch(uploadUrl, {
    method: "put",
    contentType: "application/octet-stream",
    headers: { "Content-Range": "bytes " + start + "-" + end + "/" + total },
    payload: bytes,
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code === 308) {
    return { ok: true, done: false };
  }
  if (code === 200 || code === 201) {
    const file = JSON.parse(response.getContentText());
    return { ok: true, done: true, fileId: file.id };
  }
  throw new Error("Chunk upload failed (" + code + "): " + response.getContentText());
}

function getFolder_() {
  if (!PHOTO_FOLDER_ID || PHOTO_FOLDER_ID.indexOf("PASTE_YOUR") === 0) {
    throw new Error("PHOTO_FOLDER_ID is not configured in PhotoUpload.gs.");
  }
  return DriveApp.getFolderById(PHOTO_FOLDER_ID);
}

function buildFileName_(fileName, guestName) {
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd-HHmmss");
  const guest = sanitize_(guestName, 40);
  const original = sanitize_(fileName, 120) || "photo";
  return [stamp, guest, original].filter(Boolean).join("_");
}

function sanitize_(value, maxLength) {
  return String(value || "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
    .trim()
    .slice(0, maxLength);
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON
  );
}

// Run once from the Apps Script editor to grant Drive + external request permissions
// and confirm the folder ID is correct. Creating (and trashing) a test file makes
// Apps Script request full Drive write access, which the upload API calls need.
function authorizePhotoUpload() {
  const folder = getFolder_();
  folder.createFile("upload-permission-check.txt", "ok").setTrashed(true);
  UrlFetchApp.fetch("https://www.googleapis.com/drive/v3/about?fields=user", {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
  });
  Logger.log("Photos will be saved to: " + folder.getName() + " (" + folder.getUrl() + ")");
}
