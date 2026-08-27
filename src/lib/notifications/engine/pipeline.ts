import "server-only";
import type { EmergencyAssignment } from "@/lib/domain/emergencyShift";
import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import { resolveOperationalMode } from "@/lib/emergencyMode/state";
import { resolveOperationalRoster } from "@/lib/readModels/operationalMode";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { fetchFreshWorkbookRead } from "./freshRead";
import { resolveNotificationRecipients } from "./recipients";
import { runChangeDetection, type ChangeDetectionSummary } from "./changeDetection";
import { findDueCustomWeeklyOccurrences, runDueCustomWeeklyRuleDispatch } from "./recurringRuleDispatch";
import { runReminders, type RemindersSummary } from "./reminders";
import { loadNotificationRuleConfig, type NotificationRuleConfig } from "./ruleConfig";
import { runDueScheduledBroadcastDispatch } from "./scheduledBroadcast";
import { runDelivery, type DeliverySummary } from "./delivery";
import { resolveOperationalGeneration } from "./operationalGeneration";
import { peekDueJobsCount, peekDueManagerScheduledBroadcastsCount, peekLastOperationalGeneration, setLastOperationalGeneration } from "./store";
import { formatWorkerErrorLog, runStage, sanitizeWorkerError, WorkerStageError } from "./workerErrors";

const SILENT_CHANGE_SUMMARY = (weekStart: string): ChangeDetectionSummary => ({
  currentWeek: weekStart,
  baselineAction: "unchanged",
  semanticChangesDetected: 0,
  pendingChangesOpen: 0,
  settledChanges: 0,
  jobsCreated: 0,
});

export type WorkerMode = "dry_run" | "send";

export interface WorkerTickSummary {
  mode: WorkerMode;
  currentWeek: string;
  baselineAction: "initialized" | "rolled_over" | "unchanged";
  baselineInitialized: boolean;
  semanticChangesDetected: number;
  pendingChanges: number;
  jobsCreated: number;
  jobsDue: number;
  scheduledBroadcastsDue: number;
  scheduledBroadcastsDispatched: number;
  scheduledBroadcastsFailed: number;
  /** Custom weekly recurring rules dispatched by THIS tick, as a fallback in case the dedicated once-a-minute worker's Cron job is ever missing/disabled/broken -- see this function's own docstring and `recurringRuleDispatch.ts`. */
  recurringRulesDispatched: number;
  recurringRulesFailed: number;
  recipientCount: number;
  recipientsUnmapped: number;
  recipientsAmbiguous: number;
  recipientsNoEmail: number;
  durationMs: number;
}

export type WorkerTickResult =
  | { status: "ok"; summary: WorkerTickSummary }
  | { status: "configuration_error"; message: string };

/** Fail-safe fallback when rule config loading/reminders itself fails this tick -- see `runNotificationWorkerTick`'s own isolation comment. */
const EMPTY_REMINDERS_SUMMARY: RemindersSummary = {
  tomorrowShiftJobs: 0,
  tomorrowDutyJobs: 0,
  tomorrowLogisticsWithdrawalJobs: 0,
  tomorrowLogisticsWithdrawalSupervisorJobs: 0,
  logisticsWithdrawalNoonAssignedJobs: 0,
  logisticsWithdrawalNoonSupervisorJobs: 0,
  logisticsWithdrawalNoonTeamJobs: 0,
  almashCheckInJobs: 0,
  tomorrowShiftCancelled: 0,
  tomorrowDutyCancelled: 0,
  tomorrowLogisticsWithdrawalCancelled: 0,
  tomorrowLogisticsWithdrawalSupervisorCancelled: 0,
  logisticsWithdrawalNoonAssignedCancelled: 0,
  logisticsWithdrawalNoonSupervisorCancelled: 0,
  logisticsWithdrawalNoonTeamCancelled: 0,
  almashCheckInCancelled: 0,
  constraintsJobs: 0,
  constraintsCancelled: 0,
};

