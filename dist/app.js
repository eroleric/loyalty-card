import { retailers } from "./retailers.js";
import { TEXT_FIELDS, STORAGE_KEY, emptyProfile, normalizeProfile, validateProfile, profileSummary, fieldsForReview, localToday, readSavedProfile, writeSavedProfile, clearSavedProfile } from "./profile.js";

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function createRetailerCard(retailer, index) {
  const item = element("li");
  const card = element("article", "retailer-card");
  const headingId = `retailer-${index}-name`;
  card.setAttribute("aria-labelledby", headingId);
  card.style.setProperty("--retailer-color", retailer.color);
  card.style.setProperty("--retailer-tint", retailer.tint);

  const cover = element("div", "retailer-cover");
  cover.setAttribute("aria-hidden", "true");
  cover.append(element("span", "retailer-monogram", retailer.initials));

  const details = element("div", "retailer-details");
  const nameRow = element("div", "retailer-name-row");
  const name = element("h3", null, retailer.name);
  name.id = headingId;
  nameRow.append(name);

  const footer = element("div", "retailer-footer");
  footer.append(element("span", null, "Signup not connected yet"));
  const previewButton = element("button", "button button-secondary retailer-preview", "Preview profile");
  previewButton.type = "button";
  previewButton.setAttribute("aria-label", `Preview profile for ${retailer.name}`);
  previewButton.addEventListener("click", () => openSignupPreview(retailer));
  details.append(nameRow, element("p", "retailer-program", retailer.program), footer, previewButton);
  card.append(cover, details);
  item.append(card);
  return item;
}

export function renderRetailers(list) {
  const grid = document.getElementById("retailer-grid");
  const cards = document.createDocumentFragment();
  list.forEach((retailer, index) => cards.append(createRetailerCard(retailer, index)));
  grid.replaceChildren(cards);
  document.getElementById("retailer-count").textContent = String(list.length);
  document.getElementById("retailer-summary").textContent =
    `${list.length} ${list.length === 1 ? "retailer" : "retailers"}`;
}

renderRetailers(retailers);

const form = document.getElementById("profile-form");
const state = { profile: null, storage: null, hasBrowserCopy: false };
let startupNotice = "";
try {
  state.storage = window.localStorage;
  state.hasBrowserCopy = state.storage.getItem(STORAGE_KEY) !== null;
  const saved = readSavedProfile(state.storage);
  if (saved) {
    state.profile = saved.profile;
  }
} catch {
  startupNotice = state.hasBrowserCopy
    ? "A saved browser profile couldn't be loaded. Delete the saved profile to start again."
    : "This browser isn't allowing saved details. Your edits can stay on this page, but saving needs browser storage.";
  if (!state.hasBrowserCopy) state.storage = null;
}

function readForm() {
  const data = Object.fromEntries(Object.keys(TEXT_FIELDS).map(key => [key, form.elements[key].value]));
  data.emailOffers = form.elements.emailOffers.checked;
  data.smsOffers = form.elements.smsOffers.checked;
  return normalizeProfile(data);
}

function clearErrors() {
  for (const key of Object.keys(TEXT_FIELDS)) {
    form.elements[key].removeAttribute("aria-invalid");
    document.getElementById(`${key}-error`).hidden = true;
  }
}

function formMessage(message, isError = false) {
  const target = document.getElementById("form-message");
  target.textContent = message;
  target.classList.toggle("is-error", isError);
  target.hidden = !message;
}

function notify(message) {
  const target = document.getElementById("app-notice");
  target.textContent = message;
  target.hidden = !message;
}

function refreshDraftStatus() {
  const changed = JSON.stringify(readForm()) !== JSON.stringify(state.profile || emptyProfile());
  document.getElementById("draft-state").textContent = changed
    ? "Unsaved changes"
    : state.profile ? "Your saved details are up to date." : "Add any details, then save.";
}

function fillForm() {
  const profile = state.profile || emptyProfile();
  for (const key of Object.keys(TEXT_FIELDS)) form.elements[key].value = profile[key];
  form.elements.emailOffers.checked = profile.emailOffers;
  form.elements.smsOffers.checked = profile.smsOffers;
  clearErrors();
  refreshDraftStatus();
}

function refreshSavedState() {
  const summary = profileSummary(state.profile);
  const complete = state.profile && summary.complete === summary.total;
  const badge = document.getElementById("profile-badge");
  badge.textContent = state.profile ? "Saved" : "Not saved yet";
  badge.classList.toggle("is-complete", Boolean(complete));
  document.getElementById("home-profile-description").textContent = state.profile
    ? "Your details are saved in this browser."
    : "Keep your name, email, and address ready for signup forms.";
  document.getElementById("profile-cta").textContent = state.profile ? "Edit profile" : "Set up profile";
  document.getElementById("nav-profile-dot").classList.toggle("is-complete", Boolean(complete));
  document.getElementById("saved-profile-state").textContent = state.profile
    ? "Profile saved on this device."
    : state.hasBrowserCopy ? "A saved browser profile needs to be deleted or replaced." : "No saved profile yet.";
  document.getElementById("delete-profile").disabled = !state.profile && !state.hasBrowserCopy;
}

