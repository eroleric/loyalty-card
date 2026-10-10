// Local browser-test harness only. It never sends email or creates real accounts.
// It uses the real SDK and migration, with synthetic Supabase Auth responses.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
const root = fileURLToPath(new URL("../dist/", import.meta.url));
const db = await PGlite.create();
await db.exec(`create role anon; create role authenticated; create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'', true), '''')::uuid';
  grant usage on schema public, auth to anon, authenticated; grant execute on function auth.uid() to authenticated;`);
await db.exec(await readFile(new URL("../supabase/migrations/202610100001_private_profiles.sql", import.meta.url), "utf8"));
const users = [
  { id: "11111111-1111-4111-8111-111111111111", email: "taylor@example.com" },
  { id: "22222222-2222-4222-8222-222222222222", email: "jordan@example.com" },
].map(user => ({ ...user, aud: "authenticated", role: "authenticated", app_metadata: { provider: "email", providers: ["email"] }, user_metadata: {}, created_at: "2026-10-10T12:00:00Z" }));
for (const user of users) await db.query("insert into auth.users values ($1)", [user.id]);
const tokens = new Map();
let cloud = true, failLoad = false, failSave = false, emailSignIn = "code";
let serial = Promise.resolve();
function json(response, status, value) { response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(value)); }
function session(user) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = [ { alg: "HS256", typ: "JWT" }, { sub: user.id, exp: expires, aud: "authenticated", role: "authenticated" } ].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".") + ".bG9jYWwtdGVzdC1vbmx5";
  tokens.set(token, user);
  return { access_token: token, token_type: "bearer", expires_in: 3600, expires_at: expires, refresh_token: `fixture-refresh-${user.id}`, user };
}
async function body(request) { let raw = ""; for await (const chunk of request) raw += chunk; return raw ? JSON.parse(raw) : {}; }
http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1:4174");
    if (url.pathname === "/__fixture/control" && request.method === "POST") {
      const value = await body(request);
      if (typeof value.cloud === "boolean") cloud = value.cloud;
      if (typeof value.failLoad === "boolean") failLoad = value.failLoad;
      if (typeof value.failSave === "boolean") failSave = value.failSave;
      if (["code", "link"].includes(value.emailSignIn)) emailSignIn = value.emailSignIn;
      json(response, 200, { cloud, failLoad, failSave, emailSignIn }); return;
    }
    if (url.pathname === "/__fixture/link") {
      const user = users.find(user => user.email === url.searchParams.get("email"));
      if (!user) { json(response, 400, { message: "Use a fictional fixture account." }); return; }
      const value = session(user);
      const hash = new URLSearchParams({ access_token: value.access_token, refresh_token: value.refresh_token, expires_in: "3600", token_type: "bearer", type: "magiclink" });
      response.writeHead(302, { Location: `/#${hash}`, "Cache-Control": "no-store" }).end(); return;
    }
    if (url.pathname === "/config.js") {
      response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }).end(`export const accountConfig={enabled:${cloud},supabaseUrl:"https://localtest.supabase.co",publishableKey:"sb_publishable_local_test_only",emailSignIn:"${emailSignIn}",testEmailOnly:true};`); return;
    }
    if (url.pathname === "/vendor/supabase.js") {
      response.writeHead(200, { "Content-Type": "text/javascript", "Cache-Control": "no-store" }).end('import {createClient as realClient} from "./supabase-real.js";export function createClient(url,key,options){return realClient(location.origin,key,options)}'); return;
    }
    if (url.pathname.startsWith("/auth/v1/")) {
      const value = request.method === "POST" ? await body(request) : {};
      if (url.pathname === "/auth/v1/otp") { json(response, 200, {}); return; }
      if (url.pathname === "/auth/v1/verify") {
        const user = users.find(user => user.email === value.email);
        if (!user || value.token !== "111111") { json(response, 403, { error_code: "otp_expired", msg: "Local test code invalid" }); return; }
        json(response, 200, session(user)); return;
      }
      if (url.pathname === "/auth/v1/logout") { response.writeHead(204).end(); return; }
      if (url.pathname === "/auth/v1/user") {
        const user = tokens.get(request.headers.authorization?.replace(/^Bearer /, ""));
        json(response, user ? 200 : 401, user || { msg: "Unauthorized" }); return;
      }
    }
    if (url.pathname === "/rest/v1/loyalty_profiles") {
      const user = tokens.get(request.headers.authorization?.replace(/^Bearer /, ""));
      if (!user) { json(response, 401, { message: "Unauthorized" }); return; }
      if ((request.method === "GET" && failLoad) || (request.method === "POST" && failSave)) { json(response, 503, { message: "Synthetic offline test" }); return; }
      const value = request.method === "POST" ? await body(request) : null;
      const job = serial.then(async () => {
        await db.exec("set role authenticated");
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user.id]);
        try {
          const requestedId = url.searchParams.get("user_id")?.replace(/^eq\./, "") || user.id;
          if (request.method === "GET") return (await db.query("select user_id,profile,updated_at from public.loyalty_profiles where user_id=$1", [requestedId])).rows;
          if (request.method === "POST") return (await db.query("insert into public.loyalty_profiles(user_id,profile) values ($1,$2) on conflict(user_id) do update set user_id=excluded.user_id,profile=excluded.profile returning user_id,profile,updated_at", [value.user_id, value.profile])).rows[0];
          if (request.method === "DELETE") { await db.query("delete from public.loyalty_profiles where user_id=$1", [requestedId]); return null; }
          throw new Error("Unsupported method");
        } finally { await db.exec("reset role"); }
      });
      serial = job.catch(() => {});
      const data = await job;
      if (request.method === "DELETE") response.writeHead(204).end();
      else json(response, 200, data);
      return;
    }
    const path = url.pathname === "/vendor/supabase-real.js" ? "/vendor/supabase.js" : url.pathname === "/" ? "/index.html" : url.pathname;
    const target = resolve(root, `.${decodeURIComponent(path)}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) { response.writeHead(403).end(); return; }
    let content = await readFile(target);
    if (path === "/index.html") content = Buffer.from(content.toString().replace("<body>", '<body><p style="background:#fce0bb;padding:12px;text-align:center;margin:0;font-size:13px">LOCAL TEST · fictional accounts · code 111111 · no email sent</p>'));
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
    response.writeHead(200, { "Content-Type": mime[extname(target)] || "application/octet-stream", "Cache-Control": "no-store" }).end(content);
  } catch { json(response, 500, { message: "Local test request failed" }); }
}).listen(4174, "127.0.0.1", () => console.log("Local test harness: http://127.0.0.1:4174 — fictional accounts only"));
