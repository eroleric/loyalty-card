# Loyalty Card

A responsive loyalty UI with Circle K as its only retailer, reusable signup details, and an email-account integration for Supabase.

Source repository: https://github.com/eroleric/loyalty-card

## Scope

- Home screen and reusable retailer cards.
- Circle K / Inner Circle display information only.
- Profile: name, email, phone, mailing address, optional birthday, and optional offer preferences.
- Partial profile saving, format validation, editing, cancellation, common-field progress, and deletion.
- Reusable signup-review preview, showing the saved profile without sending it anywhere. Signup is explicitly unavailable.
- Page-memory storage by default. Browser storage is explicitly opt-in and can be turned off to remove a remembered copy.
- Account screen with email codes, sign-out, loading/retry states, and private profile CRUD. **Live accounts are not activated yet:** `dist/config.js` has `enabled: false` until a real project and email delivery are configured and tested. While disabled, the existing browser-profile behavior remains available.
- Once enabled, profile saving requires sign-in and a successful initial load. Existing browser details are only uploaded after explicit review and Save profile; the old copy can be removed separately.
- No retailer signup, autofill, payments, point balances, or retailer connections.
- A responsive grid renders the full retailer list. No fixed retailer limit or hard-coded card slots.

## Files

- `dist/index.html`: Home-screen structure and no-JavaScript fallback.
- `dist/styles.css`: Responsive visual design.
- `dist/retailers.js`: Retailer display records. Add records here to expand the catalog.
- `dist/app.js`: Reusable retailer rendering, navigation, and profile UI.
- `dist/profile.js`: Versioned field schema, normalization, validation, completeness, and opt-in browser persistence.
- `dist/account.js` and `dist/account-ui.js`: Account requests, response boundaries, session storage, and email-code UI.
- `dist/config.js`: Browser-safe public connection settings and activation gate. Never add a secret/service-role key.
- `dist/vendor/supabase.js`: Bundled, pinned Supabase SDK. Rebuilt with `pnpm build`.
- `supabase/migrations/202610100001_private_profiles.sql`: Profile table, server validation, permissions, and per-user row access rules.
- `tests/profile.test.mjs`: Tests for validation, data boundaries, storage consent, deletion, and storage failures. Test records are fictional.
- `tests/account.test.mjs` and `tests/database.test.mjs`: Account races, failed requests, session boundaries, and actual PostgreSQL CRUD/access tests using PGlite.
- `tests/fixture-server.mjs`: Local browser-test harness with synthetic email responses, the real SDK, and PostgreSQL rules. Never deploy it; it sends no real email.
- `serve.mjs`: Local preview server.

## Preview

With Node.js installed, run `pnpm dev` and open the printed local URL. The browser bundle is committed, so previewing does not need a build.

For development, run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm check`, and `pnpm test`. The lockfile pins dependencies. The PostgreSQL tests do not need Docker or a hosted database.

Run `node tests/fixture-server.mjs` for browser checks at port 4174. Its visible banner identifies fictional accounts; `taylor@example.com` and `jordan@example.com` use code `111111`. A loopback-only control endpoint can inject load/save failures or test upgrading a local profile. Passing these tests does not prove hosted Supabase configuration or email delivery.

This is a browser UI prototype, not a compiled iOS or Android app.

## Data and future integrations

Profile values never go into the public Git repository. The app has no analytics and never submits details to retailers. With accounts disabled it makes no profile-upload requests. With accounts enabled, email sign-in contacts Supabase and Save profile writes the user's allowlisted details to their private account row. Form controls start disabled and native form submission is blocked by the content security policy, preventing accidental submission if scripts fail to load.

The optional legacy browser copy uses unencrypted `localStorage`. Account mode no longer writes profile details there. Auth sessions use `sessionStorage`, falling back to page memory if unavailable; they survive reloads in that tab and normally end when the tab closes. Browser session restore may restore tab storage, so explicitly sign out on shared devices. Each page uses an independent SDK broadcast channel so another tab's sign-in cannot switch its displayed account. Client requests are scoped to the active user, and delayed responses are discarded after an account change. The database independently enforces ownership for every CRUD operation; anonymous users have no table permissions.

GitHub project sites share the `eroleric.github.io` origin. Other scripts running on that origin can access its browser storage. A dedicated app domain is still needed before production collection of real customer profiles. This implementation is a prototype foundation, not a security audit or a compliance certification. No passwords, payment data, identity documents, or retailer consent are stored by this UI. Database operators with administrative access can access records; owner-only app access does not mean end-to-end encryption.

## Activate hosted accounts

1. Connect a dedicated Supabase project owned by the app operator. Apply the migration before enabling the frontend. The table is `public.loyalty_profiles`, keyed by `auth.users.id`, with cascading removal when a user is deleted.
2. Configure Email Auth and the Magic Link email template to send a code: `<h2>Your Loyalty Card sign-in code</h2><p>{{ .Token }}</p>`. This UI uses `signInWithOtp` followed by `verifyOtp({ type: "email" })`; it does not consume magic-link redirects or collect passwords. Keep provider verification/rate limits enabled.
3. Configure an email sending service (custom SMTP) before letting customers sign in. Supabase's default email service is for testing with project-team addresses and has restrictive limits; it cannot onboard arbitrary customers. See the [official SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp) and [email OTP documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless).
4. Check the hosted API with two disposable users and an anonymous request: own read/write/delete succeeds, foreign access and anonymous access fail, invalid profile data fails, and account switching/sign-out clears visible details. Verify real code delivery for an allowed test account.
5. Set the project's HTTPS URL and modern `sb_publishable_...` key in `dist/config.js`, then enable and publish. These are public browser settings; service-role keys, secret keys, database passwords, SMTP secrets, and management tokens must never enter `dist/` or the repository. `.env` files are ignored.

Hosted provisioning, SMTP configuration, and live end-to-end checks remain outstanding while Supabase is unconnected. The local SQL and synthetic browser checks are not substitutes for these activation checks.

`schemaVersion: 1` fields are retailer-neutral. Nine common fields are a completeness guide only; the profile permits partial saves. `fieldsForReview(profile, requestedFields)` builds an allowlisted review snapshot and rejects unknown fields or preferences. The current preview shows the whole saved profile and clearly does not claim to match Circle K's requested fields. Each future adapter must define its own requested fields, validation and verification needs, then show the user the exact data to share and obtain retailer-specific consent. Offer preferences do not grant consent. Email/phone format checks do not verify ownership, address validity, or age.

Retailer integrations still need a supported execution surface (such as an extension or native integration), review/consent UI, retailer-specific requirements, and honest handling of verification, CAPTCHA, failures and membership confirmation. This public static page cannot fill other websites by itself. Those parts are deliberately deferred.

## GitHub Pages

Live preview: https://eroleric.github.io/loyalty-card/

The website files in `dist/` are published to the root of the `gh-pages` branch. GitHub Pages uses that branch and the `/` folder. Relative asset links support the `/loyalty-card/` project URL. The repository and preview are public.

After committing UI changes on `main` and pushing them to GitHub, publish the updated website with `git subtree push --prefix=dist origin gh-pages`.

The source lives on `main`. Hosting configuration for the earlier Sites preview is excluded from the repository.
