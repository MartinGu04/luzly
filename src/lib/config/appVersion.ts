import packageJson from "../../../package.json";

/**
 * The app's displayed version -- sourced directly from `package.json` at
 * build time (via a JSON import, `resolveJsonModule`), never hardcoded, so
 * it can never drift from the real package version.
 */
export const APP_VERSION: string = packageJson.version;
