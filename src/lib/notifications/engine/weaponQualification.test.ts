import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCalendarDays, formatCalendarDate } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { DutyFamily, Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
import type { CompletionRow } from "@/lib/shootingRanges/store";
import type { RecipientResolution, ResolvedRecipient } from "./recipients";

const getCompletionsForPersonIds = vi.fn();
const insertNotificationJobIfAbsent = vi.fn();
const getLatestNotificationSourceRef = vi.fn();

// `filterManagerRecipients` (`./recipients`), `buildWeaponQualificationIndex`/
// `buildShootingRangeQualificationReadModel` (readModels), and
// `detectWeaponQualificationIssues` (domain) are all kept REAL -- pure
// functions, no I/O of their own -- so this exercises the SAME business
// logic Manager Area's own "דורש טיפול" reads, never a mocked pass-through.
// Only the genuine I/O boundaries are mocked: the מטווחים completions
// table and notification-job creation/read-back.
vi.mock("@/lib/shootingRanges/store", () => ({ getCompletionsForPersonIds: (...args: unknown[]) => getCompletionsForPersonIds(...args) }));
vi.mock("./store", () => ({
  insertNotificationJobIfAbsent: (...args: unknown[]) => insertNotificationJobIfAbsent(...args),
  getLatestNotificationSourceRef: (...args: unknown[]) => getLatestNotificationSourceRef(...args),
}));

const { runWeaponQualificationCheck } = await import("./weaponQualification");

/**
 * A tiny in-memory stand-in for the real `notification_jobs` table's
 * relevant slice -- `insertNotificationJobIfAbsent` (unique by dedupeKey)
 * and `getLatestNotificationSourceRef` (most-recently-inserted `sourceRef`
 * for a recipient+category) -- so multi-tick tests (repeated evaluation,
 * resolved issues, a later new issue) exercise the REAL read-back/compare
 * round trip `runWeaponQualificationCheck` depends on, not just a stateless
 * mock return value.
 */
interface FakeJob {
  category: string;
  recipientUserId: string;
  dedupeKey: string;
  title: string;
  body: string;
  path: string;
  sourceRef?: string;
}

let fakeJobs: FakeJob[] = [];

function resetFakeStore() {
  fakeJobs = [];
  insertNotificationJobIfAbsent.mockReset();
  insertNotificationJobIfAbsent.mockImplementation(async (job: FakeJob) => {
    if (fakeJobs.some((existing) => existing.dedupeKey === job.dedupeKey)) return false;
    fakeJobs.push(job);
    return true;
  });
  getLatestNotificationSourceRef.mockReset();
  getLatestNotificationSourceRef.mockImplementation(async (recipientUserId: string, category: string) => {
    const matches = fakeJobs.filter((job) => job.recipientUserId === recipientUserId && job.category === category);
    if (matches.length === 0) return null;
    return matches[matches.length - 1].sourceRef ?? null;
  });
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

function manager(overrides: Partial<Person> = {}): Person {
  return person({ id: "mgr1", name: "מנהל בדיקה", isManager: true, isTechnician: false, ...overrides });
}

function resolution(recipients: ResolvedRecipient[]): RecipientResolution {
  return {
    resolved: new Map(recipients.map((r) => [r.personId, r])),
    unmappedCount: 0,
    ambiguousEmailCount: 0,
    noEmailCount: 0,
  };
}

function recipient(personId: string, userId: string): ResolvedRecipient {
  return { personId, email: `${personId}@example.invalid`, userId };
}

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

/** `2026-09-02` plus `daysAhead` calendar days, via the SAME `dateRange.ts` arithmetic production code uses -- never a second/ad-hoc date implementation. */
function futureDate(daysAhead: number): string {
  const base = parseCalendarDate("2026-09-02")!;
  return formatCalendarDate(addCalendarDays(base, daysAhead));
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
    submittedByPersonName: "בדיקה",
    approvedByPersonId: "mgr1",
    approvedByPersonName: "מנהל בדיקה",
    approvedAt: "2026-01-02T00:00:00.000Z",
    linkedPlannedDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

/** Every person referenced by `events`, all with the SAME expired baseline, resolved eligibly (חובה + טכנאי). */
function eligiblePeopleFor(events: readonly Event[]): Person[] {
  const ids = [...new Set(events.map((event) => event.personId))];
  return ids.map((id) => person({ id, name: id }));
}

describe("runWeaponQualificationCheck -- aggregate notification (spec: fix production notification spam)", () => {
  const MGR_RECIPIENTS = resolution([recipient("mgr1", "u_mgr1")]);

  beforeEach(() => {
    resetFakeStore();
    getCompletionsForPersonIds.mockReset();
  });

  it("1. 39 invalid activity events -> exactly ONE notification per manager, never 39", async () => {
    const events = Array.from({ length: 39 }, (_, i) =>
      dutyEvent({
        personId: `p${(i % 7) + 1}`,
        date: futureDate(i),
        dutyFamily: (["oxid", "guard", "reserve"] as DutyFamily[])[i % 3],
      }),
    );
    const people = [...eligiblePeopleFor(events), manager()];
    getCompletionsForPersonIds.mockResolvedValue(people.filter((p) => p.id !== "mgr1").map((p) => expiredCompletion(p.id)));

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(result.issuesDetected).toBe(39);
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(result.jobsCreated).toBe(1);

    const [job] = fakeJobs;
    expect(job.category).toBe("weapon_qualification_summary");
    expect(job.path).toBe("/manager");
    expect(job.title).toBe("⚠️ בעיות כשירות מטווחים");
    expect(job.body).toBe(
      "נמצאו 39 שיבוצים עתידיים ללא כשירות מטווחים בתוקף אצל 7 אנשים. האירוע הקרוב: 2.9. נדרש טיפול.",
    );
    expect(JSON.parse(job.sourceRef!)).toHaveLength(39);
  });

  it("2. multiple invalid events for the SAME person -> still one aggregate notification", async () => {
    const events = [
      dutyEvent({ personId: "p1", dutyFamily: "oxid", date: futureDate(0) }),
      dutyEvent({ personId: "p1", dutyFamily: "guard", date: futureDate(3) }),
      dutyEvent({ personId: "p1", dutyFamily: "reserve", date: futureDate(6) }),
    ];
    const people = [person({ id: "p1" }), manager()];
    getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(result.issuesDetected).toBe(3);
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(fakeJobs[0].body).toContain("אצל אדם אחד"); // singular -- only one affected person
    expect(JSON.parse(fakeJobs[0].sourceRef!)).toHaveLength(3);
  });

  it("3. multiple affected people -> one aggregate notification with the correct affected-person count", async () => {
    const events = [
      dutyEvent({ personId: "p1", dutyFamily: "oxid", date: futureDate(0) }),
      dutyEvent({ personId: "p2", dutyFamily: "guard", date: futureDate(1) }),
      dutyEvent({ personId: "p3", dutyFamily: "reserve", date: futureDate(2) }),
    ];
    const people = [...eligiblePeopleFor(events), manager()];
    getCompletionsForPersonIds.mockResolvedValue(["p1", "p2", "p3"].map(expiredCompletion));

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(result.jobsCreated).toBe(1);
    expect(fakeJobs[0].body).toContain("אצל 3 אנשים");
  });

  it("4. repeated evaluation with UNCHANGED issues -> no duplicate notification", async () => {
    const events = [
      dutyEvent({ personId: "p1", dutyFamily: "oxid", date: futureDate(0) }),
      dutyEvent({ personId: "p2", dutyFamily: "guard", date: futureDate(1) }),
    ];
    const people = [...eligiblePeopleFor(events), manager()];
    getCompletionsForPersonIds.mockResolvedValue(["p1", "p2"].map(expiredCompletion));

    await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);
    await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(fakeJobs).toHaveLength(1);
  });

  it("5. issue ORDERING changes -> no duplicate notification", async () => {
    const eventA = dutyEvent({ personId: "p1", dutyFamily: "oxid", date: futureDate(0) });
    const eventB = dutyEvent({ personId: "p2", dutyFamily: "guard", date: futureDate(1) });
    const people = [...eligiblePeopleFor([eventA, eventB]), manager()];
    getCompletionsForPersonIds.mockResolvedValue(["p1", "p2"].map(expiredCompletion));

    await runWeaponQualificationCheck(people, [eventA, eventB], [], [], "2026-08-30", true, MGR_RECIPIENTS);
    await runWeaponQualificationCheck(people, [eventB, eventA], [], [], "2026-08-30", true, MGR_RECIPIENTS); // same set, reversed order

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("6. issues being RESOLVED/removed -> no new warning merely because the set shrank", async () => {
    const eventA = dutyEvent({ personId: "p1", dutyFamily: "oxid", date: futureDate(0) });
    const eventB = dutyEvent({ personId: "p2", dutyFamily: "guard", date: futureDate(1) });
    const eventC = dutyEvent({ personId: "p3", dutyFamily: "reserve", date: futureDate(2) });
    const people = [...eligiblePeopleFor([eventA, eventB, eventC]), manager()];
    getCompletionsForPersonIds.mockResolvedValue(["p1", "p2", "p3"].map(expiredCompletion));

    await runWeaponQualificationCheck(people, [eventA, eventB, eventC], [], [], "2026-08-30", true, MGR_RECIPIENTS);
    // p3's issue resolved (e.g. requalified / assignment removed) -- only A and B remain.
    await runWeaponQualificationCheck(people, [eventA, eventB], [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(fakeJobs).toHaveLength(1);
  });

  it("7. a genuinely NEW invalid assignment appears later -> a new warning CAN be generated", async () => {
    const eventA = dutyEvent({ personId: "p1", dutyFamily: "oxid", date: futureDate(0) });
    const eventB = dutyEvent({ personId: "p2", dutyFamily: "guard", date: futureDate(1) });
    const eventD = dutyEvent({ personId: "p4", dutyFamily: "reserve", date: futureDate(5) });
    const people = [...eligiblePeopleFor([eventA, eventB, eventD]), manager()];
    getCompletionsForPersonIds.mockResolvedValue(["p1", "p2", "p4"].map(expiredCompletion));

    await runWeaponQualificationCheck(people, [eventA, eventB], [], [], "2026-08-30", true, MGR_RECIPIENTS);
    // A genuinely new problem (p4/reserve) appears on a later tick.
    await runWeaponQualificationCheck(people, [eventA, eventB, eventD], [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(2);
    expect(fakeJobs).toHaveLength(2);
    expect(fakeJobs[0].dedupeKey).not.toBe(fakeJobs[1].dedupeKey);
    expect(JSON.parse(fakeJobs[1].sourceRef!)).toHaveLength(3);
  });

  it("8. a permanent (קבע) staff member with an expired qualification produces the SAME alert as a regular person -- requiresWeaponQualification is driven by the activity, never a personnel-category special case", async () => {
    const permanentGuard = person({ id: "p_perm", name: "קבע בדיקה", personnelType: "קבע", isTechnician: true });
    const events = [dutyEvent({ personId: "p_perm", personName: "קבע בדיקה", dutyFamily: "guard", date: futureDate(0) })];
    const people = [permanentGuard, manager()];
    getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p_perm")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(result.issuesDetected).toBe(1);
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(result.jobsCreated).toBe(1);
    expect(getCompletionsForPersonIds).toHaveBeenCalledWith(["p_perm"]);
  });

  it("valid qualification / unrelated activity -> no issue, no notification", async () => {
    getCompletionsForPersonIds.mockResolvedValue([]);
    const events: Event[] = [dutyEvent({ dutyFamily: null, category: "shift", title: "טכנאי יום" })];
    const people = [person(), manager()];

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(result).toEqual({ issuesDetected: 0, jobsCreated: 0 });
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("dry-run (persist: false) detects issues but never creates or reads back a notification", async () => {
    const events = [dutyEvent({ personId: "p1", date: futureDate(0) })];
    const people = [person({ id: "p1" }), manager()];
    getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", false, MGR_RECIPIENTS);

    expect(result).toEqual({ issuesDetected: 1, jobsCreated: 0 });
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("a past invalid duty (date < today) never reaches detection, and creates no notification -- existing future-only filtering preserved", async () => {
    const events = [dutyEvent({ personId: "p1", date: "2026-08-01" })]; // before "today" (2026-08-30)
    const people = [person({ id: "p1" }), manager()];
    getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, MGR_RECIPIENTS);

    expect(result).toEqual({ issuesDetected: 0, jobsCreated: 0 });
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("no managers resolved -> no notification, but issues are still counted as detected", async () => {
    const events = [dutyEvent({ personId: "p1", date: futureDate(0) })];
    const people = [person({ id: "p1" })]; // no manager at all
    getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, resolution([]));

    expect(result).toEqual({ issuesDetected: 1, jobsCreated: 0 });
  });

  it("each manager is notified independently -- a manager who already has a fully-covered set is skipped while a different/newer manager is not", async () => {
    const events = [dutyEvent({ personId: "p1", date: futureDate(0) })];
    const people = [person({ id: "p1" }), manager(), manager({ id: "mgr2", name: "מנהל שתיים" })];
    getCompletionsForPersonIds.mockResolvedValue([expiredCompletion("p1")]);
    const bothManagers = resolution([recipient("mgr1", "u_mgr1"), recipient("mgr2", "u_mgr2")]);

    // mgr1 already covered on a previous tick; mgr2 has never been notified.
    await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, resolution([recipient("mgr1", "u_mgr1")]));
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);

    await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, bothManagers);

    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(2);
    const recipientIds = fakeJobs.map((job) => job.recipientUserId).sort();
    expect(recipientIds).toEqual(["u_mgr1", "u_mgr2"]);
  });
});
