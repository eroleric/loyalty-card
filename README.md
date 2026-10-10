# Loyalty Card

A responsive loyalty UI with Circle K as its only retailer, reusable signup details, and a prototype email-account integration for Supabase.

Source repository: https://github.com/eroleric/loyalty-card

## Scope

- Home screen and reusable retailer cards.
- Circle K / Inner Circle display information only.
- Profile: name, email, phone, mailing address, optional birthday, and optional offer preferences.
- Partial profile saving, format validation, editing, cancellation, common-field progress, and deletion.
- Reusable signup-review preview, showing the saved profile without sending it anywhere. Signup is explicitly unavailable.
- Page-memory storage by default. Browser storage is explicitly opt-in and can be turned off to remove a remembered copy.
- Account screen with email links or codes, sign-out, loading/retry states, and private profile CRUD. **Live accounts are not activated yet:** `dist/config.js` has `enabled: false`. The prototype uses default Supabase sign-in links, avoiding an extra email-service setup for initial team testing. While disabled, the existing browser-profile behavior remains available.
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

1. Use the dedicated Supabase project owned by the app operator. Apply the migration before enabling the frontend. The table is `public.loyalty_profiles`, keyed by `auth.users.id`, with cascading removal when a user is deleted. The operator most recently selected "Leave database unchanged"; the migration has been staged for review but has not been run.
2. For the prototype, keep the default Email Auth templates and set the Site URL to `https://eroleric.github.io/loyalty-card/`. `emailSignIn: "link"` uses `signInWithOtp` with that return URL, then the SDK consumes the implicit email callback. Callback tokens/errors are removed from the URL before routing to Account. No passwords are collected. Keep provider verification/rate limits enabled.
3. Supabase's default email service is restricted to project-team email addresses and has restrictive delivery limits. That is sufficient only for initial owner/team tests; do not invite arbitrary customers. A custom SMTP service is deferred until wider testing. See the [official SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp) and [passwordless email documentation](https://supabase.com/docs/guides/auth/auth-email-passwordless). To return to numeric codes later, configure the email template to include `{{ .Token }}` and set `emailSignIn: "code"`.
4. Run `supabase/verify_private_profiles.sql` on the hosted database, check an anonymous API request, then verify real link delivery and sign-in for an allowed test account. Own read/write/delete must succeed, foreign and anonymous access must fail, invalid profile data must fail, and sign-out must clear visible details.
5. Set the project's HTTPS URL and modern `sb_publishable_...` key in `dist/config.js`, then enable and publish. These are public browser settings; service-role keys, secret keys, database passwords, SMTP secrets, and management tokens must never enter `dist/` or the repository. `.env` files are ignored.

The dedicated project `jxkdcwqezmtkuyvxvben` now exists in the free Loyalty Card organization. Its initial database inspection showed zero public tables and zero app users. Public connection settings are present in `dist/config.js`, but account activation remains disabled. Installing the private table, setting the return URL, and hosted access/email checks remain outstanding. SMTP and paid template editing are deferred for this prototype; no paid upgrade has been selected.

`supabase/verify_private_profiles.sql` is a hosted SQL verification workflow with two fictional users. It checks actual database roles, per-user access, CRUD, anonymous denial, timestamps, and invalid data, then rolls back all test changes. It does not prove email delivery, JWT issuance, or a complete browser login. The script is checked locally on PGlite before use on the hosted database. A real email sign-in remains a separate activation check.

`schemaVersion: 1` fields are retailer-neutral. Nine common fields are a completeness guide only; the profile permits partial saves. `fieldsForReview(profile, requestedFields)` builds an allowlisted review snapshot and rejects unknown fields or preferences. The current preview shows the whole saved profile and clearly does not claim to match Circle K's requested fields. Each future adapter must define its own requested fields, validation and verification needs, then show the user the exact data to share and obtain retailer-specific consent. Offer preferences do not grant consent. Email/phone format checks do not verify ownership, address validity, or age.

Retailer integrations still need a supported execution surface (such as an extension or native integration), review/consent UI, retailer-specific requirements, and honest handling of verification, CAPTCHA, failures and membership confirmation. This public static page cannot fill other websites by itself. Those parts are deliberately deferred.

## GitHub Pages

Live preview: https://eroleric.github.io/loyalty-card/

The website files in `dist/` are published to the root of the `gh-pages` branch. GitHub Pages uses that branch and the `/` folder. Relative asset links support the `/loyalty-card/` project URL. The repository and preview are public.

After committing UI changes on `main` and pushing them to GitHub, publish the updated website with `git subtree push --prefix=dist origin gh-pages`.

The source lives on `main`. Hosting configuration for the earlier Sites preview is excluded from the repository.
