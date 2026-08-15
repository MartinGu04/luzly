# lib/config

- `productName.ts` — `APP_NAME` (Hebrew display name, "מי-מה-מו"),
  `APP_NAME_ASCII` (Latin technical spelling, "mi-ma-mo"), and
  `APP_DESCRIPTION` (the one-line Hebrew product description), the single
  source for the product's final brand identity. Every place that shows
  the name/description in the UI or in metadata (root `<meta
  name="description">`, the PWA manifest — see `app/manifest.ts`) imports
  it from here instead of hardcoding a string.
- `brandAssets.ts` — paths and intrinsic dimensions for the real brand
  imagery under `public/brand/` (symbol, full wordmark logo, the two
  organizational logos). Single source so components never hardcode an
  asset path.
