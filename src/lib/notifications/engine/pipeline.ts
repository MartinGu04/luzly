import "server-only";
import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import { getJerusalemLocalNow } from "@/lib/time/jerusalemClock";
import { fetchFreshWorkbookRead } from "./freshRead";
import { resolveNotificationRecipients } from "./recipients";
import { runChangeDetection } from "./changeDetection";
import { runReminders } from "./reminders";
import { runDelivery, type DeliverySummary } from "./delivery";
import { peekDueJobsCount } from "./store";
import { runStage } from "./workerErrors";

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
  recipientCount: number;
  recipientsUnmapped: number;
  recipientsAmbiguous: number;
  recipientsNoEmail: number;
  durationMs: number;
}

export type WorkerTickResult =
  | { status: "ok"; summary: WorkerTickSummary }
  | { status: "configuration_error"; message: string };

/**
 * The top-level orchestrator for `POST /internal/notifications/tick`
 * (see PR #30 spec section 23's 17-phase pipeline). `mode: "dry_run"`
 * computes and returns the exact same summary shape as `"send"` but
 * skips every mutating store call and the delivery phase entirely --
 * spec section 24: "SEND NO PUSH". `mode: "send"` is the real path:
 * persists baseline/observed/pending-change/job state and actually
 * delivers through PR #29's push pipeline.
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

  const changeSummary = await runStage("change_detection", () =>
    runChangeDetection({
      events,
      people,
      shiftSchedule,
      week,
      persist,
      recipientResolution,
      personNameById,
    }),
  );

  const remindersSummary = await runStage("reminders", () =>
    runReminders({
      events,
      shiftSchedule,
      week,
      now,
      persist,
      recipientResolution,
    }),
  );

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
      remindersSummary.constraintsJobs,
    jobsDue,
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
      `jobsDue=${summary.jobsDue} recipients=${summary.recipientCount} unmapped=${summary.recipientsUnmapped} ` +
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
