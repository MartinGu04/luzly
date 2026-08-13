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
  `ShiftSchedule`, and an explicit `LocalNow` — no network, no auth, no
  `Date`/UTC. Filters to the authenticated person's own Events, runs the
  existing `analyzeShiftCounterparts`/`detectOperationalIssues`/
  `buildDutyBlocks`/`deriveDutyActions` (reused, never reimplemented),
  and projects everything down to the safe types above. Colleague
  exposure is deliberately minimal: counterpart context only for the
  person's current/next shift(s), never every coworker's schedule. Every
  array is explicitly sorted — input Event order never affects output
  order — and nothing passed in is ever mutated. Also exports
  `toPersonalProfile`, reused by `personalSchedule.ts` for the
  `configuration_error` state below.
- `personalSchedule.ts` — `loadPersonalScheduleReadModel()`, the
  server-only orchestration layer. Resolves the Supabase identity first
  (a non-authenticated session never triggers a Google request),
  batch-fetches personnel + schedule + settings in a single
  `fetchRawWorkbookSnapshot` call (never `potentialH1`/`potentialH2` —
  that's a later manager feature), resolves the Person via
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
  requirement schema. The selected-person section reuses
  `buildPersonalScheduleReadModel()` OUTRIGHT from the same in-memory
  `people`/`events`/`shiftSchedule` snapshot — no per-person Google
  fetch, no reimplemented current/next/counterpart/duty/issue logic. An
  invalid/unknown `selectedPersonId` falls back safely to the "everyone"
  scope rather than crashing.
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
  keyed on primitive `(personId, range, month, problemsOnly)` args (not
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
  different target scales compare fairly), and
  `validateFairnessTotals` (independently sums the person rows and
  compares against the sheet's own reported total within decimal
  tolerance — informational only, never "fixes" the sheet).
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