/**
 * The top-level orchestrator for `POST /internal/notifications/tick`
 * (see PR #30 spec section 23's 17-phase pipeline). `mode: "dry_run"`
 * computes and returns the exact same summary shape as `"send"` but
 * skips every mutating store call and the delivery phase entirely --
 * spec section 24: "SEND NO PUSH". `mode: "send"` is the real path:
 * persists baseline/observed/pending-change/job state and actually
 * delivers through PR #29's push pipeline.
 *
 * Scheduled-broadcast dispatch (`runDueScheduledBroadcastDispatch`) is
 * also run here, BEFORE delivery, as a FALLBACK -- the dedicated
 * once-a-minute worker (`scheduledWorker.ts` /
 * `POST /internal/notifications/scheduled`) is the PRIMARY, minute-
 * precision owner, but that worker's Cron job is configured manually
 * outside this repository (see that module's own docs); if it's ever
 * missing, disabled, or temporarily broken, this main tick still
 * dispatches due schedules every 5 minutes rather than silently stopping
 * scheduled-broadcast delivery altogether. This costs essentially
 * nothing extra: `people` is already fetched fresh for this tick's other
 * phases. Running it before delivery keeps freshly-created jobs eligible
 * for THIS SAME tick's `runDelivery()` call, exactly like PR #79's
 * original ordering. Safe under overlapping workers by construction: the
 * dedicated worker and this fallback both go through the same
 * `claim_due_manager_scheduled_broadcasts` one-row-at-a-time claim with
 * its uniform `claimed_at`-vs-90-second-lease eligibility (see
 * `runDueScheduledBroadcastDispatch`'s own doc comment) -- whichever
 * claims a row first owns it for the lease, the other simply claims a
 * DIFFERENT due row (or none). Downstream batch/job idempotency remains
 * defense-in-depth, never the primary concurrency mechanism.
 */
