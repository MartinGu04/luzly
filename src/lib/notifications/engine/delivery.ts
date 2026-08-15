import "server-only";
import { buildNotificationPayload } from "@/lib/push/payload";
import { sendPush } from "@/lib/push/sendPush";
import {
  claimDueNotificationJobs,
  deletePushSubscriptionById,
  ensureDeliveryRows,
  getActiveSubscriptionsForUser,
  getDeliveriesForJob,
  incrementDeliveryAttempts,
  setJobStatus,
  updateDeliveryOutcome,
  type ClaimedNotificationJob,
} from "./store";

export interface DeliverySummary {
  jobsClaimed: number;
  jobsCompleted: number;
  jobsFailed: number;
  jobsPending: number;
  jobsSkipped: number;
  deliveriesSucceeded: number;
  deliveriesFailedPermanent: number;
  deliveriesFailedTransient: number;
  subscriptionsRemoved: number;
}

interface JobOutcome {
  succeeded: number;
  failedPermanent: number;
  failedTransient: number;
  subscriptionsRemoved: number;
  finalStatus: "completed" | "failed" | "pending" | "skipped";
}

/**
 * Phases 11-16 of the worker pipeline (PR #30 spec section 23): claims
 * due outbox jobs (atomically, via `claim_due_notification_jobs` --
 * concurrency-safe, see the migration comment), resolves each
 * recipient's currently active devices, sends through PR #29's real
 * `sendPush`/`buildNotificationPayload` pipeline (never a hand-built
 * payload), and reconciles per-device delivery state so a device that
 * already succeeded is never re-sent and a permanently-dead subscription
 * is cleaned up without affecting any other device's outcome.
 */
export async function runDelivery(limit = 200): Promise<DeliverySummary> {
  const jobs = await claimDueNotificationJobs(limit);

  const summary: DeliverySummary = {
    jobsClaimed: jobs.length,
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsPending: 0,
    jobsSkipped: 0,
    deliveriesSucceeded: 0,
    deliveriesFailedPermanent: 0,
    deliveriesFailedTransient: 0,
    subscriptionsRemoved: 0,
  };

  for (const job of jobs) {
    const outcome = await processJob(job);
    summary.deliveriesSucceeded += outcome.succeeded;
    summary.deliveriesFailedPermanent += outcome.failedPermanent;
    summary.deliveriesFailedTransient += outcome.failedTransient;
    summary.subscriptionsRemoved += outcome.subscriptionsRemoved;

    if (outcome.finalStatus === "completed") summary.jobsCompleted++;
    else if (outcome.finalStatus === "failed") summary.jobsFailed++;
    else if (outcome.finalStatus === "skipped") summary.jobsSkipped++;
    else summary.jobsPending++;
  }

  return summary;
}

async function processJob(job: ClaimedNotificationJob): Promise<JobOutcome> {
  const subscriptions = await getActiveSubscriptionsForUser(job.recipientUserId);

  if (subscriptions.length === 0) {
    await setJobStatus(job.id, "skipped");
    return { succeeded: 0, failedPermanent: 0, failedTransient: 0, subscriptionsRemoved: 0, finalStatus: "skipped" };
  }

  await ensureDeliveryRows(
    job.id,
    subscriptions.map((subscription) => subscription.id),
  );
  const deliveries = await getDeliveriesForJob(job.id);
  const subscriptionById = new Map(subscriptions.map((subscription) => [subscription.id, subscription]));

  const payload = buildNotificationPayload({
    title: job.title,
    body: job.body,
    path: job.path,
    tag: job.tag ?? undefined,
  });

  let succeeded = 0;
  let failedPermanent = 0;
  let failedTransient = 0;
  let subscriptionsRemoved = 0;

  for (const delivery of deliveries) {
    // Terminal states are never retried: a device that already got the
    // notification must never receive it twice just because another
    // device on the same job is still failing transiently.
    if (delivery.status === "sent" || delivery.status === "failed_permanent") continue;

    const subscription = subscriptionById.get(delivery.pushSubscriptionId);
    if (!subscription) continue;

    await incrementDeliveryAttempts(delivery.id, delivery.attempts);
    const result = await sendPush(
      { endpoint: subscription.endpoint, p256dh: subscription.p256dh, auth: subscription.auth },
      payload,
    );

    if (result.ok) {
      await updateDeliveryOutcome(delivery.id, "sent");
      succeeded++;
    } else if (result.permanent) {
      // Reuses PR #29's exact permanent-failure classification and
      // cleanup behavior (404/410 -> delete the stale subscription).
      await updateDeliveryOutcome(delivery.id, "failed_permanent", result.message);
      await deletePushSubscriptionById(subscription.id);
      failedPermanent++;
      subscriptionsRemoved++;
    } else {
      // Never deletes the subscription for a transient/network/429/5xx
      // failure -- it may succeed on a later tick.
      await updateDeliveryOutcome(delivery.id, "failed_transient", result.message);
      failedTransient++;
    }
  }

  const finalDeliveries = await getDeliveriesForJob(job.id);
  const anySucceeded = finalDeliveries.some((delivery) => delivery.status === "sent");
  const anyOutstanding = finalDeliveries.some(
    (delivery) => delivery.status === "pending" || delivery.status === "failed_transient",
  );

  // Retries are bounded at the JOB level (attempts vs. max_attempts,
  // claimed atomically by `claim_due_notification_jobs`) rather than
  // retrying forever -- spec section 21: "bound retries... do not retry
  // forever". A job is only left `pending` (for the next tick to retry
  // its still-outstanding devices) while outstanding work remains AND
  // the job hasn't exhausted its own attempt budget.
  if (!anyOutstanding || job.attempts >= job.maxAttempts) {
    const finalStatus = anySucceeded ? "completed" : "failed";
    await setJobStatus(job.id, finalStatus, anyOutstanding ? "Exceeded max retry attempts." : undefined);
    return { succeeded, failedPermanent, failedTransient, subscriptionsRemoved, finalStatus };
  }

  await setJobStatus(job.id, "pending");
  return { succeeded, failedPermanent, failedTransient, subscriptionsRemoved, finalStatus: "pending" };
}
