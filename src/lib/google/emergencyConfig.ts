import "server-only";
import { GoogleConfigError } from "./errors";
import { normalizePrivateKey } from "./config";
import type { GoogleServiceAccountConfig } from "./config";

/**
 * Reads and validates the server-only Google service-account env vars
 * for the EMERGENCY workbook -- the SAME service account
 * (`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY`) as the regular
 * workbook, but its own `GOOGLE_EMERGENCY_SPREADSHEET_ID`.
 *
 * Deliberately does NOT call/reuse `readGoogleServiceAccountConfig()`
 * (which also requires the REGULAR `GOOGLE_SPREADSHEET_ID`) -- this
 * function's own validation is fully independent so that:
 *   - REGULAR MODE never depends on `GOOGLE_EMERGENCY_SPREADSHEET_ID`
 *     being configured at all (this function is simply never called
 *     outside an emergency-workbook fetch path).
 *   - A missing/broken `GOOGLE_EMERGENCY_SPREADSHEET_ID` never fails
 *     just because the unrelated regular `GOOGLE_SPREADSHEET_ID`
 *     happens to also be unset, and vice versa.
 *
 * Intentionally NOT called at module load — only when an emergency
 * Sheets fetch is actually attempted — so `next build` succeeds without
 * this variable configured, and so a deployment that has never turned on
 * Emergency Mode never needs it at all.
 */
export function readGoogleEmergencyServiceAccountConfig(): GoogleServiceAccountConfig {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_EMERGENCY_SPREADSHEET_ID;

  const missing = [
    !clientEmail && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    !privateKey && "GOOGLE_PRIVATE_KEY",
    !spreadsheetId && "GOOGLE_EMERGENCY_SPREADSHEET_ID",
  ].filter((name): name is string => Boolean(name));

  if (missing.length > 0 || !clientEmail || !privateKey || !spreadsheetId) {
    throw new GoogleConfigError(
      `Missing Google Sheets configuration: ${missing.join(", ")}. Set these as server-only environment variables (never NEXT_PUBLIC_*).`,
    );
  }

  return {
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
    spreadsheetId,
  };
}
