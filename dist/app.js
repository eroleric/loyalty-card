import { retailers } from "./retailers.js";
import { TEXT_FIELDS, STORAGE_KEY, emptyProfile, normalizeProfile, validateProfile, profileSummary, fieldsForReview, localToday, readSavedProfile, writeSavedProfile, clearSavedProfile } from "./profile.js";
import { accountConfig } from "./config.js";
import { AccountUI } from "./account-ui.js";

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
  cover.append(
    element("span", "cover-ring"),
    element("span", "cover-ring cover-ring-small"),
    element("span", "retailer-monogram", retailer.initials),
    element("span", "cover-name", retailer.name),
  );

  const details = element("div", "retailer-details");
  const nameRow = element("div", "retailer-name-row");
  const name = element("h3", null, retailer.name);
  name.id = headingId;
  nameRow.append(name, element("span", "retailer-tag", retailer.category));

  const footer = element("div", "retailer-footer");
  // Static decorative icon; retailer text always uses textContent.
  footer.innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true" fill="none"><rect x="3" y="5" width="14" height="11" rx="2.5"/><path d="M3 8.5h14M6 12h3"/></svg>';
  footer.append(element("span", null, "Signup not connected yet"));
  const previewButton = element("button", "button button-secondary retailer-preview", "Preview signup");
  previewButton.type = "button";
  previewButton.setAttribute("aria-label", `Preview signup for ${retailer.name}`);
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
const rememberInput = document.getElementById("rememberProfile");
const state = { profile: null, remember: false, storage: null, hasBrowserCopy: false, legacyProfile: null, busy: false, operation: 0 };
let startupNotice = "";
try {
  state.storage = window.localStorage;
  state.hasBrowserCopy = state.storage.getItem(STORAGE_KEY) !== null;
  const saved = readSavedProfile(state.storage);
  if (saved) {
    state.profile = saved.profile;
    state.legacyProfile = saved.profile;
    state.remember = true;
  }
} catch {
  startupNotice = state.hasBrowserCopy
    ? "A saved browser profile couldn't be loaded. Delete the saved profile to start again."
    : "Browser storage is unavailable. You can still save your profile for this page.";
  if (!state.hasBrowserCopy) state.storage = null;
}

const account = new AccountUI(accountConfig, snapshot => {
  state.operation += 1;
  state.busy = false;
  state.profile = snapshot.profile;
  state.remember = false;
  for (const id of ["review-dialog", "delete-dialog", "browser-copy-dialog"]) {
    const dialog = document.getElementById(id);
    if (dialog.open) dialog.close();
  }
  document.getElementById("review-details").replaceChildren();
  document.getElementById("review-preferences").textContent = "";
  formMessage("");
  notify("");
  fillForm();
  refreshSavedState();
  refreshAccountMode();
});

function refreshAccountMode() {
  account.profileBusy = state.busy;
  const cloud = account.enabled;
  const ready = cloud && account.status === "ready" && Boolean(account.user);
  document.getElementById("local-storage-card").hidden = cloud;
  document.getElementById("account-storage-card").hidden = !cloud;
  document.getElementById("profile-account-notice").hidden = !cloud || ready;
  document.getElementById("profile-account-prompt").textContent = account.user
    ? account.status === "failed" ? "Your account profile couldn't be loaded. Retry from your account before editing." : "Loading your saved account profile…"
    : account.status === "connecting" ? "Checking your sign-in…" : "Sign in to save your profile and use it on other devices.";
  document.getElementById("profile-fields").disabled = state.busy || (cloud && !ready);
  document.getElementById("migration-panel").hidden = !cloud || !ready || !state.hasBrowserCopy;
  document.getElementById("migration-description").textContent = state.legacyProfile
    ? "Nothing has been uploaded. Review these details, then choose Save profile to copy them into your signed-in account."
    : "The old browser copy couldn't be read. It hasn't been uploaded. You can remove it here.";
  document.getElementById("import-browser-profile").disabled = state.busy || !state.legacyProfile;
  document.getElementById("remove-browser-profile").disabled = state.busy;
  document.getElementById("delete-profile").disabled = state.busy || (cloud ? !ready || !state.profile : !state.profile && !state.hasBrowserCopy);
  document.getElementById("signout").disabled = state.busy || account.busy;
}

