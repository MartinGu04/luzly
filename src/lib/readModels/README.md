# lib/readModels

Server-side orchestration that connects Google Sheet → parsers → domain
into a personalized, explicitly client-safe view. This is the ONLY layer
allowed to take the full server-side parsed schedule and project it down
to what one authenticated person's browser session may see.

Pipeline: Google Sheet → server-side full parse → domain analysis →
filter/project for the authenticated Person → `PersonalScheduleReadModel`.
The full schedule/personnel list must never reach the browser — only this
layer's safe projections may.

- `types.ts` — the `PersonalScheduleReadModel` shape and every safe
  projection type it's built from (`PersonalEventView`,
  `PersonalAssignmentView`, `PersonalCounterpart`, `PersonalShiftContext`,
  `PersonalIssue`, `PersonalDutyBlock`, `PersonalDutyAction`,
  `PersonalProfile`). None of these carry `sourceSheet`/`sourceCell`,
  workbook IDs, or a colleague's email/manager/capability flags; the
  authenticated person's own profile never carries their email either —
  that belongs to the auth boundary, not presentation. Every
  `PersonalEventView` carries a server-resolved `timing`
  (`lib/domain/assignmentTiming.ts`) so the dashboard's progress bar/today
  timeline never re-derives shift hours from raw text.
  `shiftCalendarEvents` is the one array that deliberately does NOT filter
  out finished history — the person's own `category === "shift"` Events,
  past/current/future — since it powers `/schedule`'s personal shift
  calendar rather than a "what's still relevant" list like
  `upcomingEvents`.
