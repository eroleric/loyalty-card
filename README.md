# Loyalty Card

A responsive, UI-only home screen with Circle K as its only retailer.

## Scope

- Home screen and reusable retailer cards.
- Circle K / Inner Circle display information only.
- No accounts, saved customer data, enrollment, autofill, payments, point balances, retailer connections, or working action buttons.
- A responsive grid renders the full retailer list. No fixed retailer limit or hard-coded card slots.

## Files

- `dist/index.html`: Home-screen structure and no-JavaScript fallback.
- `dist/styles.css`: Responsive visual design.
- `dist/retailers.js`: Retailer display records. Add records here to expand the catalog.
- `dist/app.js`: Reusable rendering; no network requests or data storage.
- `serve.mjs`: Local preview server.

## Preview

With Node.js installed, run `npm run dev` and open the printed local URL. No package installation or build step is needed.

Run `npm run check` to check JavaScript syntax.

This is a browser UI prototype, not a compiled iOS or Android app.