function readForm() {
  // Read disabled controls too while an account request is in flight.
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

function refreshOverview() {
  const summary = profileSummary(readForm());
  document.getElementById("completion-count").textContent = `${summary.complete} of ${summary.total}`;
  document.getElementById("profile-progress").value = summary.complete;
  document.getElementById("completion-description").textContent = summary.complete === summary.total
    ? "Your common fields are filled in. Save to keep your changes."
    : "Fill what you know now. You can add the rest later.";
  const checklist = document.getElementById("profile-checklist");
  checklist.replaceChildren(...summary.groups.map(group => {
    const item = element("li", group.complete ? "is-complete" : "");
    item.append(element("span", "checklist-label", group.label), element("span", "checklist-status", group.complete ? "Filled in" : "Missing details"));
    return item;
  }));
  document.getElementById("save-mode").textContent = account.enabled ? "In your account" : rememberInput.checked ? "In this browser" : "For this page only";
}

function fillForm() {
  const profile = state.profile || emptyProfile();
  for (const key of Object.keys(TEXT_FIELDS)) form.elements[key].value = profile[key];
  form.elements.emailOffers.checked = profile.emailOffers;
  form.elements.smsOffers.checked = profile.smsOffers;
  rememberInput.checked = state.remember;
  rememberInput.disabled = !state.storage;
  clearErrors();
  refreshOverview();
}

function refreshSavedState() {
  const summary = profileSummary(state.profile);
  const complete = state.profile && summary.complete === summary.total;
  const badge = document.getElementById("profile-badge");
  badge.textContent = complete ? "Common details saved" : state.profile ? "Profile started" : "Not set up";
  badge.classList.toggle("is-complete", Boolean(complete));
  document.getElementById("home-profile-description").textContent = state.profile
    ? `${summary.complete} of ${summary.total} common details saved. You can review and edit them anytime.`
    : "Add your details once, ready to review when you sign up.";
  document.getElementById("profile-cta").replaceChildren(document.createTextNode(state.profile ? "Edit profile" : "Set up profile"), element("span", null, "↗"));
  document.getElementById("profile-cta").lastChild.setAttribute("aria-hidden", "true");
  document.getElementById("nav-profile-dot").classList.toggle("is-complete", Boolean(complete));
  document.getElementById("saved-profile-state").textContent = state.profile
    ? account.enabled ? "Profile saved in your account." : state.remember ? "Profile saved in this browser." : "Profile saved for this page only."
    : account.enabled ? "No saved account profile yet." : state.hasBrowserCopy ? "A saved browser profile needs to be deleted or replaced." : "No saved profile yet.";
  document.getElementById("delete-profile").disabled = !state.profile && !state.hasBrowserCopy;
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  if (state.busy || (account.enabled && !account.profiles?.ready)) return;
  clearErrors();
  const result = validateProfile(readForm());
  const invalid = Object.entries(result.errors);
  if (invalid.length) {
    for (const [key, message] of invalid) {
      form.elements[key].setAttribute("aria-invalid", "true");
      const error = document.getElementById(`${key}-error`);
      error.textContent = message;
      error.hidden = false;
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
  const remember = rememberInput.checked;
  const operation = ++state.operation;
  state.busy = true;
  refreshAccountMode();
  try {
    if (account.enabled) {
      const saved = await account.profiles.save(result.profile);
      if (saved.stale || operation !== state.operation) return;
      state.profile = saved.profile;
    } else if (state.storage) writeSavedProfile(state.storage, result.profile, remember);
    else if (remember) throw new Error("Storage unavailable.");
  } catch {
    if (operation !== state.operation) return;
    formMessage(account.enabled
      ? "Your account profile couldn't be saved. Your edits are still here; check your connection and try again."
      : "Your changes couldn't be saved in this browser. They haven't replaced your saved profile. Try again, or turn off remembering if the browser allows it.", true);
    return;
  } finally {
    if (operation === state.operation) { state.busy = false; refreshAccountMode(); }
  }
  if (!account.enabled) {
    state.profile = result.profile;
    state.remember = remember;
    state.hasBrowserCopy = remember;
    state.legacyProfile = remember ? result.profile : null;
  }
  fillForm();
  refreshSavedState();
  notify("");
  refreshAccountMode();
  formMessage(account.enabled ? "Profile saved to your account. Nothing has been sent to a retailer." : remember ? "Profile saved in this browser. Nothing has been sent to a retailer." : "Profile saved for this page. Reloading or closing it will clear these details.");
});

form.addEventListener("input", event => {
  formMessage("");
  if (event.target.name in TEXT_FIELDS) {
    event.target.removeAttribute("aria-invalid");
    document.getElementById(`${event.target.name}-error`).hidden = true;
  }
  refreshOverview();
});
form.addEventListener("change", refreshOverview);
document.getElementById("cancel-profile").addEventListener("click", () => {
  fillForm();
  formMessage("Unsaved changes cleared.");
});

const deleteDialog = document.getElementById("delete-dialog");
document.getElementById("delete-profile").addEventListener("click", () => {
  document.getElementById("delete-description").textContent = account.enabled
    ? "This deletes the saved profile from your account. Your sign-in and any old browser copy are kept."
    : "This removes the profile from this page and any copy saved by this app in this browser.";
  deleteDialog.showModal();
});
document.getElementById("keep-profile").addEventListener("click", () => deleteDialog.close());
document.getElementById("confirm-delete-profile").addEventListener("click", async () => {
  if (state.busy || (account.enabled && !account.profiles?.ready)) return;
  const operation = ++state.operation;
  state.busy = true;
  document.getElementById("confirm-delete-profile").disabled = true;
  document.getElementById("keep-profile").disabled = true;
  refreshAccountMode();
  try {
    if (account.enabled) {
      const result = await account.profiles.remove();
      if (result.stale || operation !== state.operation) return;
    } else if (state.storage) clearSavedProfile(state.storage);
    else if (state.hasBrowserCopy) throw new Error("Storage unavailable.");
  } catch {
    if (operation !== state.operation) return;
    deleteDialog.close();
    formMessage(account.enabled ? "The account profile couldn't be deleted. Check your connection and try again." : "The saved browser copy couldn't be removed. Your profile has been kept; try again when browser storage is available.", true);
    return;
  } finally {
    document.getElementById("confirm-delete-profile").disabled = false;
    document.getElementById("keep-profile").disabled = false;
    if (operation === state.operation) { state.busy = false; refreshAccountMode(); }
  }
  state.profile = null;
  state.remember = false;
  if (!account.enabled) { state.hasBrowserCopy = false; state.legacyProfile = null; }
  fillForm();
  refreshSavedState();
  deleteDialog.close();
  notify("");
  refreshAccountMode();
  formMessage(account.enabled ? "Your saved account profile has been deleted. Your sign-in has been kept." : "Your saved profile has been deleted from this page and this app's browser storage.");
  form.elements.firstName.focus();
});

document.getElementById("import-browser-profile").addEventListener("click", () => {
  if (!account.profiles?.ready || !state.legacyProfile || state.busy) return;
  for (const key of Object.keys(TEXT_FIELDS)) form.elements[key].value = state.legacyProfile[key];
  form.elements.emailOffers.checked = state.legacyProfile.emailOffers;
  form.elements.smsOffers.checked = state.legacyProfile.smsOffers;
  clearErrors();
  refreshOverview();
  formMessage("Browser details are in the form for review. Choose Save profile to copy them into your account. Your account's saved profile hasn't changed yet.");
  form.elements.firstName.focus();
});
const browserCopyDialog = document.getElementById("browser-copy-dialog");
document.getElementById("remove-browser-profile").addEventListener("click", () => browserCopyDialog.showModal());
document.getElementById("keep-browser-copy").addEventListener("click", () => browserCopyDialog.close());
document.getElementById("confirm-remove-browser-copy").addEventListener("click", () => {
  try { clearSavedProfile(state.storage); }
  catch { browserCopyDialog.close(); formMessage("The browser copy couldn't be removed. Try again when browser storage is available.", true); return; }
  state.hasBrowserCopy = false;
  state.legacyProfile = null;
  browserCopyDialog.close();
  refreshAccountMode();
  formMessage("The old browser copy has been removed. Your account profile and current form have been kept.");
});

const reviewDialog = document.getElementById("review-dialog");
function openSignupPreview(retailer) {
  document.getElementById("review-retailer").textContent = `${retailer.name} · ${retailer.program}`;
  document.getElementById("review-empty").hidden = Boolean(state.profile);
  const details = document.getElementById("review-details");
  // Until adapters exist this previews the whole saved profile, not a retailer's actual request.
  const rows = state.profile ? fieldsForReview(state.profile, Object.keys(TEXT_FIELDS)) : [];
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
  if (!["", "#home", "#profile", "#account"].includes(location.hash)) return;
  const isProfile = location.hash === "#profile";
  const isAccount = location.hash === "#account";
  document.getElementById("home-view").hidden = isProfile || isAccount;
  document.getElementById("profile-view").hidden = !isProfile;
  document.getElementById("account-view").hidden = !isAccount;
  for (const [id, current] of [["home-link", !isProfile && !isAccount], ["profile-link", isProfile], ["account-link", isAccount]]) {
    const link = document.getElementById(id);
    if (current) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  document.title = isProfile ? "My profile · Loyalty Card" : isAccount ? "Account · Loyalty Card" : "Loyalty Card";
  if (focusHeading) {
    const heading = document.getElementById(isProfile ? "profile-title" : isAccount ? "account-title" : "welcome-title");
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
account.init();
