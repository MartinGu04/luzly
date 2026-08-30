import { beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import type { Event } from "@/lib/domain/event";
import type { Person } from "@/lib/domain/types";
import type { CompletionRow } from "@/lib/shootingRanges/store";
import type { RecipientResolution, ResolvedRecipient } from "./recipients";

const getCompletionsForPersonIds = vi.fn();
const insertNotificationJobIfAbsent = vi.fn();

// `filterManagerRecipients` (`./recipients`) and `buildWeaponQualificationIndex`/
// `buildShootingRangeQualificationReadModel` (readModels) and
// `detectWeaponQualificationIssues` (domain) are all kept REAL -- pure
// functions, no I/O of their own -- so this test exercises the SAME
// business logic Manager Area's own "דורש טיפול" reads, never a mocked
// pass-through. Only the two genuine I/O boundaries are mocked: the
// app-owned מטווחים completions table, and notification-job creation.
vi.mock("@/lib/shootingRanges/store", () => ({ getCompletionsForPersonIds: (...args: unknown[]) => getCompletionsForPersonIds(...args) }));
vi.mock("./store", () => ({ insertNotificationJobIfAbsent: (...args: unknown[]) => insertNotificationJobIfAbsent(...args) }));

const { runWeaponQualificationCheck } = await import("./weaponQualification");

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

/** A single APPROVED app completion -- `performedOn` + 6 calendar months is the resulting expiry date. */
function approvedCompletion(personId: string, performedOn: string): CompletionRow {
  return {
    id: `completion_${personId}_${performedOn}`,
    personId,
    performedOn,
    source: "self_report",
    status: "approved",
    notes: null,
    submittedByPersonId: personId,
    submittedByPersonName: "איתי בדיקה",
    approvedByPersonId: "mgr1",
    approvedByPersonName: "מנהל בדיקה",
    approvedAt: "2026-01-02T00:00:00.000Z",
    linkedPlannedDate: null,
    createdAt: `${performedOn}T00:00:00.000Z`,
  };
}

describe("runWeaponQualificationCheck", () => {
  beforeEach(() => {
    getCompletionsForPersonIds.mockReset();
    insertNotificationJobIfAbsent.mockReset();
    insertNotificationJobIfAbsent.mockResolvedValue(true);
  });

  it("expired qualification + oxid tomorrow -> a manager-facing job is created", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]); // expires 2026-07-01
    const people = [person(), manager()];
    const events = [dutyEvent({ date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);

    expect(result).toEqual({ issuesDetected: 1, jobsCreated: 1 });
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    const [job] = insertNotificationJobIfAbsent.mock.calls[0];
    expect(job.recipientUserId).toBe("u_mgr1");
    expect(job.path).toBe("/manager");
    expect(job.title).toContain("אוקסיד");
    expect(job.body).toContain("איתי בדיקה");
  });

  it("expired qualification + guard duty (שמירות) -> a job is created", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]);
    const people = [person(), manager()];
    const events = [dutyEvent({ dutyFamily: "guard", title: "שמירה", date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    expect(result.jobsCreated).toBe(1);
  });

  it("expired qualification + reserve duty (עתודה) -> a job is created", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]);
    const people = [person(), manager()];
    const events = [dutyEvent({ dutyFamily: "reserve", title: "עתודה", date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    expect(result.jobsCreated).toBe(1);
  });

  it("valid qualification on the activity date -> no issue, no job", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-08-01")]); // expires 2027-02-01
    const people = [person(), manager()];
    const events = [dutyEvent({ date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    expect(result).toEqual({ issuesDetected: 0, jobsCreated: 0 });
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("unrelated activity (a plain shift) -> no issue, no job", async () => {
    getCompletionsForPersonIds.mockResolvedValue([]);
    const people = [person(), manager()];
    const events: Event[] = [dutyEvent({ dutyFamily: null, category: "shift", title: "טכנאי יום", date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    expect(result).toEqual({ issuesDetected: 0, jobsCreated: 0 });
  });

  it("dry-run (persist: false) detects the issue but never creates a job", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]);
    const people = [person(), manager()];
    const events = [dutyEvent({ date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", false, recipients);
    expect(result).toEqual({ issuesDetected: 1, jobsCreated: 0 });
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
  });

  it("repeated processing of the SAME still-unresolved issue creates exactly one logical notification (dedupe_key uniqueness), not duplicates on every run", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]);
    const people = [person(), manager()];
    const events = [dutyEvent({ date: "2026-08-31" })];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    const [firstJob] = insertNotificationJobIfAbsent.mock.calls[0];

    // A second worker tick re-observing the SAME still-unresolved problem
    // must reuse the exact same dedupe key -- `insertNotificationJobIfAbsent`
    // (the real DB unique constraint in production) is what actually
    // suppresses the duplicate; this asserts the key itself is stable
    // across repeated ticks, which is what makes that suppression work.
    insertNotificationJobIfAbsent.mockClear();
    await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    const [secondJob] = insertNotificationJobIfAbsent.mock.calls[0];

    expect(secondJob.dedupeKey).toBe(firstJob.dedupeKey);
  });

  it("a different activity date produces a genuinely different dedupe key -- a real new occurrence still gets notified", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]);
    const people = [person(), manager()];
    const recipients = resolution([recipient("mgr1", "u_mgr1")]);

    await runWeaponQualificationCheck(people, [dutyEvent({ date: "2026-08-31" })], [], [], "2026-08-30", true, recipients);
    const [firstJob] = insertNotificationJobIfAbsent.mock.calls[0];

    insertNotificationJobIfAbsent.mockClear();
    await runWeaponQualificationCheck(people, [dutyEvent({ date: "2026-09-15" })], [], [], "2026-09-01", true, recipients);
    const [secondJob] = insertNotificationJobIfAbsent.mock.calls[0];

    expect(secondJob.dedupeKey).not.toBe(firstJob.dedupeKey);
  });

  it("no managers resolved -> no job, but the issue is still counted as detected", async () => {
    getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]);
    const people = [person()]; // no manager at all
    const events = [dutyEvent({ date: "2026-08-31" })];
    const recipients = resolution([]);

    const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);
    expect(result).toEqual({ issuesDetected: 1, jobsCreated: 0 });
  });

  describe("notification-only date narrowing (never mine historical assignments)", () => {
    it("a PAST invalid weapon-duty (date < today) creates no notification, even though the qualification was genuinely invalid back then", async () => {
      getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]); // expires 2026-07-01
      const people = [person(), manager()];
      const events = [dutyEvent({ date: "2026-08-01" })]; // in the past relative to "today" below, and after expiry
      const recipients = resolution([recipient("mgr1", "u_mgr1")]);

      const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);

      expect(result).toEqual({ issuesDetected: 0, jobsCreated: 0 });
      expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
    });

    it("an invalid weapon-duty scheduled for TODAY still creates a notification (today is not yet 'past')", async () => {
      getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]); // expires 2026-07-01
      const people = [person(), manager()];
      const events = [dutyEvent({ date: "2026-08-30" })];
      const recipients = resolution([recipient("mgr1", "u_mgr1")]);

      const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);

      expect(result).toEqual({ issuesDetected: 1, jobsCreated: 1 });
    });

    it("an invalid weapon-duty scheduled in the FUTURE still creates a notification", async () => {
      getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]); // expires 2026-07-01
      const people = [person(), manager()];
      const events = [dutyEvent({ date: "2026-09-15" })];
      const recipients = resolution([recipient("mgr1", "u_mgr1")]);

      const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);

      expect(result).toEqual({ issuesDetected: 1, jobsCreated: 1 });
    });

    it("a future activity where the qualification is valid TODAY but will have expired by the activity date is still detected -- the date filter only drops PAST activities, it never blocks a legitimate future-expiry issue", async () => {
      // Baseline expires 2026-09-10 -- still valid as of "today" (2026-08-30),
      // but the oxid activity itself is scheduled for 2026-09-15, after expiry.
      getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-03-10")]); // expires 2026-09-10
      const people = [person(), manager()];
      const events = [dutyEvent({ date: "2026-09-15" })];
      const recipients = resolution([recipient("mgr1", "u_mgr1")]);

      const result = await runWeaponQualificationCheck(people, events, [], [], "2026-08-30", true, recipients);

      expect(result).toEqual({ issuesDetected: 1, jobsCreated: 1 });
    });

    it("a mix of past and future invalid duties for the same person notifies only for the future one", async () => {
      getCompletionsForPersonIds.mockResolvedValue([approvedCompletion("p1", "2026-01-01")]); // expires 2026-07-01
      const people = [person(), manager()];
      const pastEvent = dutyEvent({ date: "2026-08-01", sourceCell: nextCell() });
      const futureEvent = dutyEvent({ date: "2026-09-15", sourceCell: nextCell() });
      const recipients = resolution([recipient("mgr1", "u_mgr1")]);

      const result = await runWeaponQualificationCheck(people, [pastEvent, futureEvent], [], [], "2026-08-30", true, recipients);

      expect(result).toEqual({ issuesDetected: 1, jobsCreated: 1 });
      const [job] = insertNotificationJobIfAbsent.mock.calls[0];
      expect(job.dedupeKey).toContain("2026-09-15");
      expect(job.dedupeKey).not.toContain("2026-08-01");
    });
  });
});
