import { AccountProfiles, validateAccountConfig, createSessionStorage, accountError, isEmailLinkCallback, cleanEmailLinkUrl } from "./account.js";

const $ = id => document.getElementById(id);

export class AccountUI {
  constructor(config, onChange) {
    this.config = config;
    this.linkMode = config.emailSignIn === "link";
    this.onChange = onChange;
    this.enabled = false;
    this.client = null;
    this.profiles = null;
    this.user = null;
    this.status = "unavailable";
    this.busy = false;
    this.profileBusy = false;
    this.email = "";
    this.resendAt = 0;
    this.timer = null;
    $("signin-form").addEventListener("submit", event => { event.preventDefault(); this.sendCode(); });
    $("verify-form").addEventListener("submit", event => { event.preventDefault(); this.verifyCode(); });
    $("resend-code").addEventListener("click", () => this.sendCode(true));
    $("change-auth-email").addEventListener("click", () => {
      if (this.busy) return;
      this.email = "";
      $("auth-code").value = "";
      this.message("");
      this.render();
      $("auth-email").focus();
    });
    $("signout").addEventListener("click", () => this.signOut());
    $("retry-profile").addEventListener("click", () => this.loadProfile());
    for (const id of ["auth-email", "auth-code"]) $(id).addEventListener("input", () => {
      $(id).removeAttribute("aria-invalid");
      $(`${id}-error`).hidden = true;
      this.message("");
    });
  }
  message(text, error = false) {
    $("auth-message").textContent = text;
    $("auth-message").hidden = !text;
    $("auth-message").classList.toggle("is-error", error);
  }
  invalid(id, message) {
    $(id).setAttribute("aria-invalid", "true");
    $(`${id}-error`).textContent = message;
    $(`${id}-error`).hidden = false;
    $(id).focus();
  }
  render() {
    const signedIn = Boolean(this.user);
    $("account-unavailable").hidden = this.enabled;
    $("signin-form").hidden = signedIn || Boolean(this.email);
    $("verify-form").hidden = signedIn || !this.email;
    $("signed-account").hidden = !signedIn;
    $("signin-fields").disabled = !this.client || this.busy;
    $("verify-fields").disabled = !this.client || this.busy;
    $("signout").disabled = this.busy || this.profileBusy;
    $("retry-profile").disabled = this.busy || this.status === "loading";
    $("retry-profile").hidden = this.status !== "failed";
    $("send-code").textContent = this.busy ? "Sending…" : this.linkMode ? "Email me a sign-in link" : "Send sign-in code";
    $("signin-description").textContent = this.linkMode ? "We'll email you a one-time sign-in link. Opening it creates your account if you're new here." : "We'll send you a one-time code. If you're new here, verifying your email creates your account.";
    $("verify-prompt").textContent = this.linkMode ? "Open the sign-in link sent to " : "Enter the code sent to ";
    $("auth-code-field").hidden = this.linkMode;
    $("auth-code").disabled = this.linkMode;
    $("verify-code").hidden = this.linkMode;
    $("test-email-notice").hidden = !this.enabled || !this.config.testEmailOnly;
    $("verify-code").textContent = this.busy ? "Please wait…" : "Verify and sign in";
    $("signed-email").textContent = this.user?.email || "";
    $("code-email").textContent = this.email;
    $("account-badge").textContent = !this.enabled ? "Setup pending" : signedIn ? "Signed in" : "Email sign-in";
    $("account-badge").classList.toggle("is-complete", signedIn);
    $("account-link").textContent = signedIn ? "My account" : "Account";
    $("account-profile-status").textContent = this.status === "loading" ? "Loading your saved profile…" : this.status === "failed" ? "Your saved profile couldn't be loaded. Retry before editing so existing details aren't overwritten." : "Your profile saves to this account. You can edit or delete it anytime.";
    this.renderResend();
  }
  renderResend() {
    const seconds = Math.max(0, Math.ceil((this.resendAt - Date.now()) / 1000));
    $("resend-code").disabled = this.busy || seconds > 0;
    $("resend-code").textContent = seconds > 0 ? `Resend in ${seconds}s` : this.linkMode ? "Resend link" : "Resend code";
  }
  async init() {
    try { this.enabled = validateAccountConfig(this.config); } catch { this.message("The account service isn't ready. Your browser profile is still available.", true); }
    this.render();
    if (!this.enabled) return;
    const returnedLink = this.linkMode && isEmailLinkCallback(location.href);
    this.status = "connecting";
    this.onChange({ status: this.status, user: null, profile: null });
    try {
      const { createClient } = await import("./vendor/supabase.js");
      let storage = null;
      try { storage = window.sessionStorage; } catch { /* Use page memory if blocked. */ }
      const storageKey = `loyalty-card.auth.v1.${new URL(this.config.supabaseUrl).hostname}`;
      // The SDK broadcasts auth events to tabs sharing its storageKey. Our tab
      // sessions are independent, so use a fresh channel while mapping storage
      // to a stable tab key. A second tab cannot switch this tab's account.
      const runtimeKey = `${storageKey}.${crypto.randomUUID()}`;
      const timedFetch = async (input, init = {}) => {
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (init.signal?.aborted) abort();
        init.signal?.addEventListener("abort", abort, { once: true });
        const timeout = setTimeout(abort, 20000);
        try { return await fetch(input, { ...init, signal: controller.signal }); }
        finally { clearTimeout(timeout); init.signal?.removeEventListener("abort", abort); }
      };
      this.client = createClient(this.config.supabaseUrl, this.config.publishableKey, {
        auth: { storage: createSessionStorage(storage, { runtimeKey, storageKey }), storageKey: runtimeKey, persistSession: true, autoRefreshToken: true, flowType: "implicit", detectSessionInUrl: this.linkMode },
        global: { fetch: timedFetch },
      });
      this.profiles = new AccountProfiles(this.client);
      // Don't await Supabase operations inside the SDK's auth callback (its lock
      // is held). Account changes clear visible profile data immediately.
      this.client.auth.onAuthStateChange((event, session) => {
        const user = session?.user || null;
        const changed = this.profiles.setUser(user);
        this.user = user;
        if (changed || event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
          this.status = user ? "loading" : "signed-out";
          this.email = "";
          $("auth-code").value = "";
          $("auth-email").value = "";
          this.message("");
          this.onChange({ status: this.status, user, profile: null });
          this.render();
          if (user) setTimeout(() => this.loadProfile(), 0);
        } else this.render();
      });
      const { error } = await this.client.auth.getSession();
      if (error) throw error;
      if (returnedLink) {
        // The SDK verifies and consumes the callback before routing. Never show
        // provider error descriptions, or leave auth tokens in the app's URL.
        history.replaceState(null, "", cleanEmailLinkUrl(location.href));
        location.hash = "account";
        if (!this.user) this.message("That sign-in link couldn't be used. It may have expired. Request a new link below.", true);
      }
      this.render();
    } catch {
      if (returnedLink) {
        history.replaceState(null, "", cleanEmailLinkUrl(location.href));
        location.hash = "account";
      }
      this.client = null;
      this.status = "failed";
      this.message("Sign-in couldn't start. Reload this page to try again.", true);
      this.onChange({ status: this.status, user: null, profile: null });
      this.render();
    }
  }
  async sendCode(resend = false) {
    if (!this.client || this.busy || (resend && Date.now() < this.resendAt)) return;
    const email = resend ? this.email : $("auth-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      this.invalid("auth-email", "Enter a valid email address."); return;
    }
    this.busy = true;
    this.message("");
    this.render();
    try {
      const options = { shouldCreateUser: true };
      if (this.linkMode) options.emailRedirectTo = new URL("./", location.href).href;
      const { error } = await this.client.auth.signInWithOtp({ email, options });
      if (error) throw error;
      this.email = email;
      this.resendAt = Date.now() + 60000;
      clearInterval(this.timer);
      this.timer = setInterval(() => {
        this.renderResend();
        if (Date.now() >= this.resendAt) { clearInterval(this.timer); this.timer = null; }
      }, 1000);
      this.message(this.linkMode ? "Check your inbox and open the sign-in link. It may take a moment to arrive." : "Check your inbox for the sign-in code. It may take a moment to arrive.");
    } catch (error) { this.message(accountError(error, "The sign-in email couldn't be sent. Try again, or check back when email sign-in is available."), true); }
    finally { this.busy = false; this.render(); }
    if (this.email && !this.linkMode) $("auth-code").focus();
  }
  async verifyCode() {
    if (!this.client || this.busy || !this.email || this.linkMode) return;
    const token = $("auth-code").value.trim();
    if (!/^[0-9]{6,10}$/.test(token)) { this.invalid("auth-code", "Enter the numeric code from your email."); return; }
    this.busy = true;
    this.message("");
    this.render();
    try {
      const { error } = await this.client.auth.verifyOtp({ email: this.email, token, type: "email" });
      if (error) throw error;
      $("auth-code").value = "";
      this.message("You're signed in. Your account profile is loading.");
    } catch (error) { this.message(accountError(error, "Sign-in failed. Check the code or request a new one."), true); }
    finally { this.busy = false; this.render(); }
  }
  async loadProfile() {
    if (!this.user || !this.profiles) return;
    this.status = "loading";
    this.render();
    this.onChange({ status: this.status, user: this.user, profile: null });
    const revision = this.profiles.revision;
    try {
      const result = await this.profiles.load();
      if (result.stale) return;
      this.status = "ready";
      this.onChange({ status: this.status, user: this.user, profile: result.profile });
      this.message("");
    } catch {
      if (revision !== this.profiles.revision) return;
      this.status = "failed";
      this.onChange({ status: this.status, user: this.user, profile: null });
      this.message("Your account profile couldn't be loaded. Your saved details haven't been changed.", true);
    }
    this.render();
  }
  async signOut() {
    if (!this.client || this.busy || this.profileBusy) return;
    this.busy = true;
    this.render();
    try {
      // Local scope removes this tab's session; other signed-in devices remain.
      const { error } = await this.client.auth.signOut({ scope: "local" });
      if (error) throw error;
      this.profiles.setUser(null);
      this.user = null;
      this.status = "signed-out";
      this.onChange({ status: this.status, user: null, profile: null });
      this.message("You're signed out. Your saved account profile has been kept.");
    } catch { this.message("Sign-out couldn't finish. Please try again.", true); }
    finally { this.busy = false; this.render(); }
  }
}
