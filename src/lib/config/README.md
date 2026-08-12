# lib/config

- `productName.ts` — `APP_NAME`, the single source for the product's
  current (temporary/working) display name. Every place that shows the
  name in the UI imports it from here instead of hardcoding a string, so
  renaming later is a one-line change. No logo, no deep branding — plain
  text only.
