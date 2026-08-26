import "server-only";
import { google } from "googleapis";
import { SHEETS_READONLY_SCOPE, type GoogleSheetsContext } from "./client";
import { readGoogleEmergencyServiceAccountConfig } from "./emergencyConfig";

/**
 * Builds a fresh, read-only Sheets API client for the EMERGENCY
 * workbook from server env vars -- the emergency-workbook sibling of
 * `getGoogleSheetsContext()` (`client.ts`), same read-only scope, same
 * service account, different spreadsheet id.
 *
 * Called only from explicit server-side emergency fetch functions —
 * never at module load, and never from any regular-mode code path — so
 * missing/broken emergency configuration can never break `next build`
 * or regular mode, and the emergency spreadsheet is never fetched
 * unnecessarily while Emergency Mode is off.
 */
export function getGoogleEmergencySheetsContext(): GoogleSheetsContext {
  const config = readGoogleEmergencyServiceAccountConfig();

  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: [SHEETS_READONLY_SCOPE],
  });

  const sheets = google.sheets({ version: "v4", auth });

  return { sheets, spreadsheetId: config.spreadsheetId };
}