form.addEventListener("submit", event => {
  event.preventDefault();
  clearErrors();
  const result = validateProfile(readForm());
  const invalid = Object.entries(result.errors);
  if (invalid.length) {
    for (const [key, message] of invalid) {
      form.elements[key].setAttribute("aria-invalid", "true");
      const error = document.getElementById(`${key}-error`);
      error.textContent = message;
      error.hidden = false;
      const optionalSection = form.elements[key].closest("details");
      if (optionalSection) optionalSection.open = true;
    }
    formMessage("Check the highlighted details, then save again.", true);
    form.elements[invalid[0][0]].focus();
    return;
  }
  if (!Object.keys(TEXT_FIELDS).some(key => result.profile[key])) {
    formMessage("Add at least one detail before saving your profile.", true);
    form.elements.firstName.focus();
    return;
  }
  try {
    if (!state.storage) throw new Error("Storage unavailable.");
    writeSavedProfile(state.storage, result.profile);
  } catch {
    formMessage("This browser couldn't save your details. Your edits are still here. Allow storage for this site, then try again.", true);
    return;
  }
  state.profile = result.profile;
  state.hasBrowserCopy = true;
  fillForm();
  refreshSavedState();
  notify("");
  formMessage("Saved on this device.");
});

form.addEventListener("input", event => {
  formMessage("");
  if (event.target.name in TEXT_FIELDS) {
    event.target.removeAttribute("aria-invalid");
    document.getElementById(`${event.target.name}-error`).hidden = true;
  }
  refreshDraftStatus();
});
form.addEventListener("change", refreshDraftStatus);
document.getElementById("cancel-profile").addEventListener("click", () => {
  fillForm();
  formMessage("Changes cancelled. Your saved details are unchanged.");
});

const deleteDialog = document.getElementById("delete-dialog");
document.getElementById("delete-profile").addEventListener("click", () => deleteDialog.showModal());
document.getElementById("keep-profile").addEventListener("click", () => deleteDialog.close());
document.getElementById("confirm-delete-profile").addEventListener("click", () => {
  try {
    if (state.storage) clearSavedProfile(state.storage);
    else if (state.hasBrowserCopy) throw new Error("Storage unavailable.");
  } catch {
    deleteDialog.close();
    formMessage("The saved browser copy couldn't be removed. Your profile has been kept; try again when browser storage is available.", true);
    return;
  }
  state.profile = null;
  state.hasBrowserCopy = false;
  fillForm();
  refreshSavedState();
  deleteDialog.close();
  notify("");
  formMessage("Saved profile deleted.");
  form.elements.firstName.focus();
});

const reviewDialog = document.getElementById("review-dialog");
function openSignupPreview(retailer) {
  document.getElementById("review-retailer").textContent = `${retailer.name} · ${retailer.program}`;
  document.getElementById("review-empty").hidden = Boolean(state.profile);
  const details = document.getElementById("review-details");
  // Until adapters exist this previews the whole saved profile, not a retailer's actual request.
  const rows = state.profile ? fieldsForReview(state.profile, Object.keys(TEXT_FIELDS)).filter(row => row.value) : [];
  details.replaceChildren(...rows.map(row => {
    const item = element("div", row.value ? "review-row" : "review-row is-missing");
    item.append(element("dt", null, row.label), element("dd", null, row.value || "Not provided"));
    return item;
  }));
  const preferences = document.getElementById("review-preferences");
  preferences.hidden = !state.profile;
  preferences.textContent = state.profile
    ? `Offer preferences: email ${state.profile.emailOffers ? "interested" : "not selected"}; texts ${state.profile.smsOffers ? "interested" : "not selected"}. These do not grant retailer consent.`
    : "";
  document.getElementById("edit-review-profile").textContent = state.profile ? "Edit profile" : "Set up profile";
  reviewDialog.showModal();
  document.getElementById("review-title").focus({ preventScroll: true });
  reviewDialog.scrollTop = 0;
}
reviewDialog.addEventListener("close", () => {
  if (reviewDialog.open) return;
  document.getElementById("review-details").replaceChildren();
  document.getElementById("review-preferences").textContent = "";
});
document.getElementById("close-review").addEventListener("click", () => reviewDialog.close());
document.getElementById("edit-review-profile").addEventListener("click", () => {
  reviewDialog.close();
  location.hash = "profile";
});

function showView(focusHeading = false) {
  // Old Account bookmarks now lead straight to the local profile.
  if (location.hash === "#account") { location.hash = "profile"; return; }
  if (!["", "#home", "#profile"].includes(location.hash)) return;
  const isProfile = location.hash === "#profile";
  document.getElementById("home-view").hidden = isProfile;
  document.getElementById("profile-view").hidden = !isProfile;
  for (const [id, current] of [["home-link", !isProfile], ["profile-link", isProfile]]) {
    const link = document.getElementById(id);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = isProfile ? "My profile · Loyalty Card" : "Loyalty Card";
  if (focusHeading) {
    const heading = document.getElementById(isProfile ? "profile-title" : "welcome-title");
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }
}
window.addEventListener("hashchange", () => showView(true));

// Native form controls start disabled so a script-loading failure cannot send details in a URL.
document.getElementById("profile-fields").disabled = false;
form.elements.dateOfBirth.max = localToday();
fillForm();
refreshSavedState();
showView();
notify(startupNotice);
