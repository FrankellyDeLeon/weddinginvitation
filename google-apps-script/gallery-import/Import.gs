// One-time import: copies the photographer's pCloud public folder into the gallery Drive folder.
// Deploy in its OWN Apps Script project (not the gallery or QR upload project).
// Run startImport() once; it keeps going in the background every 10 minutes until done.

const PCLOUD_CODE = "kZeTFX7ZpEJ0L8RFcPjWPyj4sfaqam4N3wek";
const PCLOUD_API = "https://eapi.pcloud.com";
const GALLERY_FOLDER_ID = "1_v_br_knfrxQOtMWxAdW1LjiCLGNE6RO";
const INCLUDE_VIDEOS = true;
// Must be a multiple of 256 KB and below Apps Script's 50 MB response limit.
const CHUNK_SIZE = 32 * 1024 * 1024;
const MAX_RUN_MS = 4.5 * 60 * 1000;
const STATE_KEY = "inProgressUpload";

function startImport() {
  const files = listSourceFiles_();
  const existing = listExistingNames_();
  const remaining = files.filter((file) => !existing[file.name]);
  const neededBytes = remaining.reduce((sum, file) => sum + file.size, 0);

  const limit = DriveApp.getStorageLimit();
  const used = DriveApp.getStorageUsed();
  if (limit > 0 && limit - used < neededBytes) {
    throw new Error(
      "Not enough Google Drive storage. Needed: " + gb_(neededBytes) +
      ", free: " + gb_(limit - used) + ". Free up space or upgrade storage, then run again."
    );
  }

  stopImport();
  ScriptApp.newTrigger("importBatch").timeBased().everyMinutes(10).create();
  Logger.log("Importing " + remaining.length + " files (" + gb_(neededBytes) + "). Running first batch now...");
  importBatch();
}

function importBatch() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return;
  }
  const startedAt = Date.now();
  try {
    const files = listSourceFiles_();
    const existing = listExistingNames_();
    let copied = 0;

    for (const file of files) {
      if (existing[file.name]) {
        continue;
      }
      if (Date.now() - startedAt > MAX_RUN_MS) {
        break;
      }
      const finished = copyFile_(file, startedAt);
      if (!finished) {
        break;
      }
      existing[file.name] = true;
      copied += 1;
    }

    const remaining = files.filter((file) => !existing[file.name]).length;
    Logger.log("Copied " + copied + " files this run. Remaining: " + remaining + " of " + files.length + ".");
    if (remaining === 0) {
      stopImport();
      Logger.log("Import complete.");
    }
  } finally {
    lock.releaseLock();
  }
}

function importStatus() {
  const files = listSourceFiles_();
  const existing = listExistingNames_();
  const done = files.filter((file) => existing[file.name]).length;
  const running = ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === "importBatch");
  Logger.log(done + " of " + files.length + " files copied. Background import " +
    (running ? "running." : "not running."));
}

function stopImport() {
  ScriptApp.getProjectTriggers()
    .filter((trigger) => trigger.getHandlerFunction() === "importBatch")
    .forEach((trigger) => ScriptApp.deleteTrigger(trigger));
}

