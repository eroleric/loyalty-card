import test from "node:test";
import assert from "node:assert/strict";
import { AccountProfiles, validateAccountConfig, createSessionStorage, accountError, validateCloudRecord } from "../dist/account.js";
import { emptyProfile } from "../dist/profile.js";

const userA = { id: "11111111-1111-4111-8111-111111111111", email: "taylor@example.com" };
const userB = { id: "22222222-2222-4222-8222-222222222222", email: "jordan@example.com" };
const record = (user, firstName = "Taylor") => ({ user_id: user.id, profile: { ...emptyProfile(), firstName }, updated_at: "2026-10-10T12:00:00Z" });

function queuedClient(responses, calls = []) {
  return { from(table) {
    const call = { table };
    calls.push(call);
    const query = {
      select(value) { call.select = value; return this; },
      eq(field, value) { call.filter = [field, value]; return this; },
      upsert(value) { call.upsert = value; return this; },
      delete() { call.delete = true; return this; },
      maybeSingle() { return Promise.resolve(responses.shift()); },
      single() { return Promise.resolve(responses.shift()); },
      then(resolve, reject) { return Promise.resolve(responses.shift()).then(resolve, reject); },
    };
    return query;
  } };
}

test("disabled setup sends no account requests; enabled setup rejects server keys and unsafe URLs", () => {
  assert.equal(validateAccountConfig({ enabled: false }), false);
  const config = { enabled: true, supabaseUrl: "https://example.supabase.co", publishableKey: "sb_publishable_example" };
  assert.equal(validateAccountConfig(config), true);
  for (const url of ["http://example.supabase.co", "https://example.supabase.co.attacker.com", "https://user:pass@example.supabase.co", "https://example.supabase.co?token=secret"]) assert.throws(() => validateAccountConfig({ ...config, supabaseUrl: url }));
  for (const key of ["sb_secret_example", "service_role", "eyJhbGciOiJIUzI1NiJ9.payload.signature"]) assert.throws(() => validateAccountConfig({ ...config, publishableKey: key }));
});

test("load, save and delete are scoped to the active account and saves allowlist fields", async () => {
  const calls = [];
  const store = new AccountProfiles(queuedClient([{ data: null }, { data: record(userA) }, {}], calls));
  await assert.rejects(() => store.load(), /Sign in/);
  store.setUser(userA);
  await assert.rejects(() => store.save({ firstName: "Taylor" }), /must load/);
  assert.deepEqual(await store.load(), { stale: false, profile: null });
  const saved = await store.save({ firstName: "Taylor", password: "never-upload" });
  assert.equal(saved.profile.firstName, "Taylor");
  assert.equal(calls[1].upsert.user_id, userA.id);
  assert.equal("password" in calls[1].upsert.profile, false);
  await store.remove();
  assert.deepEqual(calls[0].filter, ["user_id", userA.id]);
  assert.deepEqual(calls[2].filter, ["user_id", userA.id]);
});

test("failed or corrupt loads prevent replacing an unseen account profile", async () => {
  for (const response of [{ error: new Error("offline") }, { data: record(userB) }, { data: { ...record(userA), profile: { ...emptyProfile(), email: "bad" } } }]) {
    const store = new AccountProfiles(queuedClient([response]));
    store.setUser(userA);
    await assert.rejects(() => store.load());
    assert.equal(store.ready, false);
    await assert.rejects(() => store.save({ firstName: "Taylor" }), /must load/);
    await assert.rejects(() => store.remove(), /must load/);
  }
});

test("late load and save responses cannot expose an old account after switching users", async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const store = new AccountProfiles(queuedClient([pending]));
  store.setUser(userA);
  const load = store.load();
  store.setUser(userB);
  release({ data: record(userA) });
  assert.deepEqual(await load, { stale: true });
  assert.equal(store.ready, false);
  let releaseSave;
  const pendingSave = new Promise(resolve => { releaseSave = resolve; });
  store.client = queuedClient([{ data: record(userB, "Jordan") }, pendingSave]);
  await store.load();
  const save = store.save({ firstName: "Jordan" });
  store.setUser(null);
  releaseSave({ data: record(userB, "Jordan") });
  assert.deepEqual(await save, { stale: true });
  assert.equal(store.user, null);
});

test("write errors propagate and malformed response owners are rejected", async () => {
  const store = new AccountProfiles(queuedClient([{ data: null }, { error: new Error("offline") }, { error: new Error("offline") }]));
  store.setUser(userA);
  await store.load();
  await assert.rejects(() => store.save({ firstName: "Taylor" }), /offline/);
  await assert.rejects(() => store.remove(), /offline/);
  assert.throws(() => validateCloudRecord(record(userB), userA.id), /Invalid/);
});

test("sessions use injectable tab storage, fallback to memory, and don't hide failed logout removal", () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const session = createSessionStorage(storage);
  session.setItem("auth", "synthetic-token");
  assert.equal(session.getItem("auth"), "synthetic-token");
  session.removeItem("auth");
  assert.equal(map.has("auth"), false);
  const memory = createSessionStorage({ getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } });
  assert.equal(memory.getItem("auth"), null);
  memory.setItem("auth", "synthetic-token");
  assert.equal(memory.getItem("auth"), "synthetic-token");
  memory.removeItem("auth");
  assert.equal(memory.getItem("auth"), null);
  const blockedDelete = createSessionStorage({ ...storage, removeItem() { throw new Error("blocked"); } });
  blockedDelete.setItem("auth", "synthetic-token");
  assert.throws(() => blockedDelete.removeItem("auth"), /blocked/);
  assert.equal(blockedDelete.getItem("auth"), "synthetic-token");
});

test("provider errors display safe messages, with distinct expired-code and email-setup failures", () => {
  assert.match(accountError({ code: "otp_expired" }), /expired/);
  assert.match(accountError({ code: "email_address_not_authorized" }), /email service/);
  assert.match(accountError({ status: 429 }), /wait/);
  assert.equal(accountError({ message: "raw-database-error secret@example.com token=secret" }, "Safe fallback"), "Safe fallback");
});

test("independent auth broadcast channels still restore the same tab's stored session", () => {
  const map = new Map();
  const storage = { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
  const firstPage = createSessionStorage(storage, { runtimeKey: "auth.random1", storageKey: "auth.tab" });
  firstPage.setItem("auth.random1", "synthetic-token");
  const reloadedPage = createSessionStorage(storage, { runtimeKey: "auth.random2", storageKey: "auth.tab" });
  assert.equal(reloadedPage.getItem("auth.random2"), "synthetic-token");
  assert.equal(map.has("auth.random1"), false);
  reloadedPage.removeItem("auth.random2");
  assert.equal(map.has("auth.tab"), false);
});
