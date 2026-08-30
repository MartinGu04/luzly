import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
import type { CompletionRow } from "@/lib/shootingRanges/store";

/**
 * Regression for the Emergency Mode fix to the weapon-qualification
 * notification stage (`runWeaponQualificationCheck`, wired from
 * `pipeline.ts`). Unlike `pipeline.emergencyMode.test.ts` (which mocks
 * `./weaponQualification` away entirely, same as every other stage), this
 * file deliberately keeps it REAL -- the bug being protected here is
 * specifically that the stage must never even RUN its real detection/
 * notification logic while Emergency Mode is active, so mocking that logic
 * away would hide the exact regression this file exists to catch. Only
 * genuine I/O boundaries are mocked: the Google workbook fetch, recipient
 * resolution's own Admin API call, the מטווחים completions table, and
 * notification-job creation -- the SAME boundary `weaponQualification.test.ts`
 * itself mocks.
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
const getCompletionsForPersonIds = vi.fn();
const insertNotificationJobIfAbsent = vi.fn();

vi.mock("./freshRead", () => ({ fetchFreshWorkbookRead: (...args: unknown[]) => fetchFreshWorkbookRead(...args) }));
// `filterManagerRecipients` (called by the REAL `runWeaponQualificationCheck`)
// is kept real -- a pure `Person.isManager` filter over an already-resolved
// map, same convention `shootingRanges.test.ts`/`weaponQualification.test.ts`
// already use. Only `resolveNotificationRecipients` (the Admin API call) is
// mocked.
vi.mock("./recipients", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./recipients")>();
  return { ...actual, resolveNotificationRecipients: (...args: unknown[]) => resolveNotificationRecipients(...args) };
});
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
// `./store` backs BOTH pipeline.ts's own due-count/generation bookkeeping
// AND -- via the SAME resolved module -- the REAL `runWeaponQualificationCheck`'s
// `insertNotificationJobIfAbsent` write. Stubbing it here (never a real
// Supabase client) is what lets this file observe that write directly.
vi.mock("./store", () => ({
  peekDueJobsCount: (...args: unknown[]) => peekDueJobsCount(...args),
  peekDueManagerScheduledBroadcastsCount: (...args: unknown[]) => peekDueManagerScheduledBroadcastsCount(...args),
  peekLastOperationalGeneration: (...args: unknown[]) => peekLastOperationalGeneration(...args),
  setLastOperationalGeneration: (...args: unknown[]) => setLastOperationalGeneration(...args),
  insertNotificationJobIfAbsent: (...args: unknown[]) => insertNotificationJobIfAbsent(...args),
}));
vi.mock("@/lib/emergencyMode/state", () => ({ resolveOperationalMode: (...args: unknown[]) => resolveOperationalMode(...args) }));
vi.mock("@/lib/readModels/operationalMode", () => ({ resolveOperationalRoster: (...args: unknown[]) => resolveOperationalRoster(...args) }));
vi.mock("@/lib/shootingRanges/store", () => ({
  getCompletionsForPersonIds: (...args: unknown[]) => getCompletionsForPersonIds(...args),
}));

async function loadModule() {
  return import("./pipeline");
}

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    name: "איתי בדיקה",
    email: "itay@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: "חובה",
    ...overrides,
  };
}

const MANAGER: Person = person({
  id: "mgr1",
  name: "מנהל בדיקה",
  email: "mgr1@example.invalid",
  isManager: true,
  isTechnician: false,
});
const TECHNICIAN: Person = person();
const PEOPLE = [TECHNICIAN, MANAGER];

let cellCounter = 0;
function nextCell(): string {
  cellCounter += 1;
  return `C${cellCounter}`;
}

function dutyEvent(overrides: Partial<Event> = {}): Event {
  return {
    personId: "p1",
    personName: "איתי בדיקה",
    date: "2026-08-31",
    title: "אוקסיד",
    rawValue: "אוקסיד",
    category: "duty",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "משמרות + תורנויות",
    sourceCell: nextCell(),
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: "oxid",
    absenceKind: null,
    ...overrides,
  };
}

/** A single APPROVED app completion, expired well before "today" (2026-08-30) -- `performedOn` + 6 calendar months = 2026-07-01. */
function expiredCompletion(personId: string): CompletionRow {
  return {
    id: `completion_${personId}`,
    personId,
    performedOn: "2026-01-01",
    source: "self_report",
    status: "approved",
    notes: null,
    submittedByPersonId: personId,
    submittedByPersonName: "איתי בדיקה",
    approvedByPersonId: "mgr1",
    approvedByPersonName: "מנהל בדיקה",
    approvedAt: "2026-01-02T00:00:00.000Z",
    linkedPlannedDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

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

function setupCommonDefaults(events: readonly Event[]) {
  fetchFreshWorkbookRead.mockResolvedValue({
    status: "ok",
    read: {
      people: PEOPLE,
      events,
      shiftSchedule: {},
      shootingRangeSheetRecords: [],
      shootingRangeRelevanceRecords: [],
    },
  });
  resolveNotificationRecipients.mockResolvedValue({
    resolved: new Map([["mgr1", { personId: "mgr1", email: "mgr1@example.invalid", userId: "u_mgr1" }]]),
    unmappedCount: 0,
    ambiguousEmailCount: 0,
    noEmailCount: 0,
  });
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
  peekDueJobsCount.mockResolvedValue(0);
  peekDueManagerScheduledBroadcastsCount.mockResolvedValue(0);
  getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p1")]);
  insertNotificationJobIfAbsent.mockResolvedValue(true);
}

function mockEmergencyMode() {
  resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
  resolveOperationalRoster.mockResolvedValue({
    mode: "emergency",
    assignments: [],
    diagnostics: [],
    fetchedAt: "2026-08-19T09:00:00.000Z",
  });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe("runNotificationWorkerTick -- weapon-qualification stage vs Emergency Mode (regression)", () => {
  it("1. Emergency Mode + regular OXID duty + expired qualification -> no weapon-qualification notification job", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "oxid", title: "אוקסיד", date: "2026-08-31" })]);
    mockEmergencyMode();
    const { runNotificationWorkerTick } = await loadModule();

    const result = await runNotificationWorkerTick("send");

    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.summary.jobsCreated).toBe(0);
  });

  it("2. Emergency Mode + regular guard duty (שמירה) + invalid qualification -> no job", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "guard", title: "שמירה", date: "2026-08-31" })]);
    mockEmergencyMode();
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("3. Emergency Mode + regular reserve duty (עתודה) + invalid qualification -> no job", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "reserve", title: "עתודה", date: "2026-08-31" })]);
    mockEmergencyMode();
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("4. Regular mode with the SAME invalid duty -> the notification is still generated (existing behavior unchanged)", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "oxid", title: "אוקסיד", date: "2026-08-31" })]);
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });
    const { runNotificationWorkerTick } = await loadModule();

    const result = await runNotificationWorkerTick("send");

    expect(resolveOperationalRoster).not.toHaveBeenCalled();
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    const [job] = insertNotificationJobIfAbsent.mock.calls[0];
    expect(job.category).toBe("weapon_qualification_invalid");
    expect(job.recipientUserId).toBe("u_mgr1");
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.summary.jobsCreated).toBe(1);
  });

  it("5. Existing past-event filtering remains intact in regular mode -- a historical invalid duty never generates a job", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "oxid", title: "אוקסיד", date: "2026-08-01" })]); // before "today" (2026-08-30)
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("6. Existing dedupe behavior remains intact -- repeated regular-mode ticks reuse the identical dedupe key", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "oxid", title: "אוקסיד", date: "2026-08-31" })]);
    resolveOperationalMode.mockResolvedValue({ kind: "regular" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");
    const [firstJob] = insertNotificationJobIfAbsent.mock.calls[0];

    insertNotificationJobIfAbsent.mockClear();
    await runNotificationWorkerTick("send");
    const [secondJob] = insertNotificationJobIfAbsent.mock.calls[0];

    expect(secondJob.dedupeKey).toBe(firstJob.dedupeKey);
  });

  it("Emergency Mode skips the stage regardless of whether the emergency roster itself is readable", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "oxid", title: "אוקסיד", date: "2026-08-31" })]);
    resolveOperationalMode.mockResolvedValue({ kind: "emergency", period: { id: "p1" } });
    resolveOperationalRoster.mockResolvedValue({ mode: "emergency_unavailable", period: { id: "p1" }, message: "boom" });
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("send");

    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("dry_run mode during Emergency Mode still never runs the real check (no completions lookup either)", async () => {
    setupCommonDefaults([dutyEvent({ dutyFamily: "oxid", title: "אוקסיד", date: "2026-08-31" })]);
    mockEmergencyMode();
    const { runNotificationWorkerTick } = await loadModule();

    await runNotificationWorkerTick("dry_run");

    expect(getCompletionsForPersonIds).not.toHaveBeenCalled();
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });
});
