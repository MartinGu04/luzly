# lib/google

The only module allowed to talk to the Google Sheets API. Server-only.

- `config.ts` — reads/validates the service-account env vars. Validation
  is lazy (only when a fetch actually runs), so a missing configuration
  never breaks `next build`.
- `client.ts` — builds a read-only Sheets client
  (`spreadsheets.readonly` scope only — no write scope, no write methods
  anywhere in this module).
- `sheetSources.ts` — logical source names -> real sheet-tab names.
- `fetchWorkbookSnapshot.ts` — `fetchRawWorkbookSnapshot()`, a single
  `batchGet` across the configured sources. Returns raw values only; it
  never interprets them. The normal personal loader only ever requests
  `personnel`/`schedule`/`settings` — `potentialH1`/`potentialH2` are
  requested ONLY by the manager-only loader
  (`lib/readModels/managerOverview.ts`), as a second, separate batch call
  gated on `person.isManager === true` (see `lib/readModels/README.md`).
  A normal user never pays that cost.

Env vars (server-only, never `NEXT_PUBLIC_*`): `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
`GOOGLE_PRIVATE_KEY`, `GOOGLE_SPREADSHEET_ID`.

## Emergency workbook

A second, entirely parallel spreadsheet ("משמרות המהפכה עם טבלת צדק") for
Emergency Mode's desk-based shift assignments -- never merged into the
regular workbook's reads.

- `emergencyConfig.ts` — `readGoogleEmergencyServiceAccountConfig()`,
  reads the SAME service-account credentials as `config.ts` plus its own
  `GOOGLE_EMERGENCY_SPREADSHEET_ID`. Independently validated (never
  requires the regular `GOOGLE_SPREADSHEET_ID`, and vice versa) so a
  missing/broken emergency spreadsheet id has zero effect on regular
  mode, and regular mode never needs `GOOGLE_EMERGENCY_SPREADSHEET_ID`
  configured at all. Also lazy, same reasoning as `config.ts`.
- `emergencyClient.ts` — `getGoogleEmergencySheetsContext()`, the
  emergency-workbook sibling of `client.ts`'s `getGoogleSheetsContext()`.
- `emergencySheetSources.ts` — logical source names -> real sheet-tab
  names for the emergency workbook (`משמרות`, `שבוע נוכחי`, `גזירת
  נתונים`). Deliberately its own separate map/type from `sheetSources.ts`
  -- see that file's own docstring.
- `fetchEmergencyWorkbookSnapshot.ts` — `fetchRawEmergencyWorkbookSnapshot()`,
  the emergency-workbook sibling of `fetchWorkbookSnapshot.ts`. Never
  called from any regular-mode code path, so the emergency spreadsheet is
  never fetched unless something is actually resolving Emergency Mode
  data.

Additional env var (server-only, never `NEXT_PUBLIC_*`):
`GOOGLE_EMERGENCY_SPREADSHEET_ID`.
