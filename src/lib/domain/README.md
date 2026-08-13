# lib/domain

Business rules operating on parsed domain objects: conflict detection,
manager reconciliation, "who is with me", derived reminders. Pure logic,
no Google API calls and no spreadsheet-cell access.

- `types.ts` — `Person`, the typed personnel record produced by
  `lib/parsers/personnel.ts`. Existing in this list does not imply a
  person is scheduled/active on a given date — no such flag is stored
  here.
- `event.ts` — the `Event` model (and its category/role/period/certainty/
  duty-family/absence-kind unions) produced by `lib/parsers/event.ts`
  from a `RawAssignment`. This — not `RawSheet`/`RawAssignment` — is
  what a future rules engine and the UI should consume.
- `shiftSchedule.ts` — builds the day/night shift schedule from the
  workbook's configured day-shift start (never falls back to a default
  time — `ShiftConfigurationError` on missing/invalid config), and
  `resolveEventShiftInterval` for a single shift `Event`'s effective
  start/end minute interval, respecting `startTimeOverride`/
  `endTimeOverride`. Deterministic minute arithmetic only, no
  `Date`/UTC — a night shift crosses midnight without touching
  `Event.date`.
- `shiftCoverage.ts` — `analyzeShiftCounterparts`, the "מי איתי?"
  counterpart matcher and structural shift-coverage engine (opposite
  role, same date/period; shadow shifts never count as primary
  coverage; partial counterpart intervals merge into full coverage;
  missing coverage is returned as machine-readable gaps). Structural
  coverage only — certainty (confirmed/tentative) is preserved
  untouched; whether tentative coverage should count as operationally
  confirmed is left to a future rules engine, not decided here. No
  alert/severity logic. Also exports `analyzeUnitShiftCoverage` (PR #14) —
  the manager overview's UNIT-WIDE date+period group coverage, evaluated
  against the canonical shift window from both roles' merged intervals
  together. Deliberately independent of any single person's identity —
  it never picks an arbitrary "target" Event the way
  `analyzeShiftCounterparts` does, so the result never depends on
  `personId`/`sourceCell` ordering. `"full"` only when both roles cover
  the whole canonical window; `"missing"` if either role has zero
  coverage at all (even if the other role is fully covered); `"partial"`
  otherwise, with `missingIntervals` being the merged union of both
  roles' own gaps; `"not_evaluable"` when an unresolved/invalid Event
  makes a role's true coverage impossible to honestly determine (unless
  resolved coverage alone already proves that role's window is fully
  covered — an extra unresolved duplicate Event never invalidates an
  already-provably-full result).
- `operationalIssues.ts` — `detectOperationalIssues`, the first
  deterministic rules engine: blocking absence + active assignment,
  shift coverage missing/partial (reusing `analyzeShiftCounterparts`,
  no duplicated interval math), invalid shift-time overrides, and
  personnel capability mismatch (`Person` capabilities are only
  compared against the Event's actual scheduled role here — they are
  never used for counterpart matching). Machine-readable
  reason/severity only, no Hebrew UI copy or presentation colors in the
  domain result. Deduplicates issues built from identical evidence
  without collapsing genuinely different affected Events.
- `dutyBlocks.ts` — `buildDutyBlocks`, grouping consecutive-calendar-day
  duty Events (`category === "duty" && dutyFamily !== null` only) into
  `DutyBlock`s for one person + duty family + slot. Built purely from
  Event metadata, never Hebrew `rawValue`/`title`. Local calendar-date
  arithmetic only (`parseCalendarDate`/`isNextCalendarDay`/`dayOfWeek`) —
  no `Date`/UTC, so month/year boundaries and leap years are handled
  without timezone risk and an unparseable date can never crash
  grouping or silently join a valid run. `weekend_kitchen` gets an
  explicit `weekendCompleteness` (complete only for an actual
  Thursday-Friday-Saturday run — dates are never fabricated). Output is
  deterministically sorted; a duplicate Event reference is deduplicated
  so it can never inflate `dayCount`. `parseCalendarDate`/`dayOfWeek` are
  also reused by `lib/presentation` for Date-free Hebrew weekday display.
- `dutyActions.ts` — `deriveDutyActions`, turning `DutyBlock`s into
  machine-readable `duty_check_in` action data (never an actual
  notification — no Notification API, cron, or push subscription here).
  Always local time `"13:00"`, never converted to UTC. A one-day block
  gets one same-day action; a multi-day block gets one action on every
  actual date except the final one — the same rule for every duty
  family, including `weekend_kitchen` (no separate reminder engine).
