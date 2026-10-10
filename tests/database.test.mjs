import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { emptyProfile } from "../dist/profile.js";

// Execute the real migration on PostgreSQL (WASM), with Supabase auth role/UID
// fixtures. These check SQL permissions, not JavaScript simulations of RLS.
test("database enforces private CRUD, owner boundaries, and server validation", async () => {
  const db = await PGlite.create();
  const alice = "11111111-1111-4111-8111-111111111111";
  const bob = "22222222-2222-4222-8222-222222222222";
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth; create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
      grant usage on schema public, auth to anon, authenticated;
      grant execute on function auth.uid() to authenticated;
      insert into auth.users values ('${alice}'), ('${bob}');`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610100001_private_profiles.sql", import.meta.url), "utf8"));
    async function asUser(id, action) {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id]);
      try { return await action(); } finally { await db.exec("reset role"); }
    }
    const profile = { ...emptyProfile(), firstName: "Taylor" };
    const insert = (id, data = profile) => db.query("insert into public.loyalty_profiles(user_id,profile) values ($1,$2) returning user_id,profile,updated_at", [id, data]);
    await asUser(alice, async () => {
      const created = await insert(alice);
      assert.equal(created.rows[0].profile.firstName, "Taylor");
      assert.ok(created.rows[0].updated_at);
      await assert.rejects(() => insert(bob), /row-level security/);
    });
    await asUser(bob, async () => {
      assert.deepEqual((await db.query("select * from public.loyalty_profiles")).rows, []);
      assert.equal((await db.query("update public.loyalty_profiles set profile=$1 where user_id=$2 returning user_id", [{ ...profile, firstName: "Attacker" }, alice])).rows.length, 0);
      assert.equal((await db.query("delete from public.loyalty_profiles where user_id=$1 returning user_id", [alice])).rows.length, 0);
      // Conflict updates cannot overwrite another user's row either.
      await assert.rejects(() => db.query("insert into public.loyalty_profiles(user_id,profile) values ($1,$2) on conflict(user_id) do update set profile=excluded.profile", [alice, profile]), /row-level security/);
      await insert(bob, { ...profile, firstName: "Jordan" });
      assert.deepEqual((await db.query("select user_id,profile from public.loyalty_profiles")).rows.map(row => row.profile.firstName), ["Jordan"]);
    });
    await asUser(alice, async () => {
      assert.deepEqual((await db.query("select user_id from public.loyalty_profiles")).rows.map(row => row.user_id), [alice]);
      await db.query("insert into public.loyalty_profiles(user_id,profile) values ($1,$2) on conflict(user_id) do update set user_id=excluded.user_id, profile=excluded.profile", [alice, { ...profile, firstName: "Updated" }]);
      assert.equal((await db.query("select profile from public.loyalty_profiles")).rows[0].profile.firstName, "Updated");
      await assert.rejects(() => db.query("update public.loyalty_profiles set user_id=$1", [bob]), /owner cannot change|row-level security/);
      await assert.rejects(() => db.query("update public.loyalty_profiles set updated_at='2000-01-01'"), /permission denied/);
      for (const data of [emptyProfile(), { ...profile, password: "forbidden" }, { ...profile, firstName: "x".repeat(101) }, { ...profile, email: "bad" }, { ...profile, phone: "123" }, { ...profile, dateOfBirth: "2025-02-30" }, { ...profile, dateOfBirth: "2099-01-01" }, { ...profile, smsOffers: "true" }, { firstName: "Missing schema" }]) {
        await assert.rejects(() => db.query("update public.loyalty_profiles set profile=$1", [data]), /check constraint/);
      }
      const removed = await db.query("delete from public.loyalty_profiles returning user_id");
      assert.deepEqual(removed.rows.map(row => row.user_id), [alice]);
      assert.equal((await db.query("select * from public.loyalty_profiles")).rows.length, 0);
    });
    await asUser("", async () => {
      assert.equal((await db.query("select * from public.loyalty_profiles")).rows.length, 0);
      await assert.rejects(() => insert(alice), /row-level security/);
    });
    await db.exec("set role anon");
    for (const sql of ["select * from public.loyalty_profiles", "delete from public.loyalty_profiles", "update public.loyalty_profiles set profile='{}'", `insert into public.loyalty_profiles(user_id,profile) values ('${alice}','{}')`, "truncate public.loyalty_profiles"]) await assert.rejects(() => db.exec(sql), /permission denied/);
    await db.exec("reset role");
    assert.deepEqual((await db.query("select user_id from public.loyalty_profiles")).rows.map(row => row.user_id), [bob]);
    await db.query("delete from auth.users where id=$1", [bob]);
    assert.equal((await db.query("select * from public.loyalty_profiles")).rows.length, 0);
  } finally { await db.close(); }
});