- `buildPersonalScheduleReadModel.ts` — the pure, deterministic builder.
  Takes the authenticated `Person`, the full parsed `people`/`events`, a
  `ShiftSchedule`, an explicit `LocalNow`, and (optional, defaults to `[]`)
  `potentialAllocations` — no network, no auth, no `Date`/UTC. Filters to
  the authenticated person's own Events, runs the existing
  `analyzeShiftCounterparts`/`detectOperationalIssues`/`buildDutyBlocks`/
  `deriveDutyActions` (reused, never reimplemented), and projects
  everything down to the safe types above. Colleague exposure is
  deliberately minimal: counterpart context only for the person's
  current/next shift(s), never every coworker's schedule. Every array is
  explicitly sorted — input Event order never affects output order — and
  nothing passed in is ever mutated. Also exports `toPersonalProfile`,
  reused by `personalSchedule.ts` for the `configuration_error` state
  below.

  **Duty-source completeness (Potential/תקשא"ס period sources).**
  `potentialAllocations` feeds `lib/domain/potentialDutyEvents.ts`'s
  `buildPotentialDutyEvents` (see that file's own docs), whose output is
  merged into a `personDisplayEvents` list used for EVERY duty-display
  section: `todayEvents`/`upcomingEvents`/`calendarEvents`/
  `currentAssignments`/`nextAssignmentGroup`/`dutyBlocks`/`dutyActions` —
  originally (PR #60) this only fed `dutyBlocks`/`dutyActions` (the
  personal Duties page); a later pass widened it to every place this read
  model already displays the person's own duties (the calendar, Manager
  Area's selected-person drill-down, dashboard today/upcoming), since all
  of them are built from this ONE shared function. `issues`/
  `currentShiftContexts`/`nextShiftContexts` (coverage/roster) deliberately
  keep reading the ORIGINAL, unmerged `events` — a synthetic duty Event is
  never a second source of shift/coverage truth. A person whose duties
  live only in a תקשא"ס period source (never in "משמרות + תורנויות") now
  sees them everywhere this read model is consumed, while a normal
  department person's existing duties, coverage, fairness, and
  shift-worker classification are all completely unaffected (verified —
  capability flags/`isTechnician`/`isSupervisor` are `Person` fields this
  function never derives from duty data in either direction). Every other
  caller of this function (`buildScheduleReadModel.ts`'s "self"/"person"
  perspectives, `buildManagerOverviewReadModel.ts`'s `selectedPerson`) now
  threads its own already-fetched `potentialAllocations` through, so the
  same completeness reaches the calendar and Manager Area drill-down
  without any of them reimplementing the resolution/dedup logic.
  `buildScheduleReadModel.ts`'s THIRD perspective, "all" (the shared/
  everyone calendar), doesn't call this function at all — it gets the
  identical completeness a different way: `lib/domain/potentialDutyEvents.ts`'s
  `buildPotentialDutyEventsForRoster` (the same per-person conversion, run
  once per roster member) is merged into `everyone.duties`'s input ONLY —
  `everyone.staffing` keeps reading the raw `events`, so a תקשא"ס-sourced
  duty is visible on the shared calendar as a normal duty entry but never
  affects shift staffing/coverage.
- `personalSchedule.ts` — `loadPersonalScheduleReadModel()`, the
  server-only orchestration layer. Resolves the Supabase identity first
  (a non-authenticated session never triggers a Google request),
  batch-fetches personnel + schedule + settings + potentialH1 + potentialH2
  in a single `fetchRawWorkbookSnapshot` call — the same fixed source set
  `FAIRNESS_WORKBOOK_SOURCES` already establishes — resolves the Person via
  `resolveIdentityAgainstPeople` (no second personnel fetch/parse), and
  fails closed as a typed `configuration_error` — never a default start
  time — on invalid/missing shift configuration. That state still carries
  the resolved person's safe profile (identity resolution succeeded; only
  the shift-time configuration didn't), so the app shell can render
  normally around a polished in-content error state.
- `getRequestPersonalSchedule.ts` — `cache(loadPersonalScheduleReadModel)`,
  a React request-scoped memoization. The protected `(app)` layout
  (identity/shell) and the dashboard page (content) both call this, so a
  normal request performs exactly one Google workbook batch fetch instead
  of two. Scoped to a single request's render only — never persistent
  across requests/users, never `unstable_cache`, no module-level state.

No public API route consumes this yet — PR #9's dashboard calls
`getRequestPersonalSchedule()` directly from Server Components.

## Manager overview (PR #14)

`ManagerOverviewReadModel` is a SEPARATE, manager-only read model —
`PersonalScheduleReadModel` above stays personal-only and is never
expanded to carry unit-wide data. The manager screen (`/manager`) is the
first feature that intentionally broadens scope beyond the authenticated
person's own schedule, and that broader scope is authorized, not assumed:

- `managerTypes.ts` — `ManagerOverviewReadModel` and every safe
  projection it's built from (`ManagerPersonSummary` — no email;
  `ManagerIssue` — global operational issues with `personId`/`personName`
  added, still no `sourceSheet`/`sourceCell`/raw evidence `Event[]`;
  `ManagerShiftOverviewEntry` — unit-wide coverage grouped by date+period,
  preserving every assigned person, never collapsed to one;
  `ManagerDutyEntry`/`ManagerAbsenceEntry`; `ManagerPotentialRequirementView`
  — reconciled Potential-vs-internal rows). Manager scope is broader than
  personal scope, but it is still a typed, explicitly safe projection —
  raw workbook structures, the spreadsheet ID, and Google API objects
  never reach it.
- `buildManagerOverviewReadModel.ts` — the pure, deterministic builder.
  Takes the authenticated manager `Person`, the full parsed
  `people`/`events`, combined H1+H2 `PotentialAllocation[]`, a
  `ShiftSchedule`, an explicit `LocalNow`, the resolved `ManagerDateRange`,
  and a raw (unvalidated) `selectedPersonId` — no network, no auth, no
  `Date`/UTC. Runs `detectOperationalIssues()` on the FULL manager-side
  parsed schedule (never the already-person-filtered
  `PersonalScheduleReadModel.issues`), builds the unit-wide coverage
  overview by reusing `analyzeUnitShiftCoverage` per date+period group —
  a PURE, person-order-independent group coverage algorithm (never an
  arbitrarily-chosen "target" person's perspective, and never a
  reinvented coverage algorithm) — and reconciles Potential allocations
  via `lib/domain/potentialReconciliation.ts` against the verified real
  requirement schema. Before reconciliation (PR #16), `potentialAllocations`
  is mapped through `lib/domain/potentialSourceOwnership.ts`'s
  `scopeManagerPotentialAllocation` (classifying each allocation exactly
  once) so only this team's own Potential responsibility (תקש"ל/תקשאס
  aliases + resolvable team members, short-name/annotated sources
  included) ever reaches `reconcilePotentialAllocations` — an external
  organizational source (איתן/רוקם/מבצעים/סייבר/מ"א/אמל"ח קצה/מנהלה/...)
  never produces a `"missing"` row and never affects any problem/attention
  count derived from `potentialRequirements`. That same step also enriches
  a short/annotated source's `resolvedSourcePersonId` (the parser only
  resolves exact full names) so `sourceConflict` keeps working for it. The
  selected-person section reuses
  `buildPersonalScheduleReadModel()` OUTRIGHT from the same in-memory
  `people`/`events`/`shiftSchedule` snapshot — no per-person Google
  fetch, no reimplemented current/next/counterpart/duty/issue logic. An
  invalid/unknown `selectedPersonId` falls back safely to the "everyone"
  scope rather than crashing. This call also now passes the same
  `potentialAllocations` this builder already receives, so a selected
  person's תקשא"ס-only duty appears in their `currentAssignments`/
  `nextAssignmentGroup` exactly like a real one would (see
  `buildPersonalScheduleReadModel.ts`'s own "Duty-source completeness"
  notes). The unit-wide `duties` list gets the SAME completeness
  separately: `lib/domain/potentialDutyEvents.ts`'s
  `buildPotentialDutyEventsForRoster` (the identical per-person conversion
  and dedup, just run once per roster member) is merged into the `events`
  passed to `buildManagerDutyEntries` ONLY — `coverageOverview`/`issues`/
  `potentialRequirements`/`absences` above and below all keep reading the
  raw `events`, so this never touches coverage, fairness, or the Potential
  reconciliation section.
