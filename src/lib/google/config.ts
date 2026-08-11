import "server-only";
import { GoogleConfigError } from "./errors";

export interface GoogleServiceAccountConfig {
  clientEmail: string;
  privateKey: string;
  spreadsheetId: string;
}

/**
 * Handles both the real-newline and the common escaped "\n"
 * (single backslash + n) formats used when a private key is pasted into a
 * platform env-var UI.
 */
export function normalizePrivateKey(rawKey: string): string {
  return rawKey.includes("\\n") ? rawKey.replace(/\\n/g, "\n") : rawKey;
}

/**
 * Reads and validates the server-only Google service-account env vars.
 *
 * Intentionally NOT called at module load — only when a Sheets fetch is
 * actually attempted — so `next build` succeeds without these variables
 * configured (e.g. on a fresh Vercel deploy).
 */
export function readGoogleServiceAccountConfig(): GoogleServiceAccountConfig {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;

  const missing = [
    !clientEmail && "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    !privateKey && "GOOGLE_PRIVATE_KEY",
    !spreadsheetId && "GOOGLE_SPREADSHEET_ID",
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
