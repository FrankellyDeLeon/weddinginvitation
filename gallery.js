const grid = document.querySelector("#gallery-grid");
const galleryStatus = document.querySelector("#gallery-status");
const loadMore = document.querySelector("#load-more");
const retryButton = document.querySelector("#retry-button");
const folderLink = document.querySelector("#folder-link");
const filterButtons = [...document.querySelectorAll("[data-filter]")];
const previewDialog = document.querySelector("#preview-dialog");
const previewFrame = document.querySelector("#preview-frame");
const previewDownload = document.querySelector("#preview-download");
let activeFilter = "all";
let nextPageToken = "";
let loadedCount = 0;
let loading = false;

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (loading || button.dataset.filter === activeFilter) return;
    activeFilter = button.dataset.filter;
    filterButtons.forEach((filter) => {
      filter.setAttribute("aria-pressed", String(filter === button));
    });
    grid.replaceChildren();
    loadedCount = 0;
    nextPageToken = "";
    loadGallery();
  });
});
loadMore.addEventListener("click", loadGallery);
retryButton.addEventListener("click", loadGallery);
document.querySelector("#close-preview").addEventListener("click", () => previewDialog.close());
previewDialog.addEventListener("close", () => previewFrame.removeAttribute("src"));
previewDialog.addEventListener("click", (event) => {
  if (event.target !== previewDialog) return;
  const bounds = previewDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) {
    previewDialog.close();
  }
});

async function loadGallery() {
  if (loading) return;
  loading = true;
  grid.setAttribute("aria-busy", "true");
  loadMore.hidden = true;
  retryButton.hidden = true;
  filterButtons.forEach((button) => { button.disabled = true; });
  galleryStatus.classList.remove("error");
  galleryStatus.textContent = "Loading our memories...";

  try {
    if (!GALLERY_ENDPOINT || GALLERY_ENDPOINT.startsWith("PASTE_YOUR")) {
      throw new Error("The wedding gallery is not configured yet. Please check back later.");
    }
    const url = new URL(GALLERY_ENDPOINT);
    url.searchParams.set("action", "gallery");
    url.searchParams.set("filter", activeFilter);
    if (nextPageToken) url.searchParams.set("pageToken", nextPageToken);
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error("The gallery could not be reached. Please try again.");
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || "The gallery could not be loaded.");
    if (!Array.isArray(data.files) || typeof data.folderUrl !== "string") {
      throw new Error("The gallery is not ready yet. Please check back later.");
    }

    const cards = data.files.map(createCard);
    grid.append(...cards);
    loadedCount += cards.length;
    nextPageToken = data.nextPageToken || "";
    folderLink.href = data.folderUrl;
    folderLink.hidden = false;
    loadMore.hidden = !nextPageToken;
    const label = activeFilter === "all" ? "memories" : activeFilter;
    const singularLabel = activeFilter === "all" ? "memory" : activeFilter === "photos" ? "photo" : "video";
    galleryStatus.textContent = loadedCount
      ? `${loadedCount} ${loadedCount === 1 ? singularLabel : label} shown${nextPageToken ? " - more below" : ""}.`
      : "No " + (activeFilter === "all" ? "memories" : activeFilter) + " to share just yet. Please check back soon.";
  } catch (error) {
    console.error("Gallery loading failed:", error);
    galleryStatus.textContent = error.name === "TimeoutError"
      ? "Loading took too long. Please check your connection and try again."
      : error.message || "We could not load the gallery. Please try again.";
    galleryStatus.classList.add("error");
    retryButton.hidden = false;
  } finally {
    loading = false;
    grid.setAttribute("aria-busy", "false");
    filterButtons.forEach((button) => { button.disabled = false; });
  }
}

function createCard(file) {
  const isVideo = file.mimeType.startsWith("video/");
  const viewUrl = `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`;
  const downloadUrl = `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`;
  const card = document.createElement("article");
  card.className = "memory";
  const preview = document.createElement("button");
  preview.type = "button";
  preview.className = "memory-preview";
  preview.setAttribute("aria-label", `Preview ${file.name}`);
  const placeholder = document.createElement("span");
  placeholder.textContent = isVideo ? "Preview video" : "Preview photo";
  preview.append(placeholder);
  if (file.thumbnailUrl) {
    const image = document.createElement("img");
    image.alt = "";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    placeholder.hidden = true;
    image.addEventListener("error", () => {
      image.remove();
      placeholder.hidden = false;
    }, { once: true });
    image.src = file.thumbnailUrl;
    preview.append(image);
  }
  const badge = document.createElement("span");
  badge.className = "media-badge";
  badge.textContent = isVideo ? "Video" : "Photo";
  preview.append(badge);
  preview.addEventListener("click", () => {
    document.querySelector("#preview-title").textContent = file.name;
    previewFrame.title = `Preview: ${file.name}`;
    previewFrame.src = `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/preview`;
    previewDownload.href = downloadUrl;
    previewDownload.hidden = !file.canDownload;
    document.querySelector("#preview-open").href = viewUrl;
    previewDialog.showModal();
  });

  const details = document.createElement("div");
  details.className = "memory-details";
  const title = document.createElement("h2");
  title.textContent = file.name;
  const size = document.createElement("p");
  const bytes = Number(file.size);
  size.textContent = bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const download = document.createElement(file.canDownload ? "a" : "p");
  download.textContent = file.canDownload ? "Download original" : "Download unavailable";
  if (file.canDownload) {
    download.href = downloadUrl;
    download.target = "_blank";
    download.rel = "noopener noreferrer";
    download.setAttribute("aria-label", `Download ${file.name} (opens Google Drive)`);
  }
  details.append(title, size, download);
  card.append(preview, details);
  return card;
}

loadGallery();
