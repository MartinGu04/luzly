@AGENTS.md

# Luzly — Engineering Rules

Luzly is a Hebrew RTL, read-only scheduling companion built on top of an
existing Google Sheets scheduling workbook.

## Permanent rules

- Google Sheets is the source of truth.
- Luzly is read-only.
- Never write schedule changes back to Google Sheets.
- The UI must never parse raw spreadsheet cells directly — it consumes
  typed output from `lib/parsers` / `lib/domain` only.
- Keep Google access (`lib/google`), parsers (`lib/parsers`), domain logic
  (`lib/domain`), sync (`lib/sync`), auth (`lib/auth`), and UI
  (`components`, `app`) separated. Don't reach across layers.
- Never expose secrets to client code.
- Never commit secrets.
- Never commit real operational scheduling data, personnel names/emails,
  spreadsheet IDs, credentials, or production Sheet responses. Tests and
  fixtures must use synthetic data.
- No destructive migrations or hosted operations without explicit
  approval.
- Always work on task branches. Never work directly on `main`.
- Never force-push.
- Before starting work, report branch, HEAD SHA, and confirm the working
  tree is clean.
- Before completion, run `npm run typecheck`, `npm run lint`, `npm test`,
  and `npm run build` — all must pass.
