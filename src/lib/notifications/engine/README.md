# lib/notifications/engine

PR #30's automatic notification engine. Turns a fresh Google Sheet read
into push notifications through PR #29's delivery pipeline
(`lib/push`/`lib/notifications`), driven by Supabase Cron calling
`POST /internal/notifications/tick` every 5 minutes in production. See
`AGENTS.md`/the PR description for the full product spec this
implements; this file is the module map.

## Read / normalize / diff (pure or near-pure)

- `freshRead.ts` (server-only) -- the worker's fresh, uncached read path:
  `fetchRawWorkbookSnapshot` directly, never `lib/sync`'s 30-second
  navigation cache. Mirrors `loadPersonalScheduleReadModel`'s parse
  orchestration (personnel -> settings -> schedule -> events).
  `fetchFreshPersonnelRead()` is the same fresh path narrowed to
  personnel ONLY -- `scheduledWorker.ts`'s own dedicated read, never a
  second personnel-parsing model.
- `semanticFacts.ts` (pure) -- normalizes a week's Events into small
  JSON-serializable facts (shift/team/duty/coverage), reusing real domain
  functions (`buildShiftRoster`, `analyzeUnitShiftCoverage`) rather than
  re-deriving coverage/roster logic.
- `diffFacts.ts` (pure) -- structural diff between two fact maps. A
  change only exists when the normalized VALUE differs -- this is what
  makes it semantic diffing, not raw cell diffing.
- `copy.ts` (pure) -- Hebrew title/body/path/tag per settled change,
  reusing `lib/presentation/labels.ts`/`hebrewDate.ts` for existing
  Hebrew naming. Falls back to a concise generic message rather than
  inventing details it can't safely express.
- `logisticsWithdrawal.ts` (pure) -- detects a logistics-withdrawal
  (משיכות מהלוגיסטיקה) assignment from the ALREADY-parsed `Event` stream.
  There is no dedicated Sheet column/parser for this -- `lib/parsers/event.ts`'s
  classifier already lets unrecognized cell text fall through to
  `category: "other"` with the text preserved verbatim, and that's what
  a "משיכות" cell produces today. This module is a keyword filter over
  that existing output, nothing more -- see its own docstring.
- `logisticsCoordination.ts` (pure) -- team-coordination logic ON TOP of
  the detection above: who is the relevant אחמ"ש for the 13:00–14:00
  withdrawal window (structural, via `resolveEventShiftInterval` +
  `clipInterval` over Schedule Events -- never `Person.isSupervisor`
  alone), which technicians are eligible to help (present for the window,
  `isTechnician`, no same-date absence, no אילוץ יום), and the
  singular/plural Hebrew copy for a multi-assignee date. Never reads
  Potential H1/H2; never a second shift-time engine.

## Server-only orchestration

- `serviceClient.ts` -- the ONE call site for
  `createSupabaseServiceRoleClient` (see
  `src/lib/supabase/serviceRoleClient.ts` and the boundary guard at
  `src/app/notificationServiceRoleBoundary.test.ts`).
- `recipients.ts` -- maps כ"א `Person.email` to a Supabase auth user id
  via the Admin API. Fails closed on an ambiguous/unmapped email --
  never targets by display-name.
- `store.ts` -- the only module that talks to the five
  `notification_*`/`observed_notification_facts`/`pending_notification_changes`
  tables (see the migration). Owns the JSONB "absent value" sentinel
  encoding and the debounce reconciliation logic in
  `applyPendingChanges` -- see that function's own docstring for the
  "evening -> morning -> evening" orphaned-revert case it specifically
  handles.
- `changeDetection.ts` -- baseline init/rollover (silent, spec section
  9), diff, debounce settle, and manager-only coverage-gap gating.
