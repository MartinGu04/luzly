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
