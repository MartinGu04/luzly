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
  `פוטנציאל תקש"אס 7-12/2026`). The real workbook structure has since been
  verified externally: BOTH sheets share the identical row-1 operational
  header layout, columns A:T (`תאריך`, `יום`, then `שומר 1..4`,
  `עתודה 1..2`, `אוקסיד 1..3`, `כונן פינויים`, `מטבח יומי 1..2`,
  `מטבח מלא 1..3`, `רס"ר 1..2`, `הערות`). The exact Hebrew header text is
  the ONLY structural schema — centralized in the `REQUIREMENT_COLUMNS`
  map (never scattered `if (column === "L")` logic in React) — mapping
  each header to a typed `dutyFamily` + `slot` (the exact internal
  `Event.slot` to match, guard/reserve only) + `sourceSlot` (the
  Potential column's own numbering, used only for deterministic
  multiplicity-based pairing in `lib/domain/potentialReconciliation.ts`).
  `הערות` and any other unrecognized header are never a requirement.
  The exact `///////////////////` structural placeholder cell value (a
  disabled/not-applicable slot for that date) is skipped alongside blank
  cells, both via exact matching only. The sheet's separate fairness/
  scoring side-table (title `"טבלת צדק - ..."`, headers `שם`, `הקצאה`,
  `ניקוד הפוטנציאל הקודם`, `ניקוד לפוטנציאל הנוכחי`, `סופ"שים`, `פטורים`)
  is verified to live on a LATER row, further right (NOT row 1) — it is
  structurally excluded simply by never matching `REQUIREMENT_COLUMNS`
  and by never sharing a row with a parseable operational date (every
  data row requires its date cell to parse; a fairness title/header/score
  row won't). Fairness itself remains intentionally out of scope for
  PR #14. A cell resolves to a known `Person` (`resolvedSourcePersonId`)
  ONLY on an exact (whitespace-normalized) name match — never
  fuzzy/partial matching; otherwise it stays an honest
  organizational/source label. That source label is NEVER automatically
  the actual performer — see `potentialReconciliation.ts` for how the
  internal schedule determines who really does it.
