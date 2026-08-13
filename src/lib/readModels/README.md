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
