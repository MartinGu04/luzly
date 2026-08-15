import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClaimedNotificationJob } from "./store";

const store = {
  claimDueNotificationJobs: vi.fn<() => Promise<ClaimedNotificationJob[]>>(),
  getActiveSubscriptionsForUser: vi.fn(),
  ensureDeliveryRows: vi.fn(async () => {}),
  getDeliveriesForJob: vi.fn(),
  updateDeliveryOutcome: vi.fn(async () => {}),
  incrementDeliveryAttempts: vi.fn(async () => {}),
  deletePushSubscriptionById: vi.fn(async () => {}),
  setJobStatus: vi.fn(async () => {}),
};

const sendPush = vi.fn();

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule() {
  vi.doMock("./store", () => store);
  vi.doMock("@/lib/push/sendPush", () => ({ sendPush }));
  return import("./delivery");
}

function job(overrides: Partial<ClaimedNotificationJob> = {}): ClaimedNotificationJob {
  return {
    id: "job-1",
    category: "shift_change",
    recipientUserId: "user-1",
    title: "t",
    body: "b",
    path: "/schedule",
    tag: null,
    attempts: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

describe("runDelivery -- multi-device fan-out", () => {
  it("sends to both of a user's active subscriptions and completes the job when both succeed", async () => {
    store.claimDueNotificationJobs.mockResolvedValue([job()]);
    store.getActiveSubscriptionsForUser.mockResolvedValue([
      { id: "sub-1", endpoint: "e1", p256dh: "k1", auth: "a1" },
      { id: "sub-2", endpoint: "e2", p256dh: "k2", auth: "a2" },
    ]);
    store.getDeliveriesForJob
      .mockResolvedValueOnce([
        { id: "d1", pushSubscriptionId: "sub-1", status: "pending", attempts: 0 },
        { id: "d2", pushSubscriptionId: "sub-2", status: "pending", attempts: 0 },
      ])
      .mockResolvedValueOnce([
        { id: "d1", pushSubscriptionId: "sub-1", status: "sent", attempts: 1 },
        { id: "d2", pushSubscriptionId: "sub-2", status: "sent", attempts: 1 },
      ]);
    sendPush.mockResolvedValue({ ok: true });

    const { runDelivery } = await loadModule();
    const summary = await runDelivery();

    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(summary.deliveriesSucceeded).toBe(2);
    expect(summary.jobsCompleted).toBe(1);
    expect(store.setJobStatus).toHaveBeenCalledWith("job-1", "completed", undefined);
  });

  it("a device that already succeeded is never re-attempted", async () => {
    store.claimDueNotificationJobs.mockResolvedValue([job()]);
    store.getActiveSubscriptionsForUser.mockResolvedValue([
      { id: "sub-1", endpoint: "e1", p256dh: "k1", auth: "a1" },
      { id: "sub-2", endpoint: "e2", p256dh: "k2", auth: "a2" },
    ]);
    store.getDeliveriesForJob
      .mockResolvedValueOnce([
        { id: "d1", pushSubscriptionId: "sub-1", status: "sent", attempts: 1 },
        { id: "d2", pushSubscriptionId: "sub-2", status: "pending", attempts: 0 },
      ])
      .mockResolvedValueOnce([
        { id: "d1", pushSubscriptionId: "sub-1", status: "sent", attempts: 1 },
        { id: "d2", pushSubscriptionId: "sub-2", status: "sent", attempts: 1 },
      ]);
    sendPush.mockResolvedValue({ ok: true });

    const { runDelivery } = await loadModule();
    await runDelivery();

    expect(sendPush).toHaveBeenCalledTimes(1);
  });

  it("a permanent failure on one device deletes only that subscription; a succeeding sibling device still completes the job", async () => {
    store.claimDueNotificationJobs.mockResolvedValue([job()]);
    store.getActiveSubscriptionsForUser.mockResolvedValue([
      { id: "sub-1", endpoint: "e1", p256dh: "k1", auth: "a1" },
      { id: "sub-2", endpoint: "e2", p256dh: "k2", auth: "a2" },
    ]);
    store.getDeliveriesForJob
      .mockResolvedValueOnce([
        { id: "d1", pushSubscriptionId: "sub-1", status: "pending", attempts: 0 },
        { id: "d2", pushSubscriptionId: "sub-2", status: "pending", attempts: 0 },
      ])
      .mockResolvedValueOnce([
        { id: "d1", pushSubscriptionId: "sub-1", status: "failed_permanent", attempts: 1 },
        { id: "d2", pushSubscriptionId: "sub-2", status: "sent", attempts: 1 },
      ]);
    sendPush
      .mockResolvedValueOnce({ ok: false, permanent: true, statusCode: 410, message: "gone" })
      .mockResolvedValueOnce({ ok: true });

    const { runDelivery } = await loadModule();
    const summary = await runDelivery();

    expect(store.deletePushSubscriptionById).toHaveBeenCalledTimes(1);
    expect(store.deletePushSubscriptionById).toHaveBeenCalledWith("sub-1");
    expect(summary.subscriptionsRemoved).toBe(1);
    expect(summary.jobsCompleted).toBe(1);
    expect(store.setJobStatus).toHaveBeenCalledWith("job-1", "completed", undefined);
  });

  it("a transient failure never deletes the subscription and leaves the job pending for retry", async () => {
    store.claimDueNotificationJobs.mockResolvedValue([job({ attempts: 1, maxAttempts: 5 })]);
    store.getActiveSubscriptionsForUser.mockResolvedValue([{ id: "sub-1", endpoint: "e1", p256dh: "k1", auth: "a1" }]);
    store.getDeliveriesForJob
      .mockResolvedValueOnce([{ id: "d1", pushSubscriptionId: "sub-1", status: "pending", attempts: 0 }])
      .mockResolvedValueOnce([{ id: "d1", pushSubscriptionId: "sub-1", status: "failed_transient", attempts: 1 }]);
    sendPush.mockResolvedValue({ ok: false, permanent: false, message: "timeout" });

    const { runDelivery } = await loadModule();
    const summary = await runDelivery();

    expect(store.deletePushSubscriptionById).not.toHaveBeenCalled();
    expect(summary.jobsPending).toBe(1);
    expect(store.setJobStatus).toHaveBeenCalledWith("job-1", "pending");
  });

  it("bounds retries: once the job's own attempts reach max_attempts, a still-transiently-failing job is marked failed, not retried forever", async () => {
    store.claimDueNotificationJobs.mockResolvedValue([job({ attempts: 5, maxAttempts: 5 })]);
    store.getActiveSubscriptionsForUser.mockResolvedValue([{ id: "sub-1", endpoint: "e1", p256dh: "k1", auth: "a1" }]);
    store.getDeliveriesForJob
      .mockResolvedValueOnce([{ id: "d1", pushSubscriptionId: "sub-1", status: "pending", attempts: 4 }])
      .mockResolvedValueOnce([{ id: "d1", pushSubscriptionId: "sub-1", status: "failed_transient", attempts: 5 }]);
    sendPush.mockResolvedValue({ ok: false, permanent: false, message: "timeout" });

    const { runDelivery } = await loadModule();
    const summary = await runDelivery();

    expect(store.deletePushSubscriptionById).not.toHaveBeenCalled();
    expect(summary.jobsFailed).toBe(1);
    expect(store.setJobStatus).toHaveBeenCalledWith("job-1", "failed", "Exceeded max retry attempts.");
  });

  it("a recipient with zero active subscriptions is skipped without attempting a send", async () => {
    store.claimDueNotificationJobs.mockResolvedValue([job()]);
    store.getActiveSubscriptionsForUser.mockResolvedValue([]);

    const { runDelivery } = await loadModule();
    const summary = await runDelivery();

    expect(sendPush).not.toHaveBeenCalled();
    expect(summary.jobsSkipped).toBe(1);
    expect(store.setJobStatus).toHaveBeenCalledWith("job-1", "skipped");
  });
});
