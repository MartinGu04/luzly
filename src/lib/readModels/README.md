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
