# Wedding photo uploads (QR code → Google Drive)

Guests scan a QR code, open `photos.html`, pick photos/videos from their phone, and the files are
saved straight into a Google Drive folder you own. Afterwards you share that folder link with everyone.

## How it works

- `photos.html` / `photos.js` / `photos.css` – mobile upload page (hosted on GitHub Pages with the invitation).
- `google-apps-script/photo-upload/PhotoUpload.gs` – Apps Script web app that writes the files into your Drive folder.
  Files are sent in 4 MB chunks, so large videos (up to 1 GB) work and failed chunks are retried.
- `qr.html` – printable sign with the QR code pointing at `photos.html`.

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

1. Open `https://frankellydeleon.github.io/weddinginvitation/photos.html` on your phone (or scan the QR).
2. Upload a couple of photos and a short video; each should show **Uploaded ✓**.
3. Check the files appear in the Drive folder.

## After the wedding

In Drive, right-click the folder → *Share* → *General access: Anyone with the link (Viewer)* → *Copy link*,
and send that link to your guests. To stop new uploads, archive the deployment
(*Deploy → Manage deployments → Archive*).

## Notes & limits

- Uploads count against the Drive storage of the account that deployed the script.
- Apps Script allows ~30 simultaneous executions per account; busy moments are handled by automatic retries.
- Guests must keep the page open until uploads finish (the page keeps the screen awake where supported).
- If uploads fail with `insufficient authentication scopes`, the script only has read access to Drive:
  make sure `authorizePhotoUpload` contains the `createFile` line, run it again, accept the new
  "See, edit, create and delete all of your Google Drive files" permission, then deploy a new version.