- `managerOverviewParams.ts` — `parseManagerOverviewSearchParams`, strict
  parsing of `/manager`'s `?person=`/`?range=`/`?month=`/`?problems=`
  query params into typed, defaulted values. `person` omitted or `"all"`
  means everyone; `problems=1` is the only value that turns on the
  problems-only filter.
- `managerOverview.ts` — `loadManagerOverviewReadModel()`, the
  server-only orchestration layer and the security-critical piece of
  PR #14:
  1. Reuses `getRequestPersonalSchedule()` (the SAME request-scoped
     result the protected layout already computed) as the first
     authorization gate — every existing auth/config state passes
     through unchanged.
  2. ONLY once that's `"ok"` AND `model.person.isManager === true` does
     this fetch the manager-only batch (`personnel` + `schedule` +
     `settings` + `potentialH1` + `potentialH2`) — one additional Google
     request, NEVER performed for a normal user or for a non-manager
     hitting `/manager` (which gets `{status: "forbidden"}` immediately,
     no manager fetch at all).
  3. Defense in depth: re-resolves the authenticated identity against the
     FRESH manager snapshot's own freshly-parsed personnel sheet and
     re-checks `isManager` there too. If that second check fails for any
     reason, this fails closed as `"forbidden"` — the already-fetched
     manager data is discarded, never rendered. Manager authorization is
     `person.isManager === true` ONLY; supervisor/technician/
     personnelType/route-visibility are never treated as equivalent.
- `getRequestManagerOverview.ts` — `cache(loadManagerOverviewReadModel)`,
  keyed on primitive `(personId, range, month)` args (not
  one object literal) so React's `cache()` per-argument identity
  comparison actually dedupes multiple Server Components on the same
  `/manager` render.

**Fetch count by viewer:** a normal user (any page) → 1 Google batch
fetch (`personnel`+`schedule`+`settings`). A non-manager hitting
`/manager` → still 1 (the shared personal-loader fetch; forbidden before
any manager-only fetch). A manager hitting `/manager` → 2 (the shared
personal-loader fetch, reused via `cache()` with the layout, PLUS the one
manager-only batch above). Security boundary matters more than
minimizing this count further.