- `localNow.ts` — the `LocalNow` shape (`date` + `minuteOfDay`), a plain
  local-clock reading. Producing one from a real instant is a runtime
  boundary concern (`lib/time`), not a domain concern — this is only the
  type every domain temporal rule is expressed against.
- `assignmentTemporalState.ts` — `classifyAssignmentTemporalState`,
  classifying a shift/duty `Event` as `current`/`upcoming`/`past` relative
  to a `LocalNow` (duties: calendar date only, no invented hours; shifts:
  reuses `resolveEventShiftInterval`, comparing `now` on the shift's own
  minute timeline so an overnight shift crossing midnight is handled
  without touching `Date`/UTC). An unresolved shift interval (unspecified
  period or an invalid override) is always `not_evaluable`, on any date —
  never guessed into a bucket. `isEventStillRelevant` is the same
  overnight-carry-forward rule reused for "should this Event still show up
  in a present/future view". `resolveNowMinuteOnEventTimeline` is exported
  for `assignmentTiming.ts` to reuse the exact same "now, on this Event's
  own timeline" placement.
- `assignmentTiming.ts` — `computeAssignmentTiming`, a safe
  presentation-ready projection of a shift's resolved timing as of a
  `LocalNow`: wrapped `"HH:mm"` start/end (an overnight end past midnight
  reads e.g. `"07:30"`), duration, and elapsed/remaining/progress/
  minutes-until-start as of that instant. `not_evaluable` for every duty
  and every shift whose interval can't resolve — never an invented
  start/end/duration. The dashboard's live progress bar only ever
  advances this forward using elapsed wall-clock time; it never
  re-derives the underlying scheduling rules client-side.
- `dateRange.ts` — PR #14's `/manager` date-range machinery:
  `parseManagerRangeParam` (strict `?range=` allowlist, falls back to
  `"7d"`) and `resolveManagerDateRange`, which turns
  `today`/`7d`/`30d`/`month` + `LocalNow` into the concrete civil dates
  covered (`"month"` defaults to the month containing `LocalNow.date` on
  an invalid/missing `?month=`, via `parseMonthParam`). `addCalendarDays`/
  `formatCalendarDate` are plain integer arithmetic on `CalendarDate` —
  no `Date`/UTC, leap years and year boundaries handled correctly.
- `potentialAllocation.ts` — the domain-owned `PotentialAllocation` shape
  (the same convention as `Event`: domain defines the type,
  `lib/parsers/potential.ts` only produces values of it — domain never
  imports from `lib/parsers`).
- `potentialReconciliation.ts` — PR #14's Potential-vs-internal
  reconciliation, now against the VERIFIED real requirement schema (see
  `lib/parsers/potential.ts`'s `REQUIREMENT_COLUMNS`). **Potential is the
  source/framework allocation, never the internal actual schedule** —
  this never converts a `PotentialAllocation` into an `Event` and never
  merges the two arrays. Coverage is decided by DATE + TYPED DUTY
  REQUIREMENT, never by `sourceAllocationLabel` matching a person:
  - `guard`/`reserve` (exact-slotted internally) match by date + family +
    the EXACT internal `Event.slot`.
  - `evacuation_on_call` (single, unslotted) matches by date + family.
  - `oxid`/`daily_kitchen`/`full_kitchen`/`rasar` (numbered on the
    Potential side, but internally unslotted) reconcile by date + family
    MULTIPLICITY: every requirement for that date+family, sorted by its
    own `sourceSlot`, is paired positionally against every matching
    internal Event, sorted by a stable order (`personId`, then
    `sourceSheet`/`sourceCell`) — never a fake exact-slot identity, never
    dependent on input array order.
  `"covered"`/`"missing"` are real, produced statuses now that the schema
  is known; `"partial"` stays a real, forward-compatible status with no
  honest partial-duty semantic today; `"not_evaluable"` is reserved for a
  genuinely unknown/unsupported requirement family (defensive only — the
  parser never emits one). `sourceConflict` (a NAMED source person with a
  blocking absence the same date — identity via the personnel-roster join
  in `lib/parsers/potential.ts`, never text similarity) is computed
  INDEPENDENTLY of `status`: a requirement covered by a replacement
  internal performer stays `"covered"` even while carrying a source
  conflict worth the manager's attention — a source conflict never by
  itself downgrades an otherwise-covered requirement to `"missing"`.
