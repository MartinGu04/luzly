# lib/config

- `productName.ts` — `APP_NAME` (Hebrew display name, "מי-מה-מו") and
  `APP_NAME_ASCII` (Latin technical spelling, "mi-ma-mo"), the single
  source for the product's final brand identity. Every place that shows
  the name in the UI imports it from here instead of hardcoding a string.
- `brandAssets.ts` — paths and intrinsic dimensions for the real brand
  imagery under `public/brand/` (symbol, full wordmark logo, the two
  organizational logos). Single source so components never hardcode an
  asset path.