- `reminders.ts` -- tomorrow shift/duty/logistics-withdrawal reminders
  (cross week boundaries, upsert-or-cancel semantics -- a moved
  assignment cancels the old recipient's job and creates the new
  recipient's, since dedupe_key includes the resolved user id) and
  weekly constraints reminders (every real auth account, account-wide by
  product intent -- `fetchAllAuthUserIds`, never gated on push-
  subscription state or כ"א/roster mapping -- Sunday/Monday only). Also
  the logistics-withdrawal team-coordination reminders built
  on `logisticsCoordination.ts`: a day-before (20:00) supervisor
  notification (informed of the assignee, or an anti-spam-only warning
  if still unassigned -- never a technician-wide push that evening), and
  a same-day (12:00) trio -- the assigned technician's personal reminder,
  a supervisor warning ONLY if still unassigned, and a consolidated
  teammate notification (excludes the assignee and any supervisor
  recipient, per the "one push per purpose" precedence rule). Every one
  of these categories reuses the SAME upsert-or-cancel-by-prefix model as
  the shift/duty reminders -- every tick recomputes fresh from the
  current Schedule truth, so a reassignment, a newly-proven/lost
  supervisor, or a technician's eligibility change all resolve correctly
  before the job is ever delivered. The עלמ״ש check-in reminder
  (`almash_check_in`, שמירה/עתודה/אוקסיד only) is the same same-day model
  again, built directly on `lib/domain/dutyBlocks.ts`/`dutyActions.ts`
  (never a re-derivation of check-in dates from `Event`s) -- 12:45 on a
  weekday/Friday, or the real astronomical מוצ״ש for that Saturday
  (`lib/time/motzashShabbat.ts`) when the check-in date is a Saturday.
  See `reminders.ts`'s own `runAlmashCheckInReminders` docstring.
- `delivery.ts` -- claims due outbox jobs, fans out to every active
  subscription per recipient, reuses PR #29's `sendPush` classification
  (permanent 404/410 -> delete subscription; transient -> never delete,
  bounded retry via the job's own `attempts`/`max_attempts`).
- `pipeline.ts` -- the top-level orchestrator
  (`runNotificationWorkerTick(mode)`). `mode: "dry_run"` computes the
  same summary shape while skipping every mutating store call and the
  entire delivery phase; `mode: "send"` is the real path. Also runs
  manager scheduled-broadcast dispatch as a FALLBACK -- see below.
- `scheduledWorker.ts` -- the minute-level-precision follow-up's own
  orchestrator (`runScheduledBroadcastWorkerTick()`), driving
  `POST /internal/notifications/scheduled`, Supabase Cron's once-a-minute
  job. A cheap Supabase pre-check first (`peekAnyManagerScheduledBroadcastWorkDue`
  in `store.ts`) -- on a quiet minute this returns immediately with NO
  Google/workbook read, no dispatch, no delivery at all. Only when work
  exists: a personnel-ONLY fresh read (`freshRead.ts`'s
  `fetchFreshPersonnelRead`), then the EXACT SAME
  `runDueScheduledBroadcastDispatch`/`dispatchScheduledBroadcast`
  (`scheduledBroadcast.ts`) PR #79 built, then `runDelivery()` in the
  SAME invocation so a freshly-dispatched job doesn't wait for a separate
  delivery pass. This is the PRIMARY, minute-precision owner of
  scheduled-broadcast dispatch; `pipeline.ts`'s main 5-minute tick ALSO
  still calls `runDueScheduledBroadcastDispatch`, as a deliberate
  fallback in case this worker's manually-configured Cron job is ever
  missing, disabled, or broken -- two independently-scheduled callers of
  the same claim function are safe by construction (see
  `runDueScheduledBroadcastDispatch`'s own doc comment: it claims and
  dispatches ONE row at a time, so `claim_due_manager_scheduled_broadcasts`'s
  uniform `claimed_at`-vs-90-second-lease eligibility is always what a
  row's lease is actually measured against, never a stale bulk-claim
  timestamp). Calling `runDelivery()` from both this worker and the main
  tick is likewise safe by construction (`for update skip locked`
  claiming + per-device terminal delivery states, see `delivery.ts`) --
  the only effect is an already-due job of any category delivering
  somewhat sooner.

## Concurrency

Every mutating operation is safe under overlapping worker invocations
via database-level claiming/locking (`for update` / `for update skip
locked` in the migration's three functions), never an in-memory/
module-level lock. See
`notificationEngineFunctions.integration.test.ts` for real-Postgres
proof of the concurrency guarantees, and `migration.test.ts` for the
text-level security-shape guard (mirrors `lib/push/migration.test.ts`'s
pattern).
