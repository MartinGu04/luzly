import { afterEach, describe, expect, it, vi } from "vitest";

const peekAnyManagerScheduledBroadcastWorkDue = vi.fn();
const peekDueJobsCount = vi.fn();
const fetchFreshPersonnelRead = vi.fn();
const runDueScheduledBroadcastDispatch = vi.fn();
const runDelivery = vi.fn();

vi.mock("./store", () => ({
  peekAnyManagerScheduledBroadcastWorkDue: (...args: unknown[]) => peekAnyManagerScheduledBroadcastWorkDue(...args),
  peekDueJobsCount: (...args: unknown[]) => peekDueJobsCount(...args),
}));
vi.mock("./freshRead", () => ({
  fetchFreshPersonnelRead: (...args: unknown[]) => fetchFreshPersonnelRead(...args),
}));
vi.mock("./scheduledBroadcast", () => ({
  runDueScheduledBroadcastDispatch: (...args: unknown[]) => runDueScheduledBroadcastDispatch(...args),
}));
vi.mock("./delivery", () => ({ runDelivery: (...args: unknown[]) => runDelivery(...args) }));

async function loadModule() {
  return import("./scheduledWorker");
}

const PEOPLE = [{ id: "p_1", name: "אחד", email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null }];

const ZERO_DELIVERY_SUMMARY = {
  jobsClaimed: 0,
  deliveriesSucceeded: 0,
  deliveriesFailedPermanent: 0,
  deliveriesFailedTransient: 0,
  subscriptionsRemoved: 0,
  jobsCompleted: 0,
  jobsFailed: 0,
  jobsSkipped: 0,
  jobsPending: 0,
};

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("runScheduledBroadcastWorkerTick -- zero due/recoverable work", () => {
  it("performs NO personnel read, NO dispatch, and NO delivery when BOTH pre-checks find nothing (true no-op)", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(0);
    peekDueJobsCount.mockResolvedValue(0);

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    const summary = await runScheduledBroadcastWorkerTick();

    expect(summary.skipped).toBe(true);
    expect(summary.scheduledBroadcastsDue).toBe(0);
    expect(summary.scheduledBroadcastsDispatched).toBe(0);
    expect(summary.scheduledBroadcastsFailed).toBe(0);
    expect(summary.jobsClaimed).toBe(0);
    expect(fetchFreshPersonnelRead).not.toHaveBeenCalled();
    expect(runDueScheduledBroadcastDispatch).not.toHaveBeenCalled();
    expect(runDelivery).not.toHaveBeenCalled();
  });
});

describe("runScheduledBroadcastWorkerTick -- due/recoverable scheduled broadcast exists", () => {
  it("fetches personnel ONLY (never schedule/settings), dispatches, then runs delivery in the SAME invocation", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(1);
    peekDueJobsCount.mockResolvedValue(0);
    fetchFreshPersonnelRead.mockResolvedValue({ people: PEOPLE, fetchedAt: "2026-08-21T17:32:00.000Z" });

    const callOrder: string[] = [];
    runDueScheduledBroadcastDispatch.mockImplementation(async () => {
      callOrder.push("dispatch");
      return { claimed: 2, dispatched: 1, failed: 1 };
    });
    runDelivery.mockImplementation(async () => {
      callOrder.push("delivery");
      return { ...ZERO_DELIVERY_SUMMARY, jobsClaimed: 4 };
    });

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    const summary = await runScheduledBroadcastWorkerTick();

    expect(fetchFreshPersonnelRead).toHaveBeenCalledTimes(1);
    expect(runDueScheduledBroadcastDispatch).toHaveBeenCalledWith(PEOPLE);
    expect(callOrder).toEqual(["dispatch", "delivery"]);
    expect(summary).toEqual({
      skipped: false,
      scheduledBroadcastsDue: 2,
      scheduledBroadcastsDispatched: 1,
      scheduledBroadcastsFailed: 1,
      jobsClaimed: 4,
      durationMs: expect.any(Number),
    });
  });

  it("never calls runDelivery before dispatch has been claimed -- freshly-created jobs must exist before delivery tries to claim them", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(1);
    peekDueJobsCount.mockResolvedValue(0);
    fetchFreshPersonnelRead.mockResolvedValue({ people: PEOPLE, fetchedAt: "2026-08-21T17:32:00.000Z" });
    runDueScheduledBroadcastDispatch.mockResolvedValue({ claimed: 1, dispatched: 1, failed: 0 });
    runDelivery.mockResolvedValue(ZERO_DELIVERY_SUMMARY);

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    await runScheduledBroadcastWorkerTick();

    const dispatchOrder = runDueScheduledBroadcastDispatch.mock.invocationCallOrder[0];
    const deliveryOrder = runDelivery.mock.invocationCallOrder[0];
    expect(dispatchOrder).toBeLessThan(deliveryOrder);
  });

  it("still fetches personnel/dispatches/delivers even when due notification jobs ALSO exist alongside the scheduled broadcast", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(1);
    peekDueJobsCount.mockResolvedValue(3);
    fetchFreshPersonnelRead.mockResolvedValue({ people: PEOPLE, fetchedAt: "2026-08-21T17:32:00.000Z" });
    runDueScheduledBroadcastDispatch.mockResolvedValue({ claimed: 1, dispatched: 1, failed: 0 });
    runDelivery.mockResolvedValue({ ...ZERO_DELIVERY_SUMMARY, jobsClaimed: 4 });

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    const summary = await runScheduledBroadcastWorkerTick();

    expect(fetchFreshPersonnelRead).toHaveBeenCalledTimes(1);
    expect(runDueScheduledBroadcastDispatch).toHaveBeenCalledTimes(1);
    expect(runDelivery).toHaveBeenCalledTimes(1);
    expect(summary.skipped).toBe(false);
    expect(summary.jobsClaimed).toBe(4);
  });
});

