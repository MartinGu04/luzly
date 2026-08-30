import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the main 5-minute worker's FALLBACK role in
 * scheduled-broadcast dispatch (spec revision: the dedicated once-a-minute
 * worker -- `scheduledWorker.ts` / `POST /internal/notifications/scheduled`
 * -- is the PRIMARY, minute-precision owner, but that worker's Cron job is
 * configured manually outside this repository; if it's ever missing,
 * disabled, or temporarily broken, this main tick must still dispatch due
 * schedules every 5 minutes rather than silently stopping scheduled-
 * broadcast delivery altogether). This file previously asserted the
 * OPPOSITE (that the main tick never touches scheduled broadcasts at all)
 * under an earlier "single ownership" design that was reverted -- see
 * `pipeline.ts`'s own docstring for why overlapping workers remain safe
 * (the uniform claimed_at-vs-lease claim is the concurrency boundary, not
 * which worker happens to run it).
 */

const fetchFreshWorkbookRead = vi.fn();
const resolveNotificationRecipients = vi.fn();
const runChangeDetection = vi.fn();
const runReminders = vi.fn();
const runDueScheduledBroadcastDispatch = vi.fn();
const runDelivery = vi.fn();
const peekDueJobsCount = vi.fn();
const peekDueManagerScheduledBroadcastsCount = vi.fn();
const loadNotificationRuleConfig = vi.fn();
const findDueCustomWeeklyOccurrences = vi.fn();
const runDueCustomWeeklyRuleDispatch = vi.fn();
const resolveOperationalMode = vi.fn();
const resolveOperationalRoster = vi.fn();
const peekLastOperationalGeneration = vi.fn();
const setLastOperationalGeneration = vi.fn();
const runWeaponQualificationCheck = vi.fn();

vi.mock("./freshRead", () => ({ fetchFreshWorkbookRead: (...args: unknown[]) => fetchFreshWorkbookRead(...args) }));
vi.mock("./recipients", () => ({ resolveNotificationRecipients: (...args: unknown[]) => resolveNotificationRecipients(...args) }));
vi.mock("./changeDetection", () => ({ runChangeDetection: (...args: unknown[]) => runChangeDetection(...args) }));
vi.mock("./reminders", () => ({ runReminders: (...args: unknown[]) => runReminders(...args) }));
vi.mock("./scheduledBroadcast", () => ({
  runDueScheduledBroadcastDispatch: (...args: unknown[]) => runDueScheduledBroadcastDispatch(...args),
}));
vi.mock("./delivery", () => ({ runDelivery: (...args: unknown[]) => runDelivery(...args) }));
vi.mock("./ruleConfig", () => ({ loadNotificationRuleConfig: (...args: unknown[]) => loadNotificationRuleConfig(...args) }));
vi.mock("./recurringRuleDispatch", () => ({
  findDueCustomWeeklyOccurrences: (...args: unknown[]) => findDueCustomWeeklyOccurrences(...args),
  runDueCustomWeeklyRuleDispatch: (...args: unknown[]) => runDueCustomWeeklyRuleDispatch(...args),
}));
vi.mock("./store", () => ({
  peekDueJobsCount: (...args: unknown[]) => peekDueJobsCount(...args),
  peekDueManagerScheduledBroadcastsCount: (...args: unknown[]) => peekDueManagerScheduledBroadcastsCount(...args),
  peekLastOperationalGeneration: (...args: unknown[]) => peekLastOperationalGeneration(...args),
  setLastOperationalGeneration: (...args: unknown[]) => setLastOperationalGeneration(...args),
}));
vi.mock("@/lib/emergencyMode/state", () => ({ resolveOperationalMode: (...args: unknown[]) => resolveOperationalMode(...args) }));
vi.mock("@/lib/readModels/operationalMode", () => ({ resolveOperationalRoster: (...args: unknown[]) => resolveOperationalRoster(...args) }));
vi.mock("./weaponQualification", () => ({
  runWeaponQualificationCheck: (...args: unknown[]) => runWeaponQualificationCheck(...args),
}));

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
  constraintsCancelled: 0,
};

