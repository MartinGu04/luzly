import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression guard for the main worker tick's Emergency Mode wiring
 * (spec section 22) -- resolving the operational mode, deciding whether
 * change detection can run this tick (skipped entirely when the
 * emergency workbook itself is unreadable), computing the mode-
 * transition flag, and persisting the new "last observed mode" only in
 * `persist` mode. Mirrors `pipeline.scheduledBroadcasts.test.ts`'s own
 * mocking shape.
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
const peekLastOperationalMode = vi.fn();
const setLastOperationalMode = vi.fn();

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
  peekLastOperationalMode: (...args: unknown[]) => peekLastOperationalMode(...args),
  setLastOperationalMode: (...args: unknown[]) => setLastOperationalMode(...args),
}));
vi.mock("@/lib/emergencyMode/state", () => ({ resolveOperationalMode: (...args: unknown[]) => resolveOperationalMode(...args) }));
vi.mock("@/lib/readModels/operationalMode", () => ({ resolveOperationalRoster: (...args: unknown[]) => resolveOperationalRoster(...args) }));

async function loadModule() {
  return import("./pipeline");
}

const PEOPLE = [{ id: "p_1", name: "אחד", email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null }];

const ZERO_CHANGE_SUMMARY = { baselineAction: "unchanged" as const, semanticChangesDetected: 0, pendingChangesOpen: 0, jobsCreated: 0 };

const ZERO_REMINDERS_SUMMARY = {
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

function setupHappyDefaults() {
  fetchFreshWorkbookRead.mockResolvedValue({ status: "ok", read: { people: PEOPLE, events: [], shiftSchedule: {} } });
  resolveNotificationRecipients.mockResolvedValue({ resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 });
  resolveOperationalMode.mockResolvedValue({ kind: "regular" });
  resolveOperationalRoster.mockResolvedValue({ mode: "regular" });
  peekLastOperationalMode.mockResolvedValue("regular");
  setLastOperationalMode.mockResolvedValue(undefined);
  runChangeDetection.mockResolvedValue(ZERO_CHANGE_SUMMARY);
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
  peekDueJobsCount.mockResolvedValue(0);
  peekDueManagerScheduledBroadcastsCount.mockResolvedValue(0);
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("runNotificationWorkerTick -- Emergency Mode wiring (spec section 22)", () => {
  it("regular mode: never calls resolveOperationalRoster (no emergency workbook fetch needed)", async () => {
    setupHappyDefaults();
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(resolveOperationalRoster).not.toHaveBeenCalled();
    expect(runChangeDetection).toHaveBeenCalledWith(expect.objectContaining({ operationalMode: "regular" }));
  });

  it("emergency mode with a readable roster: runChangeDetection receives the resolved assignments and 'emergency' mode", async () => {
    setupHappyDefaults();
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
    const assignments = [{ date: "2026-08-19", period: "day", desk: "הוגוורט", personId: "p_1", personName: "אחד", sourceCell: "C2" }];
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency", assignments, diagnostics: [], fetchedAt: "2026-08-19T09:00:00.000Z" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(runChangeDetection).toHaveBeenCalledWith(
      expect.objectContaining({ operationalMode: "emergency", emergencyAssignments: assignments }),
    );
  });

  it("emergency mode with an UNREADABLE roster: change detection is skipped entirely -- never touches baseline/observed/pending state", async () => {
    setupHappyDefaults();
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency_unavailable", period: { id: "p1" }, message: "boom" });
    const { runNotificationWorkerTick } = await loadModule();

    const result = await runNotificationWorkerTick("send");

    expect(runChangeDetection).not.toHaveBeenCalled();
    expect(setLastOperationalMode).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.summary.semanticChangesDetected).toBe(0);
      expect(result.summary.baselineAction).toBe("unchanged");
    }
  });

  it("computes operationalModeTransitioned=true and passes it through when the last observed mode differs from this tick's", async () => {
    setupHappyDefaults();
    peekLastOperationalMode.mockResolvedValue("regular");
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency", assignments: [], diagnostics: [], fetchedAt: "2026-08-19T09:00:00.000Z" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(runChangeDetection).toHaveBeenCalledWith(expect.objectContaining({ operationalModeTransitioned: true }));
  });

  it("computes operationalModeTransitioned=false when the mode is unchanged from the last observed tick", async () => {
    setupHappyDefaults();
    peekLastOperationalMode.mockResolvedValue("regular");
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(runChangeDetection).toHaveBeenCalledWith(expect.objectContaining({ operationalModeTransitioned: false }));
  });

  it("persists the new last-operational-mode after a runnable change-detection tick, only in 'send' mode", async () => {
    setupHappyDefaults();
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency", assignments: [], diagnostics: [], fetchedAt: "2026-08-19T09:00:00.000Z" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");
    expect(setLastOperationalMode).toHaveBeenCalledWith("emergency");
  });

  it("dry_run mode never writes the last-operational-mode flag, even on a runnable tick", async () => {
    setupHappyDefaults();
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("dry_run");

    expect(setLastOperationalMode).not.toHaveBeenCalled();
  });

  it("a null peekLastOperationalMode (pre-first-tick) defaults to 'regular', never a guessed transition", async () => {
    setupHappyDefaults();
    peekLastOperationalMode.mockResolvedValue(null);
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(runChangeDetection).toHaveBeenCalledWith(expect.objectContaining({ operationalModeTransitioned: false }));
  });

  it("threads operationalMode and emergencyAssignments into runReminders too", async () => {
    setupHappyDefaults();
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
    const assignments = [{ date: "2026-08-19", period: "day", desk: "הוגוורט", personId: "p_1", personName: "אחד", sourceCell: "C2" }];
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency", assignments, diagnostics: [], fetchedAt: "2026-08-19T09:00:00.000Z" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(runReminders).toHaveBeenCalledWith(
      expect.objectContaining({ operationalMode: "emergency", emergencyAssignments: assignments }),
    );
  });
});
