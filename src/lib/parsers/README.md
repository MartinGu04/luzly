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
