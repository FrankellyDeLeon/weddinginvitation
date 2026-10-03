const PHOTO_UPLOAD_ENDPOINT = "https://script.google.com/macros/s/AKfycbxSbVDNkZyKWaKLxx2zf-zWiKZPxCrHVWawJaKyUNkY6Yl9uNU4dMt9UepPLsNCUsIO/exec";

// Must be a multiple of 256 KB (Google Drive resumable upload requirement).
const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_FILE_SIZE = 1024 * 1024 * 1024;
const MAX_RETRIES = 4;

const fileInput = document.querySelector("#file-input");
const fileList = document.querySelector("#file-list");
const uploadButton = document.querySelector("#upload-button");
const statusMessage = document.querySelector("#status");
const guestNameInput = document.querySelector("#guest-name");

const queue = [];
let uploading = false;

guestNameInput.value = localStorage.getItem("weddingGuestName") || "";
guestNameInput.addEventListener("input", () => {
  localStorage.setItem("weddingGuestName", guestNameInput.value.trim());
});

fileInput.addEventListener("change", () => {
  for (const file of fileInput.files) {
    queue.push(createQueueItem(file));
  }
  fileInput.value = "";
  refreshButton();
});

uploadButton.addEventListener("click", uploadAll);

function createQueueItem(file) {
  const element = document.createElement("li");
  element.className = "file-item";
  element.innerHTML = `
    <span class="file-name"></span>
    <span class="file-state"></span>
    <div class="progress"><div class="progress-bar"></div></div>
  `;
  element.querySelector(".file-name").textContent = file.name || "photo";
  fileList.appendChild(element);

  const item = { file, element, status: "pending" };
  if (!isAllowedType(file)) {
    setItemState(item, "failed", "Not a photo/video");
  } else if (file.size > MAX_FILE_SIZE) {
    setItemState(item, "failed", "Too large");
  } else if (file.size === 0) {
    setItemState(item, "failed", "Empty file");
  } else {
    setItemState(item, "pending", formatSize(file.size));
  }
  return item;
}

function isAllowedType(file) {
  return !file.type || file.type.startsWith("image/") || file.type.startsWith("video/");
}

function setItemState(item, status, label, progress) {
  item.status = status;
  item.element.classList.remove("pending", "uploading", "done", "failed");
  item.element.classList.add(status);
  item.element.querySelector(".file-state").textContent = label;
  if (progress !== undefined) {
    item.element.querySelector(".progress-bar").style.width = `${Math.round(progress * 100)}%`;
  }
}

function refreshButton() {
  const pending = queue.filter((item) => item.status === "pending").length;
  uploadButton.disabled = uploading || pending === 0;
  uploadButton.textContent = uploading
    ? "Uploading..."
    : pending > 0
      ? `Upload ${pending} file${pending === 1 ? "" : "s"}`
      : "Upload";
}

async function uploadAll() {
  if (!PHOTO_UPLOAD_ENDPOINT || PHOTO_UPLOAD_ENDPOINT.startsWith("PASTE_YOUR")) {
    statusMessage.textContent = "Photo uploads are not configured yet (set PHOTO_UPLOAD_ENDPOINT in photos.js).";
    return;
  }

  uploading = true;
  refreshButton();
  statusMessage.textContent = "";
  const wakeLock = await requestWakeLock();

  let succeeded = 0;
  let failed = 0;
  for (const item of queue.filter((entry) => entry.status === "pending")) {
    try {
      await uploadFile(item);
      setItemState(item, "done", "Uploaded ✓", 1);
      succeeded += 1;
    } catch (error) {
      console.error(error);
      setItemState(item, "pending", "Failed – tap Upload to retry", 0);
      failed += 1;
    }
  }

  if (wakeLock) {
    wakeLock.release().catch(() => {});
  }
  uploading = false;
  refreshButton();

  if (failed === 0) {
    statusMessage.textContent = `Thank you! ${succeeded} file${succeeded === 1 ? "" : "s"} uploaded. 💛`;
  } else {
    statusMessage.textContent = `${succeeded} uploaded, ${failed} failed. Check your connection and tap Upload again.`;
  }
}

async function uploadFile(item) {
  const { file } = item;
  setItemState(item, "uploading", "Starting...", 0);

  const start = await callEndpoint({
    action: "start",
    fileName: file.name || "photo",
    mimeType: file.type || guessMimeType(file.name),
    size: file.size,
    guestName: guestNameInput.value.trim(),
  });

  let offset = 0;
  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const result = await callEndpoint({
      action: "chunk",
      uploadUrl: start.uploadUrl,
      start: offset,
      total: file.size,
      data: await blobToBase64(chunk),
    });
    offset += chunk.size;
    const progress = offset / file.size;
    setItemState(item, "uploading", `${Math.round(progress * 100)}%`, progress);
    if (result.done) {
      return;
    }
  }
}

async function callEndpoint(body) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
    try {
      // text/plain keeps this a "simple" CORS request that Apps Script accepts.
      const response = await fetch(PHOTO_UPLOAD_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (data.ok) {
        return data;
      }
      lastError = new Error(data.error || "Upload failed");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function guessMimeType(name = "") {
  const extension = name.split(".").pop().toLowerCase();
  const types = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    heic: "image/heic",
    heif: "image/heif",
    webp: "image/webp",
    gif: "image/gif",
    mp4: "video/mp4",
    mov: "video/quicktime",
    m4v: "video/x-m4v",
    "3gp": "video/3gpp",
    webm: "video/webm",
  };
  return types[extension] || "image/jpeg";
}

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

async function requestWakeLock() {
  try {
    return navigator.wakeLock ? await navigator.wakeLock.request("screen") : null;
  } catch {
    return null;
  }
}
