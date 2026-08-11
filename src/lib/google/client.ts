import { google, sheets_v4 } from "googleapis";
import { readGoogleServiceAccountConfig } from "./config";

/** Read-only scope only — this codebase must never request write access. */
export const SHEETS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets.readonly";

export interface GoogleSheetsContext {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

/**
 * Builds a fresh, read-only Sheets API client from server env vars.
 *
 * Called only from explicit server-side fetch functions — never at module
 * load — so missing configuration never breaks `next build`.
 */
export function getGoogleSheetsContext(): GoogleSheetsContext {
  const config = readGoogleServiceAccountConfig();

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: [SHEETS_READONLY_SCOPE],
  });

  const sheets = google.sheets({ version: "v4", auth });

  return { sheets, spreadsheetId: config.spreadsheetId };
}
