# Loyalty Card

A simple browser prototype: save signup details on this device, then review them for future retailer forms. Circle K is the first retailer; the catalog has no fixed limit.

Live app: https://eroleric.github.io/loyalty-card/

Source: https://github.com/eroleric/loyalty-card

## Using the prototype

Open My profile, enter any details you want to keep, and choose **Save on this device**. The form reloads those details when you return in the same browser. Existing version-1 browser profiles are preserved. Editing, canceling changes, partial saving, and deleting saved details are available. Circle K's **Preview profile** shows the saved fields for review.

The app has no sign-in, database, email service, or third-party SDK dependencies. Supabase integration code and setup were removed. The previously created empty Supabase project is unused; this change does not delete or modify it.

Retailer signup and cross-site autofill remain disconnected. The preview does not register a membership or send anything to Circle K. A future retailer adapter can read the normalized profile and request a field allowlist through `fieldsForReview` in `dist/profile.js`.

## Storage

Choosing Save writes the profile to this browser's `localStorage` under `loyalty-card.profile.v1`. Data stays in that browser and does not sync to another browser or device. Clearing site data removes it. Storage and validation failures are reported without replacing a previously saved profile. The Delete action removes only this app's profile key.

The profile contains contact details, an optional birthday, and optional offer preferences; it excludes passwords and payment information. Offer preferences do not grant retailer consent. Local browser storage is unencrypted and is not a password vault. GitHub project sites share the `eroleric.github.io` browser origin, so use fictional records for prototype testing. No profile values enter the public repository, and the app has no analytics or profile-upload requests. Its content security policy blocks fetch connections and native form submission.

## Development

No package installation or bundling is required. With Node.js installed, run `npm run dev` to preview the static files. `npm run build` checks JavaScript and confirms the files in `dist/` are ready; `npm test` checks profile validation, saving, deletion, and storage failures.

The public app is a browser UI prototype. A separate Android WebView enrollment experiment lives under `mobile/android`; see `mobile/README.md` for its scope and testing instructions. UI and styles live in `dist/index.html` and `dist/styles.css`; navigation and review behavior live in `dist/app.js`. Add retailer records in `dist/retailers.js`.

## Publishing

Source lives on `main`. GitHub Pages publishes the root of `gh-pages`. After committing and pushing changes, run `git subtree push --prefix=dist origin gh-pages`. Relative asset paths support the `/loyalty-card/` URL. The source and website are public.

## Design approach

The interface focuses on saving a profile and reviewing it for a retailer. The home screen uses compact cards, familiar navigation, and one clear profile action. The profile groups contact and address fields, hides optional birthday/offer preferences in an accessible details disclosure, and shows save feedback and unsaved changes near the action. The existing version-1 profile storage is unchanged.

Guidance reviewed: Laws of UX, second edition (Fitts’s law, Hick’s law, and progressive disclosure; PDF pages 34, 63, 152), and The User Experience Team of One, second edition (task flows; PDF pages 255–257). These informed design decisions; they do not establish that customers find this version easier.