export async function runNotificationWorkerTick(mode: WorkerMode): Promise<WorkerTickResult> {
  const startedAt = performance.now();
  const persist = mode === "send";

  const freshRead = await runStage("fresh_workbook_read", () => fetchFreshWorkbookRead());
  if (freshRead.status === "configuration_error") {
    return { status: "configuration_error", message: freshRead.message };
  }

  const { people, events, shiftSchedule } = freshRead.read;
  const now = getJerusalemLocalNow();
  const week = getOperationalWeek(now);

  const recipientResolution = await runStage("recipient_resolution", () => resolveNotificationRecipients(people));
  const personNameById = new Map(people.map((person) => [person.id, person.name]));

  /**
   * Emergency Mode (spec section 22/23) -- resolved via the SAME
   * `resolveOperationalMode()`/`resolveOperationalRoster()` boundary
   * every other emergency-aware surface uses, never a second concept of
   * "which world is live". `emergencyAssignments` stays `[]` and
   * `emergencyRosterAvailable` stays `false` whenever the emergency
   * workbook itself can't be read (`roster.mode === "emergency_unavailable"`)
   * -- change detection is then skipped ENTIRELY for this tick (see
   * below) rather than treating an unreadable workbook as "every desk
   * assignment vanished", which would fabricate a flood of false
   * "cancelled" notifications for real data this tick simply couldn't
   * see.
   */
  const operationalMode = await runStage("operational_mode", () => resolveOperationalMode());
  let emergencyAssignments: readonly EmergencyAssignment[] = [];
  let emergencyRosterAvailable = true;
  if (operationalMode.kind === "emergency") {
    const roster = await runStage("operational_roster", () => resolveOperationalRoster(people));
    if (roster.mode === "emergency") {
      emergencyAssignments = roster.assignments;
    } else {
      // `roster.mode === "emergency_unavailable"` -- the expected reason.
      // `roster.mode === "regular"` would mean `resolveOperationalMode()`
      // reported "emergency" moments earlier but `resolveOperationalRoster`
      // now reports "regular" within the SAME tick -- structurally
      // unreachable (both read the same request-scoped DB state), but
      // handled the same fail-safe way rather than crashing the whole
      // tick over an inconsistency this narrow.
      emergencyRosterAvailable = false;
    }
  }

  // Read-only either way (dry-run never writes it) -- this tick's own
  // computed "did the operational GENERATION change since the last
  // PERSISTED tick" signal, mirroring the week-rollover baseline's own
  // read-vs-write split (`peekBaselineState` vs `advanceNotificationBaseline`).
  // Deliberately the full generation identity (`resolveOperationalGeneration`),
  // never a bare `kind` comparison -- two different Emergency Mode
  // sessions (period A deactivated, unrelated period B activated before
  // this tick's own previous run observed a regular tick in between) both
  // report `kind: "emergency"`, but are DIFFERENT generations that must
  // still get the silent clear+reseed treatment below -- see
  // `operationalGeneration.ts`'s own docs.
  const operationalGeneration = resolveOperationalGeneration(operationalMode);
  const lastOperationalGeneration = await runStage("last_operational_generation", () => peekLastOperationalGeneration());
  const operationalGenerationTransitioned = (lastOperationalGeneration ?? "regular") !== operationalGeneration;

  // While Emergency Mode is active but its own workbook can't be read,
  // this tick has no reliable facts to diff either direction -- skip
  // change detection entirely (never touch baseline/observed/pending
  // state) rather than compute a false "everything changed" from an
  // empty reading. The next tick tries again.
  const changeDetectionRunnable = operationalMode.kind === "regular" || emergencyRosterAvailable;

  const changeSummary = changeDetectionRunnable
    ? await runStage("change_detection", () =>
        runChangeDetection({
          events,
          people,
          shiftSchedule,
          week,
          persist,
          recipientResolution,
          personNameById,
          emergencyAssignments,
          operationalMode: operationalMode.kind,
          operationalGenerationTransitioned,
        }),
      )
    : SILENT_CHANGE_SUMMARY(week.weekStart);

  // Same concurrency reasoning as the migration's own doc comment: a
  // plain, un-locked update, never routed through the atomic
  // `advance_notification_baseline` RPC. A stray double-write here (two
  // concurrent ticks both observing the same generation change) is still
  // harmless -- both would persist the identical `operationalGeneration`
  // string and both would have already performed the same idempotent
  // clear+reseed above, so there is nothing for this write to race
  // against. Never gates/serializes on this write; it purely records this
  // tick's own already-decided outcome for the NEXT tick to read.
  if (persist && changeDetectionRunnable) {
    await runStage("last_operational_generation_write", () => setLastOperationalGeneration(operationalGeneration));
  }

  // Loaded ONCE per tick and passed into `runReminders` -- never queried
  // per reminder/person (see `ruleConfig.ts`'s own docstring). A failure
  // here (or in `runReminders` itself) must NEVER silently fall back to
  // `notificationTiming.ts`'s old hardcoded constants -- a manager's
  // disable/time-change must never be silently overridden by a
  // configuration-load failure. It also must NOT take down scheduled-
  // broadcast dispatch / due-job delivery below, which are entirely
  // independent features -- so this is deliberately isolated in its own
  // try/catch rather than left to `runStage`'s normal propagate-and-crash-
  // the-whole-tick behavior: on failure, this tick sends zero rule-driven
  // reminders (fail safe -- logged, never guessed), but scheduled
  // broadcasts / due jobs / recurring-rule dispatch still run normally.
  // This does NOT affect the dedicated once-a-minute worker
  // (`scheduledWorker.ts`) either way -- it has the exact same isolation
  // for its own rule-config-dependent phase, see that module's own
  // docstring.
  let ruleConfig: NotificationRuleConfig = { systemRules: new Map(), customWeeklyRules: [] };
  let remindersSummary: RemindersSummary = EMPTY_REMINDERS_SUMMARY;
  try {
    ruleConfig = await runStage("rule_config", () => loadNotificationRuleConfig());
    remindersSummary = await runStage("reminders", () =>
      runReminders({
        events,
        people,
        shiftSchedule,
        week,
        now,
        persist,
        recipientResolution,
        ruleConfig,
        operationalMode: operationalMode.kind,
        emergencyAssignments,
      }),
    );
  } catch (error) {
    const stage = error instanceof WorkerStageError ? error.stage : "rule_config";
    const cause = error instanceof WorkerStageError ? error.cause : error;
    console.error(formatWorkerErrorLog(stage, sanitizeWorkerError(cause)));
  }

  let scheduledBroadcastsDue: number;
  let scheduledBroadcastsDispatched = 0;
  let scheduledBroadcastsFailed = 0;
  let recurringRulesDispatched = 0;
  let recurringRulesFailed = 0;
  if (persist) {
    // Runs BEFORE delivery so a scheduled broadcast's freshly-created
    // `notification_jobs` rows are eligible for `runDelivery()`'s own
    // claim in THIS same tick, rather than waiting a further cadence
    // period. See this function's own docstring for why this fallback
    // phase exists alongside the dedicated once-a-minute worker.
    const scheduledResult = await runStage("scheduled_broadcasts", () =>
      runDueScheduledBroadcastDispatch(people),
    );
    scheduledBroadcastsDue = scheduledResult.claimed;
    scheduledBroadcastsDispatched = scheduledResult.dispatched;
    scheduledBroadcastsFailed = scheduledResult.failed;

    // Same deliberate FALLBACK reasoning as scheduled-broadcast dispatch
    // above: `scheduledWorker.ts`'s once-a-minute worker is the PRIMARY
    // owner of custom weekly recurring rule dispatch, but if its Cron job
    // is ever missing/disabled/broken, this 5-minute tick still dispatches
    // due occurrences rather than a recurring rule silently never firing.
    // Reuses THIS tick's own already-fetched `people` and `ruleConfig` --
    // never a second read of either. Isolated in its OWN stage so a
    // failure here is diagnosable without being confused for a reminder-
    // engine failure.
    const recurringDue = await runStage("recurring_rules_due_lookup", () =>
      findDueCustomWeeklyOccurrences(ruleConfig.customWeeklyRules, now),
    );
    const recurringResult = await runStage("recurring_rules", () => runDueCustomWeeklyRuleDispatch(recurringDue, people));
    recurringRulesDispatched = recurringResult.dispatched;
    recurringRulesFailed = recurringResult.failed;
  } else {
    scheduledBroadcastsDue = await runStage("scheduled_broadcasts_due_lookup", () =>
      peekDueManagerScheduledBroadcastsCount(),
    );
  }

  let deliverySummary: DeliverySummary | null = null;
  let jobsDue: number;
  if (persist) {
    deliverySummary = await runStage("delivery", () => runDelivery());
    jobsDue = deliverySummary.jobsClaimed;
  } else {
    jobsDue = await runStage("jobs_due_lookup", () => peekDueJobsCount());
  }

  const durationMs = Math.round(performance.now() - startedAt);

  const summary: WorkerTickSummary = {
    mode,
    currentWeek: week.weekStart,
    baselineAction: changeSummary.baselineAction,
    baselineInitialized: changeSummary.baselineAction === "initialized",
    semanticChangesDetected: changeSummary.semanticChangesDetected,
    pendingChanges: changeSummary.pendingChangesOpen,
    jobsCreated:
      changeSummary.jobsCreated +
      remindersSummary.tomorrowShiftJobs +
      remindersSummary.tomorrowDutyJobs +
      remindersSummary.tomorrowLogisticsWithdrawalJobs +
      remindersSummary.tomorrowLogisticsWithdrawalSupervisorJobs +
      remindersSummary.logisticsWithdrawalNoonAssignedJobs +
      remindersSummary.logisticsWithdrawalNoonSupervisorJobs +
      remindersSummary.logisticsWithdrawalNoonTeamJobs +
      remindersSummary.almashCheckInJobs +
      remindersSummary.constraintsJobs,
    jobsDue,
    scheduledBroadcastsDue,
    scheduledBroadcastsDispatched,
    scheduledBroadcastsFailed,
    recurringRulesDispatched,
    recurringRulesFailed,
    recipientCount: recipientResolution.resolved.size,
    recipientsUnmapped: recipientResolution.unmappedCount,
    recipientsAmbiguous: recipientResolution.ambiguousEmailCount,
    recipientsNoEmail: recipientResolution.noEmailCount,
    durationMs,
  };

  logWorkerTick(summary, deliverySummary);

  return { status: "ok", summary };
}

