import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the minute-level-precision follow-up's single-
 * ownership decision (spec section 5): scheduled-broadcast dispatch is now
 * owned SOLELY by the dedicated worker (`scheduledWorker.ts` /
 * `POST /internal/notifications/scheduled`), never by the main 5-minute
 * tick. This file used to test the OPPOSITE -- that `runNotificationWorkerTick`
 * dispatched scheduled broadcasts itself -- see `scheduledWorker.test.ts`
 * for that behavior's new home. Kept as its own file (rather than folded
 * into a general pipeline test) specifically so this "no scheduled-
 * broadcast wiring here" invariant stays easy to find and can't quietly
 * regress if `pipeline.ts` grows a second owner again.
 */

const fetchFreshWorkbookRead = vi.fn();
const resolveNotificationRecipients = vi.fn();
const runChangeDetection = vi.fn();
const runReminders = vi.fn();
const runDelivery = vi.fn();
const peekDueJobsCount = vi.fn();

vi.mock("./freshRead", () => ({ fetchFreshWorkbookRead: (...args: unknown[]) => fetchFreshWorkbookRead(...args) }));
vi.mock("./recipients", () => ({ resolveNotificationRecipients: (...args: unknown[]) => resolveNotificationRecipients(...args) }));
vi.mock("./changeDetection", () => ({ runChangeDetection: (...args: unknown[]) => runChangeDetection(...args) }));
vi.mock("./reminders", () => ({ runReminders: (...args: unknown[]) => runReminders(...args) }));
vi.mock("./delivery", () => ({ runDelivery: (...args: unknown[]) => runDelivery(...args) }));
vi.mock("./store", () => ({ peekDueJobsCount: (...args: unknown[]) => peekDueJobsCount(...args) }));

// Deliberately no mock for "./scheduledBroadcast" -- if `pipeline.ts` ever
// imports it again, the real module loads (server-only, real Supabase
// client construction) and the test below fails loudly rather than
// silently mocking the regression away.

async function loadModule() {
  return import("./pipeline");
}

const PEOPLE = [{ id: "p_1", name: "אחד", email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null }];

const ZERO_REMINDERS_SUMMARY = {
  tomorrowShiftJobs: 0,
  tomorrowDutyJobs: 0,
  tomorrowLogisticsWithdrawalJobs: 0,
  tomorrowLogisticsWithdrawalSupervisorJobs: 0,
  logisticsWithdrawalNoonAssignedJobs: 0,
  logisticsWithdrawalNoonSupervisorJobs: 0,
  logisticsWithdrawalNoonTeamJobs: 0,
  almashCheckInJobs: 0,
  constraintsJobs: 0,
};

function setupHappyDefaults() {
  fetchFreshWorkbookRead.mockResolvedValue({
    status: "ok",
    read: { people: PEOPLE, events: [], shiftSchedule: {} },
  });
  resolveNotificationRecipients.mockResolvedValue({ resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 });
  runChangeDetection.mockResolvedValue({ baselineAction: "unchanged", semanticChangesDetected: 0, pendingChangesOpen: 0, jobsCreated: 0 });
  runReminders.mockResolvedValue(ZERO_REMINDERS_SUMMARY);
  runDelivery.mockResolvedValue({
    jobsClaimed: 0,
    deliveriesSucceeded: 0,
    deliveriesFailedPermanent: 0,
    deliveriesFailedTransient: 0,
    subscriptionsRemoved: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsSkipped: 0,
    jobsPending: 0,
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("runNotificationWorkerTick -- scheduled broadcasts are no longer this tick's concern", () => {
  it("in 'send' mode, the summary carries no scheduled-broadcast fields at all", async () => {
    setupHappyDefaults();

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("send");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary).not.toHaveProperty("scheduledBroadcastsDue");
    expect(result.summary).not.toHaveProperty("scheduledBroadcastsDispatched");
    expect(result.summary).not.toHaveProperty("scheduledBroadcastsFailed");
  });

  it("in 'dry_run' mode, the summary also carries no scheduled-broadcast fields", async () => {
    setupHappyDefaults();
    peekDueJobsCount.mockResolvedValue(0);

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("dry_run");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary).not.toHaveProperty("scheduledBroadcastsDue");
    expect(result.summary).not.toHaveProperty("scheduledBroadcastsDispatched");
    expect(result.summary).not.toHaveProperty("scheduledBroadcastsFailed");
  });

  it("'send' mode still only calls delivery once, and jobsDue reflects runDelivery's own claim count (unrelated to any scheduled-broadcast phase)", async () => {
    setupHappyDefaults();
    runDelivery.mockResolvedValue({
      jobsClaimed: 5,
      deliveriesSucceeded: 0,
      deliveriesFailedPermanent: 0,
      deliveriesFailedTransient: 0,
      subscriptionsRemoved: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      jobsSkipped: 0,
      jobsPending: 0,
    });

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("send");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(runDelivery).toHaveBeenCalledTimes(1);
    expect(result.summary.jobsDue).toBe(5);
  });
});
