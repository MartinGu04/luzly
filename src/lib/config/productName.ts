/**
 * The product's FINAL brand identity (PR #23). Every place that shows the
 * name in the UI imports it from here instead of hardcoding the string, so
 * a future change is a one-line edit and never a find/replace across
 * components.
 *
 * Two distinct forms, never competing sources of truth for the same thing:
 * - `APP_NAME` -- the Hebrew display name shown throughout the product UI.
 * - `APP_NAME_ASCII` -- the Latin-script technical spelling, used only
 *   where a non-Hebrew identifier is genuinely required (package/metadata
 *   identifiers, technical brand slugs). Never rendered as a second,
 *   competing product name alongside the Hebrew one in the UI.
 *
 * Treat this as plain text/identifier only -- logos and brand imagery live
 * under `public/brand/` (see `brandAssets.ts`), not here.
 */
export const APP_NAME = "מי-מה-מו";

export const APP_NAME_ASCII = "mi-ma-mo";
