import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_KEY, emptyProfile, normalizeProfile, validateProfile, profileSummary, fieldsForReview, readSavedProfile, writeSavedProfile, clearSavedProfile } from "../dist/profile.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

const sample = () => ({ ...emptyProfile(), firstName: "Taylor", lastName: "Example", email: "taylor@example.com", phone: "+1 (202) 555-0148", addressLine1: "123 Example Street", city: "Example City", region: "VA", postalCode: "22201", country: "United States" });

test("unknown fields are excluded; offer preferences are off unless explicitly boolean true", () => {
  const result = normalizeProfile({ firstName: "  Taylor  ", password: "never-keep-this", retailerTermsAccepted: true, emailOffers: "true", smsOffers: true });
  assert.equal(result.firstName, "Taylor");
  assert.equal(result.emailOffers, false);
  assert.equal(result.smsOffers, true);
  assert.equal("password" in result, false);
  assert.equal("retailerTermsAccepted" in result, false);
});

test("partial profiles are valid and completion does not invent retailer requirements", () => {
  const partial = { firstName: "Taylor" };
  assert.deepEqual(validateProfile(partial).errors, {});
  const summary = profileSummary(partial);
  assert.equal(summary.complete, 1);
  assert.equal(summary.total, 9);
  assert.equal(summary.groups.every(group => !group.complete), true);
  assert.equal(profileSummary(sample()).complete, 9);
});

test("invalid email, phone, future birthday, impossible date, and excess length are rejected", () => {
  const result = validateProfile({ ...sample(), firstName: "x".repeat(101), email: "bad address", phone: "123", dateOfBirth: "2030-01-01" }, "2026-10-09");
  assert.deepEqual(Object.keys(result.errors).sort(), ["dateOfBirth", "email", "firstName", "phone"]);
  assert.ok(validateProfile({ dateOfBirth: "2025-02-30" }).errors.dateOfBirth);
  assert.deepEqual(validateProfile({ ...sample(), dateOfBirth: "2000-02-29" }, "2026-10-09").errors, {});
});

test("device profiles round-trip and delete only this application's key", () => {
  const storage = memoryStorage();
  storage.setItem("other-app", "untouched");
  writeSavedProfile(storage, sample(), "2026-10-09T12:00:00.000Z");
  assert.deepEqual(readSavedProfile(storage), { profile: sample(), updatedAt: "2026-10-09T12:00:00.000Z" });
  clearSavedProfile(storage);
  assert.equal(readSavedProfile(storage), null);
  assert.equal(storage.getItem("other-app"), "untouched");
});

test("corrupted, unsupported, and invalid saved records cannot silently populate the form", () => {
  const storage = memoryStorage();
  for (const value of ["not-json", "null", JSON.stringify({ version: 999 }), JSON.stringify({ version: 1, profile: { ...sample(), email: "bad" }, updatedAt: "2026-10-09T12:00:00Z" })]) {
    storage.setItem(STORAGE_KEY, value);
    assert.throws(() => readSavedProfile(storage));
  }
});

test("storage failures propagate instead of reporting a successful save or deletion", () => {
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
  assert.throws(() => readSavedProfile(storage), /blocked/);
  assert.throws(() => writeSavedProfile(storage, sample()), /quota/);
  assert.throws(() => clearSavedProfile(storage), /blocked/);
});

test("review exposes only requested profile fields; preferences and consent are never silently added", () => {
  const fields = fieldsForReview({ ...sample(), emailOffers: true, password: "never-share" }, ["firstName", "email", "firstName"]);
  assert.deepEqual(fields.map(field => field.key), ["firstName", "email"]);
  assert.equal(fields[1].value, "taylor@example.com");
  assert.throws(() => fieldsForReview(sample(), ["password"]), /Unknown/);
  assert.throws(() => fieldsForReview(sample(), ["emailOffers"]), /Unknown/);
  assert.throws(() => fieldsForReview(sample()), /Unknown/);
});
