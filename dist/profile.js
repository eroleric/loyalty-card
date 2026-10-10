// Shared profile fields. Retailer adapters can map these later without changing the form.
export const PROFILE_VERSION = 1;
export const STORAGE_KEY = "loyalty-card.profile.v1";
export const TEXT_FIELDS = Object.freeze({
  firstName: 100, lastName: 100, email: 254, phone: 40,
  addressLine1: 150, addressLine2: 150, city: 100, region: 100,
  postalCode: 20, country: 100, dateOfBirth: 10,
});
export const COMMON_FIELDS = Object.freeze([
  "firstName", "lastName", "email", "phone", "addressLine1", "city", "region", "postalCode", "country",
]);
export const FIELD_LABELS = Object.freeze({
  firstName: "First name", lastName: "Last name", email: "Email address", phone: "Phone number",
  addressLine1: "Street address", addressLine2: "Apartment / suite", city: "City", region: "State / province / region",
  postalCode: "ZIP / postal code", country: "Country", dateOfBirth: "Birthday",
});

export function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function emptyProfile() {
  return { schemaVersion: PROFILE_VERSION, ...Object.fromEntries(Object.keys(TEXT_FIELDS).map(key => [key, ""])), emailOffers: false, smsOffers: false };
}

export function normalizeProfile(input = {}) {
  const profile = emptyProfile();
  for (const key of Object.keys(TEXT_FIELDS)) {
    if (typeof input?.[key] === "string") profile[key] = input[key].trim();
  }
  profile.emailOffers = input?.emailOffers === true;
  profile.smsOffers = input?.smsOffers === true;
  return profile;
}

export function validateProfile(input, today = localToday()) {
  const profile = normalizeProfile(input);
  const errors = {};
  for (const [key, maximum] of Object.entries(TEXT_FIELDS)) {
    if (profile[key].length > maximum) errors[key] = `Use ${maximum} characters or fewer.`;
  }
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) errors.email = "Enter an email address like you@example.com.";
  if (profile.phone && (!/^[+\d\s().-]+$/.test(profile.phone) || !/^\d{7,15}$/.test(profile.phone.replace(/\D/g, "")))) errors.phone = "Enter a phone number with 7–15 digits.";
  if (profile.dateOfBirth) {
    const date = new Date(`${profile.dateOfBirth}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== profile.dateOfBirth) errors.dateOfBirth = "Enter a valid birthday.";
    else if (profile.dateOfBirth > today) errors.dateOfBirth = "Birthday must be today or earlier.";
  }
  return { profile, errors };
}

export function profileSummary(input) {
  const profile = normalizeProfile(input);
  const missing = COMMON_FIELDS.filter(key => !profile[key]);
  return {
    complete: COMMON_FIELDS.length - missing.length,
    total: COMMON_FIELDS.length,
    missing,
    groups: [
      { label: "Name", complete: ["firstName", "lastName"].every(key => Boolean(profile[key])) },
      { label: "Email & phone", complete: ["email", "phone"].every(key => Boolean(profile[key])) },
      { label: "Address", complete: ["addressLine1", "city", "region", "postalCode", "country"].every(key => Boolean(profile[key])) },
    ],
  };
}

// A future adapter must supply its requested fields. Preferences never become consent.
export function fieldsForReview(input, requestedFields) {
  const profile = normalizeProfile(input);
  if (!Array.isArray(requestedFields) || requestedFields.some(key => !Object.hasOwn(TEXT_FIELDS, key))) throw new Error("Unknown review field.");
  return [...new Set(requestedFields)].map(key => ({ key, label: FIELD_LABELS[key], value: profile[key] }));
}

// Access is explicit and injectable so disabled storage and damaged records can be tested.
export function readSavedProfile(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return null;
  const record = JSON.parse(raw);
  if (!record || record.version !== PROFILE_VERSION || record.profile?.schemaVersion !== PROFILE_VERSION || typeof record.updatedAt !== "string" || !Number.isFinite(Date.parse(record.updatedAt))) throw new Error("Unsupported saved profile.");
  const result = validateProfile(record.profile);
  if (Object.keys(result.errors).length) throw new Error("Saved profile has invalid details.");
  return { profile: result.profile, updatedAt: record.updatedAt };
}

export function writeSavedProfile(storage, input, remember, now = new Date().toISOString()) {
  const { profile, errors } = validateProfile(input);
  if (Object.keys(errors).length) throw new Error("Profile has invalid details.");
  if (remember) storage.setItem(STORAGE_KEY, JSON.stringify({ version: PROFILE_VERSION, profile, updatedAt: now }));
  else storage.removeItem(STORAGE_KEY);
  return { profile, updatedAt: now };
}

export function clearSavedProfile(storage) {
  storage.removeItem(STORAGE_KEY);
}
