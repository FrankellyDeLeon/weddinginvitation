// Deploy in a NEW Apps Script project. Do not change the QR upload project.
const GALLERY_FOLDER_ID = "1_v_br_knfrxQOtMWxAdW1LjiCLGNE6RO";

function doGet(e) {
  try {
    return json_(listGallery_((e && e.parameter) || {}));
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: String((error && error.message) || error) });
  }
}

function listGallery_(parameters) {
  if (!GALLERY_FOLDER_ID || !/^[a-zA-Z0-9_-]+$/.test(GALLERY_FOLDER_ID)) {
    throw new Error("Configure the curated gallery folder ID.");
  }
  const filter = parameters.filter || "all";
  if (["all", "photos", "videos"].indexOf(filter) === -1) {
    throw new Error("Invalid gallery filter.");
  }
  const mediaQuery = filter === "photos"
    ? "mimeType contains 'image/'"
    : filter === "videos"
      ? "mimeType contains 'video/'"
      : "(mimeType contains 'image/' or mimeType contains 'video/')";
  const query = "'" + GALLERY_FOLDER_ID + "' in parents and trashed = false and " + mediaQuery;
  let url = "https://www.googleapis.com/drive/v3/files"
    + "?q=" + encodeURIComponent(query)
    + "&pageSize=60&orderBy=name"
    + "&fields=" + encodeURIComponent("nextPageToken,files(id,name,mimeType,size,thumbnailLink,capabilities(canDownload))")
    + "&supportsAllDrives=true&includeItemsFromAllDrives=true";
  if (parameters.pageToken) {
    url += "&pageToken=" + encodeURIComponent(parameters.pageToken);
  }
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });
  if (response.getResponseCode() !== 200) {
    console.error("Gallery listing failed: " + response.getContentText());
    throw new Error("We could not load the wedding gallery. Please try again later.");
  }
  const result = JSON.parse(response.getContentText());
  return {
    ok: true,
    folderUrl: "https://drive.google.com/drive/folders/" + GALLERY_FOLDER_ID,
    nextPageToken: result.nextPageToken || "",
    files: (result.files || []).map(function (file) {
      return {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size || "0",
        thumbnailUrl: file.thumbnailLink || "",
        canDownload: Boolean(file.capabilities && file.capabilities.canDownload),
      };
    }),
  };
}

function json_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function authorizeGallery() {
  const result = listGallery_({});
  Logger.log("Gallery ready: " + result.folderUrl);
  Logger.log("Media files in first page: " + result.files.length);
}
