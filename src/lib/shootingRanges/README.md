# מטווחים (shooting-range qualification)

## Source-of-truth precedence

1. The most recent **approved** `shooting_range_completions` row for a
   person (by `performed_on`) -- unconditionally wins over the Google
   Sheet baseline, regardless of dates. A later sheet refresh can never
   revert an app-approved baseline.
2. Otherwise, the person's most recent "מטווחים" Google Sheet row whose
   `תאריך ביצוע מטווח` is today or earlier (parsed by
   `lib/parsers/shootingRanges.ts`, selected by
   `lib/readModels/shootingRangeQualification.ts`'s
   `selectSheetBaselineForPerson`).
3. Otherwise, no qualification data (`baselineDate: null`) -- never a
   fabricated expiry.

Expiry = baseline + 6 **calendar** months
(`lib/domain/shootingRangeQualification.ts`), valid through the end of
that calendar day in Asia/Jerusalem. See that module's own docs for the
month-add/leap-year semantics.

## Planned ranges: a deliberate architecture decision

The product spec describes planned ranges as "the schedule/workbook
contains a future shooting-range assignment." Before building this
feature we checked: `lib/domain/event.ts`'s `DutyFamily` has no
shooting-range duty type, and the "משמרות + תורנויות" schedule parser
recognizes no such assignment. There is currently **no real upstream data
source** (sheet or schedule) that represents a future shooting-range
assignment for a person.

Given that, planned ranges are modeled as their own mi-ma-mo-owned concept:
a manager schedules people for a range date directly through this feature
(`createPlannedShootingRangeAction`), which writes rows into
`shooting_range_planned_occurrences`. This table -- not any Google Sheet
column -- is the actual source for "who is scheduled" and "what is pending
manager confirmation" everywhere in this feature.

**Consequence worth knowing:** if the real "מטווחים" sheet tab ever gains
forward-dated rows (people already scheduled for a future range, tracked
manually in the sheet before this feature existed), those rows are
currently invisible to the planned-range UI -- `parseShootingRangesSheet`
only interprets a sheet row's date as a completed baseline candidate
(`selectSheetBaselineForPerson` only ever looks at rows dated today or
earlier). A future-dated sheet row today is neither shown as planned nor
counted as a baseline; it is simply not read for either purpose. If real
forward-scheduling data starts appearing in the sheet, teach
`selectSheetBaselineForPerson`'s caller to also surface those rows as
planned occurrences (read-through, same idea as the baseline itself) --
this is a one-function change, not a redesign.

## Three states, never collapsed

- **Verified / completed**: `shooting_range_completions.status = 'approved'`.
  Only this can update the baseline.
- **Planned**: `shooting_range_planned_occurrences.status = 'planned'`
  with `range_date` still in the future.
- **Pending confirmation**: the same `'planned'` status, but `range_date`
  has passed -- derived purely by date comparison at read time
  (`buildShootingRangeQualificationReadModel`'s `selectPlannedRangeView`),
  never a third stored status.

## Bulk manager confirmation is one atomic database statement

`confirmPlannedShootingRangeAction` does NOT read the planned occurrences,
decide confirm/reject in application code, then issue separate
update/insert calls -- that shape has a real TOCTOU race: two concurrent
confirmations of the same occurrence (a double-click, two manager tabs, a
retried request) could each read the same "still planned" rows and each
independently insert an approved `shooting_range_completions` row, a
genuine duplicate baseline record.

Instead, the whole operation -- transitioning `shooting_range_planned_occurrences`
out of `'planned'` AND inserting the resulting `shooting_range_completions`
rows -- happens inside the single `confirm_shooting_range_occurrences` SQL
function (`supabase/migrations/20260825130000_add_confirm_shooting_range_occurrences_rpc.sql`,
wrapped by `lib/shootingRanges/store.ts`'s `confirmShootingRangeOccurrences`).
Each completion insert is driven by its own update's own `RETURNING` set,
so a concurrent call that loses the race (its `where status = 'planned'`
no longer matches, once the winner has committed) affects zero rows and
therefore creates zero completions -- idempotent and race-safe by
construction, not by an application-side pre-check. This also means a
foreign/stale person id in the confirmed list can never fabricate a
completion: the database itself only ever resolves rows that are
genuinely `'planned'` for that exact date.

Proven against a real PostgreSQL (not just mocked) in
`confirmShootingRangeOccurrencesRpc.integration.test.ts`, including two
genuinely concurrent connections racing over the same occurrence.

## Notifications

All job creation goes through the existing `notification_jobs` outbox
(`lib/notifications/engine/store.ts`) via
`lib/notifications/engine/shootingRanges.ts` -- no second scheduler, no
direct Push call. See that file's own docs, especially the per-manager
`dedupeKey` note on `scheduleManagerConfirmationRequiredJob` (a shared key
across recipients would silently drop all but the last manager's job --
a real incident class this codebase has hit before with
`upsertPendingReminderJob`).