function setupHappyDefaults() {
  fetchFreshWorkbookRead.mockResolvedValue({
    status: "ok",
    read: { people: PEOPLE, events: [], shiftSchedule: {} },
  });
  resolveNotificationRecipients.mockResolvedValue({ resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 });
  resolveOperationalMode.mockResolvedValue({ kind: "regular" });
  resolveOperationalRoster.mockResolvedValue({ mode: "regular" });
  peekLastOperationalGeneration.mockResolvedValue("regular");
  setLastOperationalGeneration.mockResolvedValue(undefined);
  runChangeDetection.mockResolvedValue({ baselineAction: "unchanged", semanticChangesDetected: 0, pendingChangesOpen: 0, jobsCreated: 0 });
  runReminders.mockResolvedValue(ZERO_REMINDERS_SUMMARY);
  loadNotificationRuleConfig.mockResolvedValue({ systemRules: new Map(), customWeeklyRules: [] });
  findDueCustomWeeklyOccurrences.mockResolvedValue([]);
  runDueCustomWeeklyRuleDispatch.mockResolvedValue({ dispatched: 0, failed: 0 });
  runDueScheduledBroadcastDispatch.mockResolvedValue({ claimed: 0, dispatched: 0, failed: 0 });
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
  runWeaponQualificationCheck.mockResolvedValue({ issuesDetected: 0, jobsCreated: 0 });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("runNotificationWorkerTick -- scheduled-broadcast fallback phase wiring", () => {
  it("in 'send' mode, dispatches due scheduled broadcasts using THIS tick's own already-fetched roster, before delivery runs", async () => {
    setupHappyDefaults();
    const callOrder: string[] = [];
    runDueScheduledBroadcastDispatch.mockImplementation(async () => {
      callOrder.push("scheduled_broadcasts");
      return { claimed: 2, dispatched: 1, failed: 1 };
    });
    runDelivery.mockImplementation(async () => {
      callOrder.push("delivery");
      return {
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
    });

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("send");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary.scheduledBroadcastsDue).toBe(2);
    expect(result.summary.scheduledBroadcastsDispatched).toBe(1);
    expect(result.summary.scheduledBroadcastsFailed).toBe(1);
    expect(runDueScheduledBroadcastDispatch).toHaveBeenCalledWith(PEOPLE);
    expect(peekDueManagerScheduledBroadcastsCount).not.toHaveBeenCalled();
    expect(callOrder).toEqual(["scheduled_broadcasts", "delivery"]);
  });

  it("in 'dry_run' mode, only PEEKS the due count -- never claims/dispatches anything", async () => {
    setupHappyDefaults();
    peekDueManagerScheduledBroadcastsCount.mockResolvedValue(3);
    peekDueJobsCount.mockResolvedValue(0);

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("dry_run");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary.scheduledBroadcastsDue).toBe(3);
    expect(result.summary.scheduledBroadcastsDispatched).toBe(0);
    expect(result.summary.scheduledBroadcastsFailed).toBe(0);
    expect(runDueScheduledBroadcastDispatch).not.toHaveBeenCalled();
    expect(runDelivery).not.toHaveBeenCalled();
  });

  it("this main tick's own fallback dispatch reuses the EXACT SAME runDueScheduledBroadcastDispatch the dedicated worker uses -- never a second/duplicated dispatch implementation", async () => {
    setupHappyDefaults();

    const { runNotificationWorkerTick } = await loadModule();
    await runNotificationWorkerTick("send");

    expect(runDueScheduledBroadcastDispatch).toHaveBeenCalledTimes(1);
  });
});

describe("runNotificationWorkerTick -- custom weekly recurring rule fallback phase wiring", () => {
  it("in 'send' mode, dispatches due recurring-rule occurrences using THIS tick's own already-loaded rule config and roster, before delivery runs", async () => {
    setupHappyDefaults();
    const rule = { id: "rule-1", enabled: true, weekday: 6, localHour: 21, localMinute: 0, title: "t", body: "b", audienceKind: "everyone", targetPersonIds: [], createdByPersonId: null, createdByPersonName: null };
    loadNotificationRuleConfig.mockResolvedValue({ systemRules: new Map(), customWeeklyRules: [rule] });
    const occurrence = { ruleId: rule.id, occurrenceDate: "2026-08-22" };
    findDueCustomWeeklyOccurrences.mockResolvedValue([occurrence]);

    const callOrder: string[] = [];
    runDueCustomWeeklyRuleDispatch.mockImplementation(async () => {
      callOrder.push("recurring_rules");
      return { dispatched: 1, failed: 0 };
    });
    runDelivery.mockImplementation(async () => {
      callOrder.push("delivery");
      return {
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
    });

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("send");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary.recurringRulesDispatched).toBe(1);
    expect(result.summary.recurringRulesFailed).toBe(0);
    expect(findDueCustomWeeklyOccurrences).toHaveBeenCalledWith([rule], expect.anything());
    expect(runDueCustomWeeklyRuleDispatch).toHaveBeenCalledWith([occurrence], PEOPLE);
    expect(callOrder).toEqual(["recurring_rules", "delivery"]);
  });

  it("in 'dry_run' mode, never looks up or dispatches recurring-rule occurrences", async () => {
    setupHappyDefaults();

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("dry_run");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.summary.recurringRulesDispatched).toBe(0);
    expect(findDueCustomWeeklyOccurrences).not.toHaveBeenCalled();
    expect(runDueCustomWeeklyRuleDispatch).not.toHaveBeenCalled();
  });

  it("a rule-config load failure never blocks scheduled-broadcast dispatch or delivery -- isolated, fail-safe, logged", async () => {
    setupHappyDefaults();
    loadNotificationRuleConfig.mockRejectedValue(new Error("boom"));
    runDueScheduledBroadcastDispatch.mockResolvedValue({ claimed: 1, dispatched: 1, failed: 0 });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { runNotificationWorkerTick } = await loadModule();
    const result = await runNotificationWorkerTick("send");

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Reminders never even attempted once rule config failed to load.
    expect(runReminders).not.toHaveBeenCalled();
    // But scheduled-broadcast dispatch and delivery still ran normally.
    expect(runDueScheduledBroadcastDispatch).toHaveBeenCalledTimes(1);
    expect(result.summary.scheduledBroadcastsDispatched).toBe(1);
    expect(runDelivery).toHaveBeenCalledTimes(1);
    // No due recurring occurrences either (an empty fallback config), never a crash.
    expect(result.summary.recurringRulesDispatched).toBe(0);
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
