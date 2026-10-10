# Loyalty Card

A responsive loyalty UI with Circle K as its only retailer and a reusable profile for future signup integrations.

Source repository: https://github.com/eroleric/loyalty-card

## Scope

- Home screen and reusable retailer cards.
- Circle K / Inner Circle display information only.
- Profile: name, email, phone, mailing address, optional birthday, and optional offer preferences.
- Partial profile saving, format validation, editing, cancellation, common-field progress, and deletion.
- Reusable signup-review preview, showing the saved profile without sending it anywhere. Signup is explicitly unavailable.
- Page-memory storage by default. Browser storage is explicitly opt-in and can be turned off to remove a remembered copy.
- No retailer signup, autofill, cloud accounts, payments, point balances, or retailer connections.
- A responsive grid renders the full retailer list. No fixed retailer limit or hard-coded card slots.

## Files

- `dist/index.html`: Home-screen structure and no-JavaScript fallback.
- `dist/styles.css`: Responsive visual design.
- `dist/retailers.js`: Retailer display records. Add records here to expand the catalog.
- `dist/app.js`: Reusable retailer rendering, navigation, and profile UI.
- `dist/profile.js`: Versioned field schema, normalization, validation, completeness, and opt-in browser persistence.
- `tests/profile.test.mjs`: Tests for validation, data boundaries, storage consent, deletion, and storage failures. Test records are fictional.
- `serve.mjs`: Local preview server.

## Preview

With Node.js installed, run `npm run dev` and open the printed local URL. No package installation or build step is needed.

Run `npm run check` to check JavaScript syntax and `npm test` to check profile behavior.

This is a browser UI prototype, not a compiled iOS or Android app.

## Data and future integrations

Profile values never go into the public Git repository. This app has no analytics or profile-upload requests. Saving does not create an account or send anything to a retailer. Form controls start disabled until the submit handler is installed, preventing accidental native form submission if scripts fail to load.

The optional remembered copy uses unencrypted `localStorage` on this browser origin. It is not a secure credential vault or production-grade personal-data store. GitHub project sites share the `eroleric.github.io` origin; other code running on that origin can access origin storage. A dedicated app origin and an appropriate encrypted/native or authenticated storage design should be decided before collecting real customer profiles for production. No passwords, payment data, identity documents, or retailer consent are stored.

`schemaVersion: 1` fields are retailer-neutral. Nine common fields are a completeness guide only; the profile permits partial saves. `fieldsForReview(profile, requestedFields)` builds an allowlisted review snapshot and rejects unknown fields or preferences. The current preview shows the whole saved profile and clearly does not claim to match Circle K's requested fields. Each future adapter must define its own requested fields, validation and verification needs, then show the user the exact data to share and obtain retailer-specific consent. Offer preferences do not grant consent. Email/phone format checks do not verify ownership, address validity, or age.

Retailer integrations still need a supported execution surface (such as an extension or native integration), review/consent UI, retailer-specific requirements, and honest handling of verification, CAPTCHA, failures and membership confirmation. This public static page cannot fill other websites by itself. Those parts are deliberately deferred.

## GitHub Pages

Live preview: https://eroleric.github.io/loyalty-card/

The website files in `dist/` are published to the root of the `gh-pages` branch. GitHub Pages uses that branch and the `/` folder. Relative asset links support the `/loyalty-card/` project URL. The repository and preview are public.

After committing UI changes on `main` and pushing them to GitHub, publish the updated website with `git subtree push --prefix=dist origin gh-pages`.

The source lives on `main`. Hosting configuration for the earlier Sites preview is excluded from the repository.
