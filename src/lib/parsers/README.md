# lib/parsers

Turns raw rows/cells from `lib/google` into typed data. No business rules,
no direct UI usage. The UI must never read raw spreadsheet cells — it only
sees output from here.

- `sheetGrid.ts` — shared grid helpers (cell/boolean normalization, header
  lookup by label, A1 cell references).
- `date.ts` — `parseLocalDate`, pure string parsing to `YYYY-MM-DD` (no
  `Date`/UTC involved, so the workbook's Asia/Jerusalem calendar dates
  never shift).
- `settings.ts` — parses הגדרות by locating the "הגדרה"/"ערך" columns by
  header text (they can move).
- `personnel.ts` — parses כ"א into typed `Person` records, locating
  columns by header label and normalizing checkbox values.
- `schedule.ts` — structural parser for "משמרות + תורנויות": detects the
  sheet's independent date/day blocks and person-column ownership
  (including adjacent continuation columns) and emits one `RawAssignment`
  per non-empty cell. Does not semantically classify values yet.
- `event.ts` — semantic parser: turns a `RawAssignment` into a typed
  `Event` (shift/duty/absence/constraint/status/context/change_note/
  other/unknown), preserving `rawValue` exactly and never guessing via
  fuzzy matching. No conflict/coverage/fairness logic — that's a future
  rules engine, not this layer.
- `types.ts` — `RawAssignment`.
- `potential.ts` — PR #14's `parsePotentialSheet`, a structural parser
  for the Potential sheets (`פוטנציאל תקש"אס 1-6/2026` /
  `פוטנציאל תקש"אס 7-12/2026`). Locates the operational date/day block the
  same way `schedule.ts` does, and identifies each requirement/allocation
  column by its own header text (`columnLabel`) rather than any invented
  duty/requirement mapping — the real workbook wasn't available to
  inspect for this PR, only qualitative discovery notes (see PR #14's
  report), so this deliberately never guesses column semantics beyond
  what's structurally certain. The sheet's separate fairness/scoring
  side-table (`שם`, `הקצאה`, `ניקוד הפוטנציאל הקודם`, `ניקוד לפוטנציאל
  הנוכחי`, `סופ"שים`, `פטורים`) is structurally excluded — the first
  fairness-labeled header column (searching the same header row,
  left-to-right) marks where the operational table ends. A cell resolves
  to a known `Person` ONLY on an exact (whitespace-normalized) name
  match — never fuzzy/partial matching; otherwise it stays an honest
  organizational/source label (`resolvedPersonId: null`).
