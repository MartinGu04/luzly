import "server-only";
import { fetchFreshPersonnelRead } from "./freshRead";
import { runDueScheduledBroadcastDispatch } from "./scheduledBroadcast";
import { runDelivery, type DeliverySummary } from "./delivery";
import { peekAnyManagerScheduledBroadcastWorkDue } from "./store";
import { runStage } from "./workerErrors";

export interface ScheduledBroadcastWorkerTickSummary {
  /** True when the cheap pre-check found nothing due/recoverable -- no Google read, no dispatch, no delivery happened this tick. */
  skipped: boolean;
  scheduledBroadcastsDue: number;
  scheduledBroadcastsDispatched: number;
  scheduledBroadcastsFailed: number;
  /** `runDelivery()`'s own claim count for THIS invocation -- includes any due job, not only ones this tick's dispatch just created (see this module's own docstring). */
  jobsClaimed: number;
  durationMs: number;
}

/**
 * The dedicated once-a-minute scheduled-broadcast worker's orchestrator,
 * driving `POST /internal/notifications/scheduled` (see that route for the
 * secret-gated entry point). This is a SEPARATE, narrower pipeline from
 * `runNotificationWorkerTick` (`pipeline.ts`, the main 5-minute worker) --
 * NOT a copy of it and NOT a "run everything every minute" shortcut:
 *
 * 1. A cheap, read-only Supabase pre-check (`peekAnyManagerScheduledBroadcastWorkDue`,
 *    which mirrors the claim function's own two-way, lease-only
 *    eligibility -- due-scheduled, or claimed with an expired 90-second
 *    lease. `batch_id`'s presence never bypasses the lease -- see
 *    `20260821100000_speed_up_manager_scheduled_broadcast_claim.sql`'s
 *    own doc comment for why that matters under overlapping invocations.
 *    When it finds nothing, this returns immediately: no Google/workbook
 *    request, no personnel parsing, no dispatch, no delivery. A minute
 *    with nothing to do costs one small Postgres query, never a Sheets
 *    API call.
 * 2. Only when work exists: a PERSONNEL-ONLY fresh read
 *    (`fetchFreshPersonnelRead`, never Schedule/Settings) -- everything
 *    `dispatchScheduledBroadcast` needs to re-resolve recipients fresh.
 * 3. The exact same `runDueScheduledBroadcastDispatch` (audience
 *    resolution, idempotency, crash-recovery) PR #79 already built for
 *    the main tick -- reused unmodified, never re-implemented here.
 * 4. The exact same `runDelivery()` PR #29/#30 already built, invoked in
 *    THIS SAME tick so a freshly-dispatched job doesn't wait for a
 *    separate delivery pass. Safe to call from two places (this worker
 *    AND the main 5-minute tick): `claim_due_notification_jobs` uses
 *    `for update skip locked`, and each device's delivery row has a
 *    terminal state (`sent`/`failed_permanent`) that's always skipped on
 *    a later call -- see `delivery.ts`. The only externally-visible
 *    effect of calling it here too is that an already-due job of ANY
 *    category may now deliver up to ~4 minutes sooner than it otherwise
 *    would have, which is a strict improvement, never a correctness risk.
 *
 * This worker is the PRIMARY, minute-precision owner of scheduled-
 * broadcast dispatch. `pipeline.ts`'s main 5-minute tick ALSO still calls
 * `runDueScheduledBroadcastDispatch` as a deliberate FALLBACK -- this
 * worker's own Cron job is configured manually outside the repository,
 * so if it's ever missing/disabled/broken, scheduled broadcasts still go
 * out (just on the slower 5-minute cadence) rather than stopping
 * entirely. Two independently-scheduled callers of the same claim
 * function are safe by construction: `claim_due_manager_scheduled_broadcasts`'s
 * uniform `claimed_at`-vs-90-second-lease eligibility (see
 * `runDueScheduledBroadcastDispatch`'s own doc comment) means whichever
 * caller claims a row first owns it for the lease; the other can only
 * ever claim a DIFFERENT due row, never the same live one.
 */
export async function runScheduledBroadcastWorkerTick(): Promise<ScheduledBroadcastWorkerTickSummary> {
  const startedAt = performance.now();

  const dueCount = await runStage("scheduled_broadcasts_work_check", () => peekAnyManagerScheduledBroadcastWorkDue());
  if (dueCount === 0) {
    return {
      skipped: true,
      scheduledBroadcastsDue: 0,
      scheduledBroadcastsDispatched: 0,
      scheduledBroadcastsFailed: 0,
      jobsClaimed: 0,
      durationMs: Math.round(performance.now() - startedAt),
    };
  }

  const { people } = await runStage("fresh_personnel_read", () => fetchFreshPersonnelRead());

  const dispatchResult = await runStage("scheduled_broadcasts", () => runDueScheduledBroadcastDispatch(people));

  const deliverySummary: DeliverySummary = await runStage("delivery", () => runDelivery());

  return {
    skipped: false,
    scheduledBroadcastsDue: dispatchResult.claimed,
    scheduledBroadcastsDispatched: dispatchResult.dispatched,
    scheduledBroadcastsFailed: dispatchResult.failed,
    jobsClaimed: deliverySummary.jobsClaimed,
    durationMs: Math.round(performance.now() - startedAt),
  };
}