/**
 * PII-safe aggregate/technical logging only (PR #30 spec section 25):
 * counts and durations, never a name, email, endpoint, key, or full
 * notification body.
 */
function logWorkerTick(summary: WorkerTickSummary, delivery: DeliverySummary | null): void {
  console.log(
    `[notifications] tick complete mode=${summary.mode} week=${summary.currentWeek} baseline=${summary.baselineAction} ` +
      `changes=${summary.semanticChangesDetected} pending=${summary.pendingChanges} jobsCreated=${summary.jobsCreated} ` +
      `jobsDue=${summary.jobsDue} scheduledBroadcastsDue=${summary.scheduledBroadcastsDue} ` +
      `scheduledBroadcastsDispatched=${summary.scheduledBroadcastsDispatched} scheduledBroadcastsFailed=${summary.scheduledBroadcastsFailed} ` +
      `recurringRulesDispatched=${summary.recurringRulesDispatched} recurringRulesFailed=${summary.recurringRulesFailed} ` +
      `recipients=${summary.recipientCount} unmapped=${summary.recipientsUnmapped} ` +
      `ambiguous=${summary.recipientsAmbiguous} noEmail=${summary.recipientsNoEmail} duration=${summary.durationMs}ms`,
  );

  if (delivery) {
    console.log(
      `[notifications] delivery succeeded=${delivery.deliveriesSucceeded} failedPermanent=${delivery.deliveriesFailedPermanent} ` +
        `failedTransient=${delivery.deliveriesFailedTransient} subscriptionsRemoved=${delivery.subscriptionsRemoved} ` +
        `jobsCompleted=${delivery.jobsCompleted} jobsFailed=${delivery.jobsFailed} jobsSkipped=${delivery.jobsSkipped} jobsPending=${delivery.jobsPending}`,
    );
  }
}
