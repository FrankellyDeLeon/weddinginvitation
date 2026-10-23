# Wedding photo uploads (QR code → Google Drive)

Guests scan a QR code, open `photos.html`, pick photos/videos from their phone, and the files are
saved straight into a Google Drive folder you own. A separate curated gallery at `gallery.html`
lets you choose which photos and videos to share afterwards.

## How it works

- `photos.html` / `photos.js` / `photos.css` – mobile upload page (hosted on GitHub Pages with the invitation).
- `google-apps-script/photo-upload/PhotoUpload.gs` – Apps Script web app that writes the files into your Drive folder.
  Files are sent in 4 MB chunks, so large videos (up to 1 GB) work and failed chunks are retried.
- `qr.html` – printable sign with the QR code pointing at `photos.html`.
- `gallery.html` / `gallery.js` / `gallery.css` – shareable gallery with filters, previews, and original downloads.
- `gallery-config.js` – independent gallery endpoint; never use the upload endpoint here.
- `google-apps-script/gallery/` – separate, read-only Apps Script project for the gallery.

Files are named `YYYYMMDD-HHmmss_<guest name>_<original name>`.

## Setup (≈10 minutes)

1. **Create the Drive folder** – In Google Drive, create e.g. `Simona & Frankelly – Wedding photos`.
   Open it and copy the ID from the URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.
2. **Create the Apps Script project** – Go to <https://script.google.com> → *New project*
   (keep it separate from the RSVP script). Replace the contents of `Code.gs` with
   `google-apps-script/photo-upload/PhotoUpload.gs` and set `PHOTO_FOLDER_ID` to your folder ID.
3. **Authorize** – Select the `authorizePhotoUpload` function and click *Run*. Accept the permissions.
   The log should print your folder's name.
4. **Deploy** – *Deploy → New deployment → Web app*:
   - Execute as: **Me**
   - Who has access: **Anyone**

   Copy the Web app URL (ends with `/exec`).
5. **Connect the page** – In `photos.js`, set `PHOTO_UPLOAD_ENDPOINT` to that URL. Commit and push to `main`.
6. **Print the QR code** – Open <https://frankellydeleon.github.io/weddinginvitation/qr.html>,
   then *Print* or *Download PNG*.

> If you later edit `PhotoUpload.gs`, use *Deploy → Manage deployments → Edit → New version*
> so the URL stays the same (a *New deployment* creates a new URL and the QR/photos.js would need updating).

## Testing

Run the local endpoint regression tests with `node --test tests/gallery.test.cjs` (Node.js 18+).

1. Open `https://frankellydeleon.github.io/weddinginvitation/photos.html` on your phone (or scan the QR).
2. Upload a couple of photos and a short video; each should show **Uploaded ✓**.
3. Check the files appear in the Drive folder.

## Curated gallery (after the wedding)

1. Create a **new, separate Drive folder** for the gallery. Keep the guest-upload folder private.
   Copy only the photos and videos you want to publish into the new folder (not shortcuts or subfolders).
   Files are displayed by filename; rename them if you want friendly captions or a specific order.
2. Right-click the curated folder → *Share* → *General access: Anyone with the link* → **Viewer**.
   Make sure viewers are allowed to download files (do not disable downloading/copying in sharing settings).
   Workspace accounts may restrict public sharing; use an account that allows anonymous viewing.
3. Go to <https://script.google.com> → **New project**, named e.g. `Wedding Gallery`.
   **Do not edit or redeploy the existing QR upload or RSVP projects.**
   Replace the new project's `Code.gs` with `google-apps-script/gallery/Gallery.gs`.
   `GALLERY_FOLDER_ID` is already set to `1_v_br_knfrxQOtMWxAdW1LjiCLGNE6RO`.
4. In **Project Settings**, enable **Show "appsscript.json" manifest file in editor**.
   Replace that file with `google-apps-script/gallery/appsscript.json`.
   It requests read-only Drive access and external requests, not Drive write access.
   Save, select **authorizeGallery**, and click **Run**. Approve permissions using an account
   with access to the curated folder. The execution log should show the gallery URL.
5. Select **Deploy → New deployment → Web app**, **Execute as: Me**, **Who has access: Anyone**.
   Copy this **new gallery project's** web app URL ending in `/exec`.
   Open it in a signed-out browser; expect JSON with `"ok": true` and a `"files"` array.
6. Set `GALLERY_ENDPOINT` in `gallery-config.js` to the new gallery web app URL.
   Do not change `PHOTO_UPLOAD_ENDPOINT` in `photos.js`. Publish the website changes, then share:
   <https://frankellydeleon.github.io/weddinginvitation/gallery.html>.
7. Open that link in a signed-out/private browser. Check photo/video filters, previews, and downloads.
   Click **Open album in Google Drive** to select several files and use Drive's Download action for a ZIP.

For future gallery script changes, edit only the gallery project and update its deployment via
**Deploy → Manage deployments → Edit → New version** to preserve its URL.
The QR page, upload endpoint, upload script, and upload folder remain independent.

The gallery reads only direct image/video children of the curated folder, 60 at a time.
New files appear on reload; removed or trashed files disappear. Videos and formats such as HEIC
use Drive's preview, so browser codec support is not required by the gallery itself. Drive may need
time to process a new video or may not preview every format; the original download remains available.
Large downloads may open a Google Drive confirmation or virus-scan warning instead of saving immediately.

The gallery is intentionally not linked from the invitation or upload page. Its `noindex` directive
discourages search indexing but **is not access control**: anyone with the gallery/folder link can
view and reshare published files. The public Apps Script endpoint also exposes the curated listing.
Do not publish anything confidential. Removing a file cannot revoke copies guests already downloaded.

**Keep the gallery Apps Script deployment active while the gallery is in use.** The upload deployment
can be managed independently; archiving it does not affect the gallery. Media stays available
while the website, gallery deployment, Google account, sharing permissions,
and files remain active. Google Drive storage, download quotas, and service limits still apply;
this is not a guarantee of permanent hosting.

## Notes & limits

- Uploads count against the Drive storage of the account that deployed the script.
- Apps Script allows ~30 simultaneous executions per account; busy moments are handled by automatic retries.
- Guests must keep the page open until uploads finish (the page keeps the screen awake where supported).
- If uploads fail with `insufficient authentication scopes`, the script only has read access to Drive:
  make sure `authorizePhotoUpload` contains the `createFile` line, run it again, accept the new
  "See, edit, create and delete all of your Google Drive files" permission, then deploy a new version.

## Importing the photographer's pCloud album into the gallery

`google-apps-script/gallery-import/` is a one-time import script, deployed as its **own** Apps Script
project (not the gallery or QR upload project). It copies every photo/video from the photographer's
pCloud public link directly into the gallery folder, server-to-server, in the background.

1. <https://script.google.com> → **New project** (e.g. `Gallery import`). Paste `Import.gs` into `Code.gs`.
2. Project Settings → show `appsscript.json`, replace it with `google-apps-script/gallery-import/appsscript.json`.
3. Run **startImport** and approve permissions. If you get "Google Drive API has not been used",
   enable it via the link in the error, wait a few minutes, and run again.
4. It continues every 10 minutes until finished. Run **importStatus** to check progress,
   **stopImport** to pause. Running **startImport** again resumes; files already copied are skipped.

The album is ~19.6 GB, so the Google account needs that much free Drive storage (the script checks
first). Apps Script daily runtime quotas mean a large album can take a day or more.
After it finishes, you can delete the import project.