The client only ever receives safe roster `{id, name}[]` (see
`ManagerPersonSelector`, the one narrow Client Component this screen
uses) — never the full `ManagerOverviewReadModel`, never raw personnel
rows, never raw Potential sheets.

## Manager Fairness (PR #15)

`ManagerFairnessReadModel` is a SEPARATE, manager-only read model from
`ManagerOverviewReadModel` — Fairness and Potential reconciliation happen
to live on the same sheet tabs (`פוטנציאל תקש"אס 1-6/2026` /
`7-12/2026`) but are two different domains and are never merged into one
giant read model.

- **Shared auth/fetch boundary.** `managerWorkbookContext.ts` extracts
  PR #14's manager authorization + manager-wide fetch boundary out of
  `managerOverview.ts` into `loadManagerWorkbookContext()`, reused by
  BOTH Manager Overview and Manager Fairness. It performs the exact same
  security sequence PR #14 established (personal-loader gate →
  `isManager` check → the ONE manager batch fetch, personnel + schedule +
  settings + potentialH1 + potentialH2 → fresh re-verification against
  the snapshot's own personnel sheet → fail closed), then returns the
  re-verified manager `Person`, the full parsed roster, and the raw
  `RawWorkbookSnapshot` for the caller to parse further sheets from.
  `managerOverview.ts` now only does what's Overview-specific (settings →
  shift schedule, schedule → events, Potential reconciliation);
  `managerFairness.ts` only picks the ONE Potential sheet the resolved
  period needs and parses its Fairness table. Neither caller ever
  triggers a second/third Google fetch — a manager hitting
  `/manager/fairness` costs exactly the same 2 fetches (1 personal-loader
  + 1 manager batch) as hitting `/manager`.
- **`lib/domain/fairnessTable.ts`** — `FairnessPersonRow` /
  `FairnessTotalsRow` / `FairnessTargets`, the domain-owned shapes
  `lib/parsers/fairness.ts` produces (same convention as
  `PotentialAllocation`/`lib/parsers/potential.ts`).
