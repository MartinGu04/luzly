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
  `personId`/`sourceCell` ordering. Precedence: a PROVABLY-absent role
  (zero non-shadow Events for it, not merely unresolved ones) always makes
  the group `"missing"` — with `missingIntervals` covering the ENTIRE
  canonical window — regardless of whether the other role is ambiguous,
  partial, or even fully covered; proven absence beats uncertainty
  elsewhere. Only once neither role is provably absent does ambiguity get
  checked: `"not_evaluable"` when an unresolved/invalid Event makes a
  role's true coverage impossible to honestly determine (unless resolved
  coverage alone already proves that role's window is fully covered — an
  extra unresolved duplicate Event never invalidates an already-provably-
  full result). Otherwise: `"full"` only when both roles cleanly cover the
  whole canonical window; `"partial"` otherwise, with `missingIntervals`
  being the merged union of both roles' own gaps.
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
- `potentialSourceOwnership.ts` — PR #16's Manager Overview scope
  cleanup. The Potential sheet contains requirements for MANY
  organizational sources (this team's own, plus others like איתן/רוקם/
  מבצעים/סייבר/מ"א/אמל"ח קצה/מנהלה) — `lib/parsers/potential.ts` keeps
  parsing all of them (broad, unchanged), but Manager Overview is
  intentionally scoped to only תקש"ל / תקשאס responsibility.
  `classifyPotentialSourceOwnership(sourceAllocationLabel, personnel)` is
  the single centralized classifier (`team_alias` / `team_person` /
  `external` / `unknown`), checked in this order:
  1. Exact team-alias match, quote-insensitive canonical comparison
     (תקש"ל / תקש״ל / תקשל all canonicalize the same; likewise
     תקשאס-family). No fuzzy matching — only quote characters are
     stripped before comparison.
  2. Exact full personnel-name match (whitespace-normalized) — the
     strongest person evidence, so it is resolved BEFORE the external
     check below (an exact full name is not a coincidental collision).
  3. A known external organizational token as the label's LEADING word
     (איתן/רוקם/מבצעים/סייבר/מא/אמלח/מנהלה) — this makes "איתן מרכז",
     "איתן צפון", "איתן דרום", bare "איתן", and "סייבר החלפה איתן" all
     `external`, even though a real team member's first name happens to
     be איתן. External-label classification always wins over
     short-name/annotated-name PERSON SHORTHAND from this point on
     (`isManagerOwnedPotentialAllocation`'s whole reason for existing).
  4. A unique short first name as the label's leading token (מרטין/איתי/
     גדעון/מארק/טוביה/...) — covers both a bare short name and a
     "name + annotation" label ("מארק - הוקפץ מא", "טוביה - החלפה
     סייבר") since only the LEADING token is ever used to resolve a
     person; no natural-language parsing beyond that. Two personnel
     sharing the same first name never resolve (fails closed, same
     convention as `lib/parsers/potential.ts`'s exact-name resolution).
  5. Otherwise `unknown` — fails closed, excluded from Manager Overview,
     never guessed either way. A source with no current `כ"א` record
     (e.g. "נדב"/"יובל"/"סטיבן") lands here like any other unrecognized
     source — Design Pass PR #21 removed the temporary special-cased
     `team_unresolved_person` ownership state that used to carve out
     נדב/יובל as a known-but-unresolved תקש"ל אתרים responsibility; מי-מה-מו
     no longer claims that responsibility at all. If either name (or
     anyone else) is later added to `כ"א`, steps 2/4 above resolve them as
     an ordinary `team_person` automatically, with no special-casing
     required.
  `isManagerOwnedPotentialAllocation` is `true` for `team_alias`/
  `team_person` only -- a simple boolean convenience for a caller that
  doesn't need enrichment (see below). `parsePotentialSheet`
  and `PotentialAllocation.resolvedSourcePersonId` (exact full-name only,
  used for `sourceConflict`) are both left exactly as they were — this
  classifier does its own independent person resolution rather than
  changing the parser's.

  `scopeManagerPotentialAllocation(allocation, personnel)` is what
  `buildManagerOverviewReadModel.ts` actually calls, once per allocation
  (hardening pass -- classifying the same allocation twice, once via
  `isManagerOwnedPotentialAllocation` and again separately, is exactly
  what this consolidates away). It both scopes AND enriches: `team_alias`
  passes the allocation through unchanged; `team_person` returns a COPY
  with `resolvedSourcePersonId` set to the
  classifier's resolved person id (closing a real gap -- a short/annotated
  person source like "מרטין" or "מארק - הוקפץ מא" would otherwise reach
  `reconcilePotentialAllocations` with `resolvedSourcePersonId: null` from
  the parser and silently lose `sourceConflict` detection, since that
  check reads `resolvedSourcePersonId` only); `external`/`unknown` both
  return `null`. Never mutates its input. `buildManagerOverviewReadModel.ts`
  filters `potentialAllocations` through it BEFORE calling
  `reconcilePotentialAllocations` — an external/unknown source therefore
  never produces a `"missing"` row, never contributes to any manager
  problem/attention count, and never reaches reconciliation at all.
  `/manager/fairness` is a separate person-based
  domain (PR #15) and is NOT scoped by this filter.

## Fairness foundation (PR #48)

The general (future shifts + duties) Fairness foundation. Investigation
first confirmed the existing duty Fairness system (`fairnessTable.ts`/
`fairnessAnalysis.ts`/`fairnessExemptions.ts`/`fairnessPeriod.ts`, PR #15)
is complete and correct for duties — it is left completely untouched here.
These files are the SEPARATE, general primitives a future standalone
Fairness page (`[ משמרות ] [ תורנויות ]`, no combined mode in V1) can build
both modes on top of, deliberately period-SHAPE-agnostic (plain
`periodStartDate`/`periodEndDate` strings, never `FairnessPeriodKey`) so
the same primitives serve the existing h1/h2 duty period and a future
shift-fairness period without collision.

- `personnelType.ts` also now exports `classifyRoleGroup`/
  `FairnessRoleGroupKey` (`"supervisor" | "technician" | "other"`, from
  `isSupervisor`/`isTechnician` capability flags — never a job-title
  string) — co-located with `classifyPersonnelType` for the same reason
  that function lives here: `lib/presentation/roster.ts`'s
  `classifyRegularRole` and this PR's `fairnessGroups.ts` both need the
  EXACT same rule, defined once.
- `fairnessFoundation.ts` — the foundation-wide primitives: `FAIRNESS_MODEL_VERSION`
  (for a future stored historical snapshot to trust without recalculating);
  `resolveFairnessPeriodStatus` (`"current"` vs `"closed"`, from a plain
  period end date + `LocalNow` — period-shape-agnostic); `FairnessDataCompleteness`
  (`"complete" | "partial"` + a centralized, evidenced reason enum — the
  model must never manufacture certainty where source data is genuinely
  incomplete, never a placeholder for a hypothetical gap); `isFairnessWeekendDate`/
  `countFairnessWeekendDates` (Thursday-Friday-Saturday, the SAME
  convention already established twice elsewhere — `dutyBlocks.ts`'s
  `weekend_kitchen` Thursday anchor and `calendarMonth.ts`'s
  `isWeekendColumn` — centralized here as the one date-string version, so
  a future weekend metric never re-derives or drifts from either).
- `fairnessParticipation.ts` — participation/eligibility/availability,
  reusing (never re-deriving) `classifyPersonnelType` and
  `ReserveRoleParticipation`:
  - `resolveFairnessParticipationWindow` — permanent/regular ->
    `"full_period"` (this app's existing default assumption for these two
    categories, e.g. `lib/presentation/roster.ts`'s roster listing never
    questions whether a קבע/חובה person is "still active"); reserve/
    unclassified -> `"inferred_from_events"` (bounded by actual Event
    evidence in the period) or `"unknown"` (zero evidence). VERIFIED GAP:
    כ״א carries NO stored join/leave/service-window date for any person —
    a regular/permanent person joining mid-period is therefore NOT
    distinguishable from one present the whole period with today's data;
    this is reflected honestly via `dataCompleteness`, never hidden, and
    documented with an explicit test rather than invented as solved.
  - `resolveFairnessRoleEligibility` — mirrors
    `shiftCoverageRecommendation.ts`'s PR #39 `participatesInRoleRotation`
    rule exactly (a deliberate, evidenced business rule, not incidental to
    that feature — reused here rather than re-derived): no capability ->
    never; permanent -> never; regular -> always once capable; reserve ->
    needs the period's own Fairness-table evidence OR a confirmed
    same-role shift Event within the period; unclassified -> never.
    `dataCompleteness` always carries `"eligibility_undated"` — VERIFIED
    GAP: `isTechnician`/`isSupervisor` are a CURRENT snapshot only, with no
    effective-from date, so a qualification that became valid partway
    through the period can never be time-sliced today.
  - `resolveFairnessShiftOpportunity` — shift-SLOT-level (not merely
    "available days") availability for one (date, period): a blocking
    absence (`BLOCKING_ABSENCE_KINDS`, reused from `operationalIssues.ts`)
    or a full-day/matching-period constraint blocks it; a `"morning"`
    constraint (verified: no canonical day/night shift-slot mapping exists
    anywhere in this codebase today) is never asserted blocked OR
    available — it returns `"unmodeled_constraint"` with `dataCompleteness`
    marked partial instead.
- `fairnessGroups.ts` — comparison groups: "people who can reasonably be
  compared for the same workload", from `classifyRoleGroup` alone — never
  blindly equated with `personnelType`/a free-text role label. A SEPARATE
  concept from the existing duty-fairness grouping
  (`lib/presentation/managerFairnessGrouping.ts`'s
  `resolveFairnessAllocationRole`, which classifies the Potential sheet's
  own "הקצאה" text and is left untouched) — a reservist אחמ״ש, or a person
  whose organizational title is ר״צ but who actually works the אחמ״ש
  rotation (`isSupervisor === true`), lands in the SAME `"supervisor"`
  group as every other אחמ״ש; `מילואים`/`ר״צ` stay contextual metadata,
  never a separate fairness group. `buildFairnessPersonContext` composes
  one person's group + participation window + per-role eligibility + one
  combined `dataCompleteness` — the "read-model primitive" this foundation
  exists to provide, deliberately carrying no score/workload number (future
  shift/duty scoring is explicitly out of scope for this PR).

No read-model/page/caching layer is added yet — every primitive above is
pure `lib/domain`, consumed directly by tests. PR #15's duty Fairness
read-model (`lib/readModels/managerFairness.ts` et al.) and orchestration
conventions (`getRequestX` + `unstable_cache`-backed `lib/sync`) remain the
pattern a future shift/combined Fairness read-model should follow — this
PR does not need to wire that up yet, and nothing here makes it harder to
do so later.
