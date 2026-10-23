const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const backendSource = readFileSync(`${__dirname}/../google-apps-script/gallery/Gallery.gs`, "utf8");

function backend(folderId = "curated-folder", status = 200) {
  const requests = [];
  const context = vm.createContext({
    console: { error() {} },
    ScriptApp: { getOAuthToken: () => "server-only-token" },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text) => ({ setMimeType: () => JSON.parse(text) }),
    },
    UrlFetchApp: {
      fetch(url, options) {
        requests.push({ url: new URL(url), options });
        return {
          getResponseCode: () => status,
          getContentText: () => JSON.stringify({
            nextPageToken: "next/page",
            files: [{
              id: "photo-id", name: "Our wedding.jpg", mimeType: "image/jpeg",
              size: "2000", thumbnailLink: "https://example.com/thumb",
              capabilities: { canDownload: true },
            }],
          }),
        };
      },
    },
  });
  vm.runInContext(
    backendSource.replace(/const GALLERY_FOLDER_ID = "[^"]*";/, `const GALLERY_FOLDER_ID = ${JSON.stringify(folderId)};`),
    context
  );
  return { context, requests };
}

test("gallery lists only direct, non-trashed media in the curated folder", () => {
  const { context, requests } = backend();
  const result = context.doGet({ parameter: { action: "gallery" } });
  assert.equal(result.ok, true);
  assert.equal(result.files[0].canDownload, true);
  assert.equal(result.nextPageToken, "next/page");
  assert.equal(result.folderUrl, "https://drive.google.com/drive/folders/curated-folder");
  assert.equal(requests[0].url.searchParams.get("q"),
    "'curated-folder' in parents and trashed = false and (mimeType contains 'image/' or mimeType contains 'video/')");
  assert.equal(requests[0].url.searchParams.get("pageSize"), "60");
  assert.ok(!JSON.stringify(result).includes("server-only-token"));
});

test("photo/video filters and opaque pagination reach Drive unchanged", () => {
  for (const [filter, mime] of [["photos", "image/"], ["videos", "video/"]]) {
    const { context, requests } = backend();
    context.doGet({ parameter: { action: "gallery", filter, pageToken: "next/+&=" } });
    assert.equal(requests[0].url.searchParams.get("q"),
      `'curated-folder' in parents and trashed = false and mimeType contains '${mime}'`);
    assert.equal(requests[0].url.searchParams.get("pageToken"), "next/+&=");
  }
});

test("unconfigured and malformed folder IDs never request Drive", () => {
  for (const folderId of ["", "folder' or trashed = true"]) {
    const { context, requests } = backend(folderId);
    assert.equal(context.doGet({ parameter: { action: "gallery" } }).ok, false);
    assert.equal(requests.length, 0);
  }
});

test("invalid filters and Drive failures surface errors rather than empty success", () => {
  const invalid = backend();
  assert.equal(invalid.context.doGet({ parameter: { action: "gallery", filter: "documents" } }).ok, false);
  assert.equal(invalid.requests.length, 0);
  const failed = backend("curated-folder", 403);
  assert.equal(failed.context.doGet({ parameter: { action: "gallery" } }).ok, false);
});

test("gallery works without action parameters and has no upload handler", () => {
  const { context } = backend();
  assert.equal(context.doGet().ok, true);
  assert.equal(context.doPost, undefined);
  const manifest = JSON.parse(readFileSync(`${__dirname}/../google-apps-script/gallery/appsscript.json`, "utf8"));
  assert.ok(manifest.oauthScopes.includes("https://www.googleapis.com/auth/drive.readonly"));
  assert.ok(!manifest.oauthScopes.includes("https://www.googleapis.com/auth/drive"));
  const uploadPage = readFileSync(`${__dirname}/../photos.html`, "utf8");
  assert.ok(!uploadPage.includes("gallery-config.js"));
  assert.ok(!uploadPage.includes("media-config.js"));
});