- **`lib/parsers/fairness.ts`** — locates each Potential sheet's separate
  Fairness table ("טבלת צדק") STRUCTURALLY, by its exact six header
  labels (שם / הקצאה / ניקוד הפוטנציאל הקודם / ניקוד לפוטנציאל הנוכחי /
  סופ"שים / פטורים) appearing together on one row — never a hard-coded
  W:AB column range. Parses person rows until the "סך הכל:" row, parses
  that total row separately, and locates the period-specific X/2X target
  note below the table by regex over each row's joined cell text (so the
  note parses whether it's one cell or split across several) — a
  missing/malformed note returns `null` targets, never a guessed default.
  "-" always means unavailable (`null`), never silently 0.
- **`lib/domain/fairnessExemptions.ts`** — centralized, exact-match-only
  known exemption → affected `DutyFamily[]` mapping (שמירות → guard;
  מטבח → daily_kitchen/full_kitchen/weekend_kitchen; רס"ר → rasar). An
  unknown exemption label is preserved raw with an empty
  `affectedDutyFamilies` — never fuzzy-matched, never dropped.
- **`lib/domain/fairnessAnalysis.ts`** — pure analysis over the sheet's
  own `currentScore`, which is NEVER replaced: `resolveComparisonTarget`
  (only טכנאי/אחמ"ש get a deterministic target — every other allocation
  label gets `null`, never invented), `computeScoreDelta` (`null` when
  there's no previous score, never treated as 0), `computeGapToTarget`,
  `computeNormalizedLoad` (`currentScore / target`, letting roles with
  different target scales compare fairly), and `sumDisplayedFairnessRows`
  (the independently computed sum of the currently parsed person rows).
  This last one is deliberately NOT a validation of the sheet's own
  reported "סך הכל:" total — the real workbook's totals can be built from
  a formula that doesn't equal a naive sum of every displayed row (a
  verified real example: H1's previous-score total is
  `=SUM(Y9:Y19)/4*6`), so `reportedXTotal` (from the parser) and
  `displayedXSum` (from this function) are two independent facts, never
  compared, never producing a "discrepancy"/"mismatch" conclusion.
- **`lib/domain/fairnessPeriod.ts`** — `FairnessPeriodKey` ("h1"/"h2"),
  `resolveFairnessPeriod` (Jan-Jun → h1, Jul-Dec → h2 from
  `LocalNow.date`, never a browser-local date; an invalid/missing
  `?period=` falls back to the period containing `now`), and
  `fairnessPeriodLabel` (year read from `now`, never hard-coded).
- **`managerFairnessTypes.ts`** — `ManagerFairnessReadModel` and its safe
  projections (`ManagerFairnessPersonRowView`,
  `ManagerFairnessExemptionView`, `ManagerFairnessTotalsView`,
  `ManagerFairnessChartSlice`). Never carries email,
  `sourceSheet`/`sourceCell`, raw Google rows, or the spreadsheet id.
  `ManagerFairnessChartSlice` (`{id, name, score, percentage}`) is the
  ONLY shape the chart's client-safe rendering ever touches.
- **`buildManagerFairnessReadModel.ts`** — the pure, deterministic
  builder: projects each `FairnessPersonRow` through the analysis
  functions above, sorts rows by normalized load ascending (rows without
  one sort after, stable tiebreak by source name) — this is relative-load
  ordering only, NEVER labeled "next up"/"recommended" (that's PR #16's
  job) — and builds the raw-`currentScore` chart slices (null-score rows
  excluded; an all-null/zero team produces an empty chart, never a
  division by zero).
- **`managerFairnessParams.ts`** — strict `?period=`/`?person=` parsing,
  same convention as `managerOverviewParams.ts`.
- **`managerFairness.ts`** — `loadManagerFairnessReadModel()`, the
  server-only orchestration layer: `loadManagerWorkbookContext()` →
  resolve the period → pick that one Potential sheet →
  `parseFairnessTable()` → `buildManagerFairnessReadModel()`.
- **`getRequestManagerFairness.ts`** — `cache(loadManagerFairnessReadModel)`,
  keyed on primitive `(period, personId)` args, same convention as
  `getRequestManagerOverview.ts`.

`/manager/fairness` (`app/(app)/manager/fairness/page.tsx`) renders this
read model entirely server-side. The only client-safe payload that ever
reaches a narrower surface is `ManagerFairnessChartSlice[]` for the donut
chart — implemented as plain server-rendered SVG (no chart library, no
client component at all). PR #15 never recommends who should be assigned
next ("הבא בתור") — that is explicitly out of scope, reserved for a
future PR #16 that adds assignment-specific eligibility.

## Manager adoption — "התחברויות והתראות"

A management-visibility category, not an operational one: it reconciles
the SAME כ"א roster every other manager category uses against Supabase
auth + push-subscription state, so a manager can see who has logged into
מי-מה-מו, who hasn't, and who can currently receive push notifications.
Formerly a small aside inside Overview (מצב התראות, PR #40); now its own
top-level `ManagerCategory` (`"logins"`) so Overview stays focused on
operational shift/duty issues. No new database schema and no parallel
personnel list — every fact here already existed, just split into the two
questions a manager actually asks instead of one collapsed engine enum.

- **Engine reuse.** `lib/notifications/engine/readiness.ts`'s
  `computeNotificationReadiness()` (the SAME bulk Supabase Admin API +
  `push_subscriptions` lookup PR #40's aside already used) is still the
  ONLY place identity/subscription state is computed — this read model
  never re-queries Supabase itself. `PersonReadinessResult` now also
  carries `avatarUrl` (the person's Google profile photo), read from the
  SAME already-fetched bulk `listUsers()` page via
  `lib/auth/currentUser.ts`'s `extractAvatarUrl` (exported for this reuse)
  — never a new per-user Admin API call, and never a login timestamp
  (`last_sign_in_at`/`created_at` exist on the Admin API response but
  nothing here reads them; login recency stays a possible future
  enhancement, not a fabricated approximation).
- **`managerTypes.ts`** — `ManagerAdoptionPersonView` splits each person's
  single `PersonNotificationReadiness` into `loginStatus`
  (`logged_in`/`not_logged_in`, `null` when a `dataIssue` makes the
  question unanswerable), `notificationStatus` (`ready`/`not_enabled`,
  `null` before `logged_in`), and `dataIssue`
  (`missing_email`/`ambiguous_email` — a roster problem to fix in כ"א, not
  a person to remind). `needsNudge` is true exactly for
  `not_logged_in`/`not_enabled`. `ManagerAdoptionSummary` carries only the
  counts the product spec actually asks for (total/logged-in/not-logged-
  in/notification-ready/logged-in-not-ready/data-issue) — never a
  decorative statistic. `ManagerAdoptionState` mirrors the same
  skipped/unavailable/available three-way the old aside used, except
  `available` is shown even when every count but the total is calm — this
  is a full category page a manager navigates to on purpose, not a
  transient note.
- **`buildManagerOverviewReadModel.ts`** — `toManagerAdoptionPerson()` is
  the one exhaustive switch over `PersonNotificationReadiness` that
  performs the split above; `toManagerAdoptionView()` derives every
  summary count from that SAME single pass, so they can never drift out
  of agreement with `people` by construction. Every roster person survives
  into `ManagerAdoptionView.people` (unlike the old aside, which dropped
  every `ready` person).
- **`lib/presentation/managerAdoption.ts`** — `buildManagerAdoptionSectionView()`
  groups people into the four buckets the "התחברויות והתראות" UI actually
  renders (`notLoggedInGroup`/`notificationsOffGroup` — always visible,
  actionable; `readyGroup` — quiet, collapsed by default;
  `dataIssueGroup` — visually distinct roster-data framing), plus a
  headline sentence and the stat list for `ManagerAdoptionSummary`.
- **UI** — `ManagerAdoptionSummary`/`ManagerAdoptionSection`
  (`components/manager/`), rendered only for `category === "logins"` in
  `app/(app)/manager/page.tsx`.

## Manager Area shift snapshot ("תמונת מצב משמרות")

A compact previous/current/next department shift snapshot inside the
Manager Area's own Overview category, for a manager who is themselves
shift-capable (e.g. an אחמ״ש with manager access) — as distinct from a
permanent/non-shift manager, who already gets this exact same operational
picture as their own dedicated `PermanentManagerHome` Home screen instead.
Neither existing Home experience (`PermanentManagerHome`, the normal
personal dashboard) changes; this section is additive, inside `/manager`
only.

- **`shiftSnapshot.ts`** — `resolveShiftSnapshotTriad(events, shiftSchedule,
  now)`, extracted from what was previously inlined logic in
  `buildPermanentManagerHomeReadModel.ts`. Resolves the canonical
  previous/current/next day/night shift via `resolveCurrentShiftPeriod`/
  `previousShiftPeriod`/`nextShiftPeriod` (`lib/domain/shiftSchedule.ts` —
  back-to-back 12h blocks with no gaps, so "current" always resolves for
  any valid `ShiftSchedule`), looks up each shift's roster/coverage via
  `buildShiftStaffingOverview` (falling back to an explicitly "missing,
  nobody assigned" entry via `analyzeUnitShiftCoverage([], ...)` for a
  shift with zero events, never an omitted/undefined shift), and computes
  each shift's elapsed/remaining/progress timing via
  `computeIntervalTiming` (`lib/domain/assignmentTiming.ts`) against the
  shift's own canonical hours — DST-safe, overnight/date-boundary-safe,
  never reimplemented. This is genuinely department-wide: `events` is the
  full parsed schedule, never filtered to one person, so previous/current/
  next are the actual neighboring shifts regardless of who is viewing.
  Both `buildPermanentManagerHomeReadModel.ts` and
  `buildManagerOverviewReadModel.ts` call this SAME function — zero
  duplication of shift resolution, roster/coverage lookup, or progress
  timing between the permanent-manager Home and the Manager Area section.
- **`lib/domain/personnelType.ts`'s `isShiftCapable`** — the eligibility
  signal for this section: `person.isSupervisor || person.isTechnician`,
  the same capability flags `classifyRoleGroup` already reads. Deliberately
  NOT a title-string check (e.g. matching "אחמ״ש") and deliberately
  independent of `classifyPersonnelType` (employment category, used to
  route the permanent-manager Home) — a manager can be shift-capable
  regardless of their `personnelType`.
- **`managerTypes.ts`** — `ManagerOverviewReadModel.managerShiftSnapshot:
  ShiftSnapshotTriad | null`. `buildManagerOverviewReadModel.ts` sets it via
  `isShiftCapable(manager) ? resolveShiftSnapshotTriad(events,
  shiftSchedule, now) : null` — purely in-memory over the SAME
  `events`/`shiftSchedule`/`now` Manager Overview already fetches for
  coverage/issues, so eligible managers cost zero additional Google/Supabase
  fetches.
- **UI** — `components/manager/ManagerShiftSnapshotSection.tsx` renders
  the triad via the SAME `ShiftSnapshotCard` component
  (`components/home/`) the permanent-manager Home uses, completely
  unmodified — but in a plain, equal three-column grid rather than the
  Home's hero-weighted layout with mobile reordering, so it reads as one
  compact operational section inside the Overview page rather than a
  second Home screen. Rendered in `app/(app)/manager/page.tsx` only when
  `category === "overview"` and `model.managerShiftSnapshot` is non-null;
  `null` (a permanent/non-shift manager) renders nothing extra, and every
  other Manager Area category/behavior is unaffected.

## Fairness table avatars

Both standalone Fairness modes (`shiftFairness.ts`/`dutyFairness.ts`, via
`loadFairnessWorkbookContext()`) now carry each row's Google profile
photo, so `/fairness`'s cards can show it next to the person's name.

- **`fairnessAvatarLookup.ts`** — `fetchEmailToAvatarUrl()` (account-wide,
  roster-independent, reuses the SAME Supabase Admin API bulk
  `listUsers()` primitive `lib/notifications/engine/recipients.ts`'s
  `fetchAllUserIdsByEmail` already established for the notification worker
  and the manager-only adoption view above — never a second lookup
  mechanism) and `resolveAvatarUrlsByPersonId()` (pure, matches that map
  against one specific roster, failing closed on an ambiguous email
  exactly like every other identity resolution in this codebase). Split
  in two specifically so `fairnessWorkbookContext.ts` can kick the fetch
  off CONCURRENTLY with its own workbook fetch, instead of waiting for the
  roster to resolve first.

  This is genuinely NEW traffic to a privileged, RLS-bypassing Admin API
  call: every prior caller was either the Cron-triggered worker (no live
  user request at all) or a manager-only view. `/fairness` is a normal
  main-navigation destination every mapped user can load, so
  `fetchEmailToAvatarUrl` is wrapped in a short (30s) `unstable_cache` —
  the same TTL/convention `lib/sync/workbookSnapshotCache.ts` already
  established — so a burst of different users loading Fairness within a
  few seconds reuses one Admin API call rather than one each. Never fails
  the whole page: `fairnessWorkbookContext.ts` catches a rejected lookup
  and degrades to an empty map (every row falls back to initials).
- **`fairnessWorkbookContext.ts`** — `FairnessWorkbookContext.avatarByPersonId`
  carries the resolved map through to both `shiftFairness.ts` and
  `dutyFairness.ts`.
- **`shiftFairness.ts`/`dutyFairness.ts`** — each stamps `avatarUrl` onto
  its already-built read model's rows via a small `withAvatars()`
  post-processing step that runs strictly AFTER
  `buildShiftFairnessReadModel`/`buildDutyFairnessReadModel` — neither
  builder itself ever sets or reads `avatarUrl`, so this can never affect
  calculations, sorting, eligibility, or historical logic.
- **`lib/presentation/fairnessCards.ts`** — `ShiftFairnessCardView`/
  `DutyFairnessCardView` both carry `avatarUrl` straight through from the
  row, unchanged.
- **UI** — `ShiftFairnessCard`/`DutyFairnessCard` (`components/fairness/`)
  render it via the shared `Avatar` component (`components/ui/Avatar.tsx`,
  new `size="xs"` variant for this dense-row context) immediately beside
  the person's name — Google photo when available, initials otherwise,
  graceful fallback on a failed image load.