// Returns true when the file is fully copied, false if time ran out (it resumes next run).
function copyFile_(file, startedAt) {
  const props = PropertiesService.getScriptProperties();
  let state = JSON.parse(props.getProperty(STATE_KEY) || "null");
  if (!state || state.fileid !== file.fileid) {
    if (file.size <= CHUNK_SIZE) {
      const blob = fetchOk_(downloadUrl_(file.fileid)).getBlob().setName(file.name);
      DriveApp.getFolderById(GALLERY_FOLDER_ID).createFile(blob);
      return true;
    }
    state = { fileid: file.fileid, uploadUrl: startResumableUpload_(file), offset: 0 };
    props.setProperty(STATE_KEY, JSON.stringify(state));
  }

  const sourceUrl = downloadUrl_(file.fileid);
  while (state.offset < file.size) {
    if (Date.now() - startedAt > MAX_RUN_MS) {
      return false;
    }
    const end = Math.min(state.offset + CHUNK_SIZE, file.size) - 1;
    const bytes = fetchOk_(sourceUrl, { headers: { Range: "bytes=" + state.offset + "-" + end } }).getContent();
    const response = UrlFetchApp.fetch(state.uploadUrl, {
      method: "put",
      contentType: "application/octet-stream",
      headers: { "Content-Range": "bytes " + state.offset + "-" + (state.offset + bytes.length - 1) + "/" + file.size },
      payload: bytes,
      muteHttpExceptions: true,
    });
    const code = response.getResponseCode();
    if (code !== 308 && code !== 200 && code !== 201) {
      props.deleteProperty(STATE_KEY);
      throw new Error("Upload of " + file.name + " failed (" + code + "): " + response.getContentText());
    }
    state.offset += bytes.length;
    props.setProperty(STATE_KEY, JSON.stringify(state));
  }
  props.deleteProperty(STATE_KEY);
  return true;
}

function startResumableUpload_(file) {
  const response = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true",
    {
      method: "post",
      contentType: "application/json; charset=UTF-8",
      headers: {
        Authorization: "Bearer " + ScriptApp.getOAuthToken(),
        "X-Upload-Content-Type": file.contentType,
        "X-Upload-Content-Length": String(file.size),
      },
      payload: JSON.stringify({ name: file.name, mimeType: file.contentType, parents: [GALLERY_FOLDER_ID] }),
      muteHttpExceptions: true,
    }
  );
  const headers = response.getAllHeaders();
  const uploadUrl = headers.Location || headers.location;
  if (response.getResponseCode() !== 200 || !uploadUrl) {
    throw new Error("Could not start upload of " + file.name + ": " + response.getContentText());
  }
  return uploadUrl;
}

function listSourceFiles_() {
  const data = JSON.parse(fetchOk_(PCLOUD_API + "/showpublink?code=" + PCLOUD_CODE).getContentText());
  if (data.result !== 0) {
    throw new Error("pCloud link error: " + (data.error || data.result));
  }
  const files = [];
  (function walk(item) {
    if (item.isfolder) {
      (item.contents || []).forEach(walk);
      return;
    }
    const type = String(item.contenttype || "");
    if (type.indexOf("image/") === 0 || (INCLUDE_VIDEOS && type.indexOf("video/") === 0)) {
      files.push({ fileid: item.fileid, name: item.name, size: Number(item.size), contentType: type });
    }
  })(data.metadata);
  return files.sort((a, b) => (a.name < b.name ? -1 : 1));
}

function downloadUrl_(fileid) {
  const data = JSON.parse(
    fetchOk_(PCLOUD_API + "/getpublinkdownload?code=" + PCLOUD_CODE + "&fileid=" + fileid).getContentText()
  );
  if (data.result !== 0) {
    throw new Error("pCloud download error: " + (data.error || data.result));
  }
  return "https://" + data.hosts[0] + data.path;
}

function listExistingNames_() {
  const names = {};
  let pageToken = "";
  do {
    const url = "https://www.googleapis.com/drive/v3/files"
      + "?q=" + encodeURIComponent("'" + GALLERY_FOLDER_ID + "' in parents and trashed = false")
      + "&pageSize=1000&fields=" + encodeURIComponent("nextPageToken,files(name)")
      + "&supportsAllDrives=true&includeItemsFromAllDrives=true"
      + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const result = JSON.parse(fetchOk_(url, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    }).getContentText());
    (result.files || []).forEach((file) => { names[file.name] = true; });
    pageToken = result.nextPageToken || "";
  } while (pageToken);
  return names;
}

function fetchOk_(url, options) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      Utilities.sleep(2000 * attempt);
    }
    const response = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, options || {}));
    const code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return response;
    }
    lastError = new Error("Request failed (" + code + "): " + response.getContentText().slice(0, 500));
  }
  throw lastError;
}

function gb_(bytes) {
  return (bytes / 1e9).toFixed(1) + " GB";
}