describe("runScheduledBroadcastWorkerTick -- NO scheduled broadcast but due notification jobs exist (stranded-job recovery)", () => {
  it("skips the personnel read and scheduled-broadcast dispatch entirely, and calls runDelivery() directly", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(0);
    peekDueJobsCount.mockResolvedValue(13);
    runDelivery.mockResolvedValue({ ...ZERO_DELIVERY_SUMMARY, jobsClaimed: 13 });

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    const summary = await runScheduledBroadcastWorkerTick();

    expect(fetchFreshPersonnelRead).not.toHaveBeenCalled();
    expect(runDueScheduledBroadcastDispatch).not.toHaveBeenCalled();
    expect(runDelivery).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({
      skipped: false,
      scheduledBroadcastsDue: 0,
      scheduledBroadcastsDispatched: 0,
      scheduledBroadcastsFailed: 0,
      jobsClaimed: 13,
      durationMs: expect.any(Number),
    });
  });
});

describe("runScheduledBroadcastWorkerTick -- concurrency/idempotency assumptions remain delegated", () => {
  it("never claims jobs itself -- delegates entirely to runDelivery()'s own claim_due_notification_jobs call, both in the dispatch path and the stranded-job recovery path", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(0);
    peekDueJobsCount.mockResolvedValue(1);
    runDelivery.mockResolvedValue(ZERO_DELIVERY_SUMMARY);

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    await runScheduledBroadcastWorkerTick();

    // This module holds no claim/lock logic of its own -- `runDelivery()` is
    // the ONLY place a due job is ever claimed, exactly as before this fix.
    expect(runDelivery).toHaveBeenCalledWith();
  });
});

describe("runScheduledBroadcastWorkerTick -- PII-safe summary shape", () => {
  it("the returned summary is counts/booleans/duration only -- no name, email, title, or body field", async () => {
    peekAnyManagerScheduledBroadcastWorkDue.mockResolvedValue(1);
    peekDueJobsCount.mockResolvedValue(0);
    fetchFreshPersonnelRead.mockResolvedValue({ people: PEOPLE, fetchedAt: "2026-08-21T17:32:00.000Z" });
    runDueScheduledBroadcastDispatch.mockResolvedValue({ claimed: 1, dispatched: 1, failed: 0 });
    runDelivery.mockResolvedValue(ZERO_DELIVERY_SUMMARY);

    const { runScheduledBroadcastWorkerTick } = await loadModule();
    const summary = await runScheduledBroadcastWorkerTick();

    for (const value of Object.values(summary)) {
      expect(typeof value === "number" || typeof value === "boolean").toBe(true);
    }
  });
});
