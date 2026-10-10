import { TEXT_FIELDS, PROFILE_VERSION, validateProfile } from "./profile.js";

export function validateAccountConfig(config) {
  if (!config?.enabled) return false;
  let url;
  try { url = new URL(config.supabaseUrl); } catch { throw new Error("Account setup is incomplete."); }
  // This build deliberately supports managed Supabase projects only.
  if (url.protocol !== "https:" || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Account setup is incomplete.");
  // Restrict to the modern browser-safe key; never accept a server key or JWT.
  if (typeof config.publishableKey !== "string" || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(config.publishableKey)) throw new Error("A public publishable key is required.");
  if (config.emailSignIn !== undefined && !["code", "link"].includes(config.emailSignIn)) throw new Error("Unsupported email sign-in method.");
  return true;
}

export function isEmailLinkCallback(href) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  return ["access_token", "error", "error_code"].some(key => hash.has(key) || url.searchParams.has(key));
}

export function cleanEmailLinkUrl(href) {
  const url = new URL(href);
  for (const key of ["access_token", "refresh_token", "provider_token", "provider_refresh_token", "expires_in", "expires_at", "token_type", "error", "error_code", "error_description"]) url.searchParams.delete(key);
  url.hash = "";
  return `${url.pathname}${url.search}`;
}

export function createSessionStorage(storage, { runtimeKey, storageKey } = {}) {
  const memory = new Map();
  let available = true;
  let browserCopy = false;
  return {
    getItem(key) {
      if (runtimeKey && key.startsWith(runtimeKey)) key = storageKey + key.slice(runtimeKey.length);
      if (available && storage) {
        try {
          const value = storage.getItem(key);
          if (value !== null) { memory.set(key, value); browserCopy = true; }
          return value;
        } catch { available = false; }
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      if (runtimeKey && key.startsWith(runtimeKey)) key = storageKey + key.slice(runtimeKey.length);
      memory.set(key, value);
      if (available && storage) {
        try { storage.setItem(key, value); browserCopy = true; } catch { available = false; }
      }
    },
    removeItem(key) {
      if (runtimeKey && key.startsWith(runtimeKey)) key = storageKey + key.slice(runtimeKey.length);
      if (storage && (available || browserCopy)) {
        // Propagate failure if a browser copy may remain. Do not falsely report
        // sign-out while the old session could return on reload.
        try { storage.removeItem(key); }
        catch (error) { if (browserCopy) throw error; available = false; }
      }
      memory.delete(key);
      browserCopy = false;
    },
  };
}

export function accountError(error, fallback = "Something went wrong. Please try again.") {
  if (["over_email_send_rate_limit", "over_request_rate_limit"].includes(error?.code) || error?.status === 429) return "Please wait a minute before trying again. Email limits may also apply.";
  if (["otp_expired", "otp_disabled", "invalid_credentials"].includes(error?.code)) return "That code is invalid or expired. Check it, or request a new code.";
  if (error?.code === "email_address_not_authorized") return "Email sign-in isn't available for this address yet. The app's email service needs to be connected.";
  // Do not render provider messages, database details, tokens, or submitted data.
  return fallback;
}

export function validateCloudRecord(record, userId) {
  if (!record) return null;
  if (record.user_id !== userId || record.profile?.schemaVersion !== PROFILE_VERSION || typeof record.updated_at !== "string" || !Number.isFinite(Date.parse(record.updated_at))) throw new Error("Invalid account profile.");
  const result = validateProfile(record.profile);
  if (Object.keys(result.errors).length) throw new Error("Invalid account profile.");
  return result.profile;
}

// Gate responses by account revision. An old user's delayed request cannot populate
// a new user's screen, nor may saving overwrite a profile that failed to load.
export class AccountProfiles {
  constructor(client) {
    this.client = client;
    this.user = null;
    this.revision = 0;
    this.ready = false;
  }
  setUser(user) {
    if ((user?.id || null) === (this.user?.id || null)) { this.user = user; return false; }
    this.user = user;
    this.revision += 1;
    this.ready = false;
    return true;
  }
  async load() {
    if (!this.user) throw new Error("Sign in first.");
    const revision = this.revision, userId = this.user.id;
    this.ready = false;
    const { data, error } = await this.client.from("loyalty_profiles").select("user_id,profile,updated_at").eq("user_id", userId).maybeSingle();
    if (revision !== this.revision) return { stale: true };
    if (error) throw error;
    const profile = validateCloudRecord(data, userId);
    this.ready = true;
    return { stale: false, profile };
  }
  async save(input) {
    if (!this.user || !this.ready) throw new Error("Your account profile must load before saving.");
    const { profile, errors } = validateProfile(input);
    if (Object.keys(errors).length || !Object.keys(TEXT_FIELDS).some(key => profile[key])) throw new Error("Add valid profile details first.");
    const revision = this.revision, userId = this.user.id;
    const { data, error } = await this.client.from("loyalty_profiles").upsert({ user_id: userId, profile }, { onConflict: "user_id" }).select("user_id,profile,updated_at").single();
    if (revision !== this.revision) return { stale: true };
    if (error) throw error;
    return { stale: false, profile: validateCloudRecord(data, userId) };
  }
  async remove() {
    if (!this.user || !this.ready) throw new Error("Your account profile must load before deleting.");
    const revision = this.revision, userId = this.user.id;
    const { error } = await this.client.from("loyalty_profiles").delete().eq("user_id", userId);
    if (revision !== this.revision) return { stale: true };
    if (error) throw error;
    return { stale: false };
  }
}
