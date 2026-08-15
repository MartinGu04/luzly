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
- `reminders.ts` -- tomorrow shift/duty reminders (cross week
  boundaries, upsert-or-cancel semantics) and weekly constraints
  reminders (all push-enabled users, Sunday/Monday only).
- `delivery.ts` -- claims due outbox jobs, fans out to every active
  subscription per recipient, reuses PR #29's `sendPush` classification
  (permanent 404/410 -> delete subscription; transient -> never delete,
  bounded retry via the job's own `attempts`/`max_attempts`).
- `pipeline.ts` -- the top-level orchestrator
  (`runNotificationWorkerTick(mode)`). `mode: "dry_run"` computes the
  same summary shape while skipping every mutating store call and the
  entire delivery phase; `mode: "send"` is the real path.

## Concurrency

Every mutating operation is safe under overlapping worker invocations
via database-level claiming/locking (`for update` / `for update skip
locked` in the migration's three functions), never an in-memory/
module-level lock. See
`notificationEngineFunctions.integration.test.ts` for real-Postgres
proof of the concurrency guarantees, and `migration.test.ts` for the
text-level security-shape guard (mirrors `lib/push/migration.test.ts`'s
pattern).
