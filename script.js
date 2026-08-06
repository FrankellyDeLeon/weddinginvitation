const form = document.querySelector("#rsvp-form");
const addGuestButton = document.querySelector("#add-guest");
const guestList = document.querySelector("#guest-list");
const formMessage = document.querySelector("#form-message");
const submitButton = document.querySelector(".submit");
const bookTrack = document.querySelector("#book-track");
const previousPageButton = document.querySelector("#prev-page");
const nextPageButton = document.querySelector("#next-page");
const pageStatus = document.querySelector("#page-status");
const bookPages = document.querySelectorAll(".book-page");

const RSVP_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbzq0z9QjhyOlboHVWmtjYiOoE7DO9jWR3olFwpFwbWYJd-kALqsofbI71kX_mHLhQ4Ohg/exec";

let guestCount = 0;
let currentPage = 0;
const totalPages = bookPages.length;

function updatePage() {
  bookTrack.style.transform = `translateX(-${currentPage * 100}%)`;
  previousPageButton.disabled = currentPage === 0;
  nextPageButton.disabled = currentPage === totalPages - 1;
  pageStatus.textContent = `Page ${currentPage + 1} of ${totalPages}`;
}

function createGuestRow() {
  guestCount += 1;
  const row = document.createElement("div");
  row.className = "guest-row";
  row.innerHTML = `
    <input type="text" name="accompanyingGuest${guestCount}" placeholder="Guest full name" />
    <button type="button" class="remove-guest" aria-label="Remove guest">Remove</button>
  `;

  row.querySelector(".remove-guest").addEventListener("click", () => {
    row.remove();
  });

  guestList.appendChild(row);
}

function getGuestNames() {
  return [...guestList.querySelectorAll("input")]
    .map((input) => input.value.trim())
    .filter(Boolean);
}

previousPageButton.addEventListener("click", () => {
  currentPage = Math.max(0, currentPage - 1);
  updatePage();
});

nextPageButton.addEventListener("click", () => {
  currentPage = Math.min(totalPages - 1, currentPage + 1);
  updatePage();
});

updatePage();
addGuestButton.addEventListener("click", createGuestRow);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formMessage.textContent = "";

  const formData = new FormData(form);
  const payload = {
    inviteeName: formData.get("inviteeName")?.toString().trim(),
    inviteeEmail: formData.get("inviteeEmail")?.toString().trim(),
    attendance: formData.get("attendance")?.toString(),
    accompanyingGuests: getGuestNames(),
    preferences: formData.get("preferences")?.toString().trim() || "",
    submittedAt: new Date().toISOString(),
  };

  if (!payload.inviteeName || !payload.inviteeEmail || !payload.attendance) {
    formMessage.textContent = "Please enter your name, email address, and attendance choice.";
    return;
  }

  if (!RSVP_ENDPOINT || RSVP_ENDPOINT.includes("PASTE_YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE")) {
    formMessage.textContent = "Please connect your Google Apps Script Web App URL in script.js first.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Sending...";

  try {
    const requestBody = new URLSearchParams();
    requestBody.set("payload", JSON.stringify(payload));

    await fetch(RSVP_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      body: requestBody,
    });

    form.reset();
    guestList.innerHTML = "";
    formMessage.textContent = "Thank you! Your RSVP has been sent.";
  } catch (error) {
    formMessage.textContent = "Network error. Please try again in a moment.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send RSVP";
  }
});
