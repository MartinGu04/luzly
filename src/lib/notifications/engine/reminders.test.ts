import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@/lib/domain/event";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import type { RecipientResolution } from "./recipients";

function event(overrides: Partial<Event> & Pick<Event, "personId" | "date" | "category">): Event {
  return {
    personName: overrides.personId,
    title: "",
    rawValue: "",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "sheet",
    sourceCell: "A1",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

const schedule = buildShiftSchedule("07:00");

const store = {
  upsertPendingReminderJob: vi.fn<(job: import("./store").NewNotificationJob) => Promise<void>>(async () => {}),
  cancelPendingReminderJob: vi.fn(async () => {}),
  listPendingJobDedupeKeysByPrefix: vi.fn<(prefix: string) => Promise<string[]>>(async () => []),
  insertNotificationJobIfAbsent: vi.fn(async () => true),
};

const fetchAllSubscribedUserIds = vi.fn(async () => [] as string[]);

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule() {
  vi.doMock("./store", () => store);
  vi.doMock("./recipients", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./recipients")>();
    return { ...actual, fetchAllSubscribedUserIds };
  });
  return import("./reminders");
}

function resolutionWith(personId: string, userId: string): RecipientResolution {
  return {
    resolved: new Map([[personId, { personId, email: `${personId}@example.com`, userId }]]),
    unmappedCount: 0,
    ambiguousEmailCount: 0,
    noEmailCount: 0,
  };
}

describe("runReminders -- tomorrow shift reminder", () => {
  it("creates a reminder job crossing a Saturday -> Sunday week boundary", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 1200 }; // Saturday evening
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-23", category: "shift", period: "day" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.upsertPendingReminderJob).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "tomorrow_shift",
        recipientUserId: "user-p1",
        dedupeKey: "tomorrow_shift:2026-08-23:user-p1:day",
      }),
    );
  });

  it("includes the real shift start time when the domain can resolve it", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-19", category: "shift", period: "day" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.upsertPendingReminderJob).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining("07:00") }),
    );
  });

  it("never invents a time for an unresolvable (morning/unspecified) period", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-19", category: "shift", period: "morning" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    const call = store.upsertPendingReminderJob.mock.calls[0][0];
    expect(call.body).not.toMatch(/\d{2}:\d{2}/);
  });

  it("cancels a previously-created reminder whose assignment disappeared before send", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue(["tomorrow_shift:2026-08-19:user-p1:day"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [], // the shift no longer exists
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("tomorrow_shift:2026-08-19:user-p1:day");
  });
});

describe("runReminders -- tomorrow duty reminder", () => {
  it("fires normally for evacuation_on_call (the exclusion only applies to the removed check-in reminder, not the duty existence reminder)", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-19", category: "duty", dutyFamily: "evacuation_on_call" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.upsertPendingReminderJob).toHaveBeenCalledWith(
      expect.objectContaining({ category: "tomorrow_duty", body: expect.stringContaining("כונן פינויים") }),
    );
  });
});

describe("runReminders -- tomorrow logistics-withdrawal reminder (משיכות מהלוגיסטיקה)", () => {
  it("the assigned person gets exactly one reminder, with the exact spec copy and path", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-19", category: "other", title: "משיכות מהלוגיסטיקה" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.upsertPendingReminderJob).toHaveBeenCalledTimes(1);
    expect(store.upsertPendingReminderJob).toHaveBeenCalledWith({
      category: "tomorrow_logistics_withdrawal",
      recipientUserId: "user-p1",
      title: "📦 משיכות מהלוגיסטיקה מחר",
      body: "מחר אתה עושה משיכות בין 13:00–14:00.",
      path: "/",
      tag: "tomorrow-logistics-withdrawal-2026-08-19-user-p1",
      dedupeKey: "tomorrow_logistics_withdrawal:2026-08-19:user-p1",
      scheduledFor: expect.any(String),
      sourceRef: "logistics_withdrawal:p1:2026-08-19",
    });
  });

  it("other users (not assigned) never get a reminder", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    const resolution: RecipientResolution = {
      resolved: new Map([
        ["p1", { personId: "p1", email: "p1@example.com", userId: "user-p1" }],
        ["p2", { personId: "p2", email: "p2@example.com", userId: "user-p2" }],
      ]),
      unmappedCount: 0,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-19", category: "other", title: "משיכות" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolution,
    });

    expect(store.upsertPendingReminderJob).toHaveBeenCalledTimes(1);
    expect(store.upsertPendingReminderJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "user-p2" }),
    );
  });

  it("is scheduled for exactly 20:00 Asia/Jerusalem the previous day", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 }; // 2026-08-18, winter/summer irrelevant here (August = UTC+3)
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-19", category: "other", title: "משיכות" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    const call = store.upsertPendingReminderJob.mock.calls[0][0];
    expect(call.scheduledFor).toBe("2026-08-18T17:00:00.000Z"); // 20:00 Asia/Jerusalem (UTC+3 in August) on 2026-08-18
  });

  it("cancels the pending reminder when the assignment disappears before send", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue(["tomorrow_logistics_withdrawal:2026-08-19:user-p1"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [], // the assignment no longer exists
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("tomorrow_logistics_withdrawal:2026-08-19:user-p1");
    expect(store.upsertPendingReminderJob).not.toHaveBeenCalled();
  });

  it("moving the assignment from person A to person B cancels A's pending reminder and creates B's", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue(["tomorrow_logistics_withdrawal:2026-08-19:user-a"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    const resolution: RecipientResolution = {
      resolved: new Map([
        ["p-a", { personId: "p-a", email: "a@example.com", userId: "user-a" }],
        ["p-b", { personId: "p-b", email: "b@example.com", userId: "user-b" }],
      ]),
      unmappedCount: 0,
      ambiguousEmailCount: 0,
      noEmailCount: 0,
    };

    // The Sheet now assigns "p-b", not "p-a" -- the assignment moved.
    await runReminders({
      events: [event({ personId: "p-b", date: "2026-08-19", category: "other", title: "משיכות מהלוגיסטיקה" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolution,
    });

    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("tomorrow_logistics_withdrawal:2026-08-19:user-a");
    expect(store.upsertPendingReminderJob).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "user-b", dedupeKey: "tomorrow_logistics_withdrawal:2026-08-19:user-b" }),
    );
  });

  it("repeated worker ticks (same assignment observed again) use the identical deterministic dedupe key -- never a duplicate", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);
    const input = {
      events: [event({ personId: "p1", date: "2026-08-19", category: "other", title: "משיכות מהלוגיסטיקה" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    };

    await runReminders(input); // tick 1
    await runReminders(input); // tick 2, 5 minutes later in reality -- same assignment, same tomorrow date

    expect(store.upsertPendingReminderJob).toHaveBeenCalledTimes(2);
    const firstDedupeKey = store.upsertPendingReminderJob.mock.calls[0][0].dedupeKey;
    const secondDedupeKey = store.upsertPendingReminderJob.mock.calls[1][0].dedupeKey;
    expect(firstDedupeKey).toBe(secondDedupeKey); // identical key both times -- the real store's ON CONFLICT (dedupe_key) upsert (see store.ts) collapses these into one row, never two
  });

  it("crosses a Saturday -> Sunday operational-week boundary", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 1200 }; // Saturday evening
    const week = getOperationalWeek(now);

    await runReminders({
      events: [event({ personId: "p1", date: "2026-08-23", category: "other", title: "משיכות מהלוגיסטיקה" })], // tomorrow = Sunday, next week
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.upsertPendingReminderJob).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "tomorrow_logistics_withdrawal",
        recipientUserId: "user-p1",
        dedupeKey: "tomorrow_logistics_withdrawal:2026-08-23:user-p1",
      }),
    );
  });
});

describe("runReminders -- weekly constraints reminders", () => {
  it("creates a Sunday reminder for every push-enabled user, only on Sunday", async () => {
    fetchAllSubscribedUserIds.mockResolvedValue(["user-a", "user-b"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-16", minuteOfDay: 1080 }; // Sunday
    const week = getOperationalWeek(now);

    const summary = await runReminders({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

    expect(summary.constraintsJobs).toBe(2);
    expect(store.insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ category: "constraints_sunday", dedupeKey: `constraints_sunday:${week.weekStart}:user-a` }),
    );
  });

  it("creates a Monday reminder, and never on any other weekday", async () => {
    fetchAllSubscribedUserIds.mockResolvedValue(["user-a"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-17", minuteOfDay: 600 }; // Monday
    const week = getOperationalWeek(now);

    const summary = await runReminders({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

    expect(summary.constraintsJobs).toBe(1);
  });

  it("creates no constraints jobs on a Tuesday", async () => {
    fetchAllSubscribedUserIds.mockResolvedValue(["user-a"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 600 }; // Tuesday
    const week = getOperationalWeek(now);

    const summary = await runReminders({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

    expect(summary.constraintsJobs).toBe(0);
    expect(fetchAllSubscribedUserIds).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Logistics-withdrawal team coordination (tomorrow-supervisor + same-day noon)
// ---------------------------------------------------------------------------

function daySupervisorShift(personId: string, overrides: Partial<Event> & Pick<Event, "date">): Event {
  return event({ personId, category: "shift", role: "supervisor", period: "day", ...overrides });
}

function dayTechnicianShift(personId: string, overrides: Partial<Event> & Pick<Event, "date">): Event {
  return event({ personId, category: "shift", role: "technician", period: "day", ...overrides });
}

function withdrawalAssignment(personId: string, date: string, overrides: Partial<Event> = {}): Event {
  return event({ personId, date, category: "other", title: "משיכות", ...overrides });
}

function resolutionFor(pairs: readonly [string, string][]): RecipientResolution {
  return {
    resolved: new Map(pairs.map(([personId, userId]) => [personId, { personId, email: `${personId}@example.com`, userId }])),
    unmappedCount: 0,
    ambiguousEmailCount: 0,
    noEmailCount: 0,
  };
}

function upsertedFor(category: string) {
  return store.upsertPendingReminderJob.mock.calls.map((call) => call[0]).filter((job) => job.category === category);
}

function person(id: string, overrides: Partial<import("@/lib/domain/types").Person> = {}) {
  return {
    id,
    name: id,
    email: `${id}@example.com`,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

describe("runReminders -- tomorrow logistics-withdrawal SUPERVISOR reminder (20:00, day before)", () => {
  it("supervisor gets the assigned-person-informed message when someone is assigned", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19"), daySupervisorShift("p_sup", { date: "2026-08-19" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_ethan", "user-ethan"],
        ["p_sup", "user-sup"],
      ]),
    });

    const jobs = upsertedFor("tomorrow_logistics_withdrawal_supervisor");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      recipientUserId: "user-sup",
      title: "📦 משיכות מחר",
      body: "מחר p_ethan עושה משיכות בין 13:00–14:00. נדרש לוודא שהוא מכיר את המשימה.",
      dedupeKey: "tomorrow_logistics_withdrawal_supervisor:2026-08-19:user-sup",
    });
  });

  it("no assignee: supervisor gets the anti-spam warning, and NO technician-wide push exists at 20:00 at all", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [daySupervisorShift("p_sup", { date: "2026-08-19" }), dayTechnicianShift("p_tech", { date: "2026-08-19" })],
      people: [person("p_tech", { isTechnician: true })],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_sup", "user-sup"],
        ["p_tech", "user-tech"],
      ]),
    });

    const supervisorJobs = upsertedFor("tomorrow_logistics_withdrawal_supervisor");
    expect(supervisorJobs).toHaveLength(1);
    expect(supervisorJobs[0]).toMatchObject({
      recipientUserId: "user-sup",
      title: "⚠️ לא הוגדר טכנאי למשיכות",
      body: "לא הוגדר טכנאי למשיכות מחר בין 13:00–14:00. נדרש לוודא שכל הטכנאים הזמינים יוצאים למשיכות.",
    });
    // No LOGISTICS category ever targets the technician the evening before
    // (p_tech legitimately still gets the unrelated, pre-existing
    // tomorrow_shift reminder for their own ordinary shift -- untouched by
    // this feature).
    for (const category of [
      "tomorrow_logistics_withdrawal",
      "tomorrow_logistics_withdrawal_supervisor",
      "logistics_withdrawal_noon_assigned",
      "logistics_withdrawal_noon_supervisor",
      "logistics_withdrawal_noon_team",
    ]) {
      expect(upsertedFor(category).some((job) => job.recipientUserId === "user-tech")).toBe(false);
    }
  });

  it("no supervisor can be proven: zero supervisor jobs, even with an assignee", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19")], // no shift Events at all
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([["p_ethan", "user-ethan"]]),
    });

    expect(upsertedFor("tomorrow_logistics_withdrawal_supervisor")).toHaveLength(0);
  });

  it("multiple assignees consolidate into ONE supervisor job (not one per assignee), with plural copy", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [
        withdrawalAssignment("p_a", "2026-08-19"),
        withdrawalAssignment("p_b", "2026-08-19"),
        daySupervisorShift("p_sup", { date: "2026-08-19" }),
      ],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_a", "user-a"],
        ["p_b", "user-b"],
        ["p_sup", "user-sup"],
      ]),
    });

    const jobs = upsertedFor("tomorrow_logistics_withdrawal_supervisor");
    expect(jobs).toHaveLength(1);
    expect(jobs[0].body).toContain("עושים");
  });

  it("an assignee who is ALSO the relevant supervisor never gets the supervisor message about themselves", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19"), daySupervisorShift("p_ethan", { date: "2026-08-19" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([["p_ethan", "user-ethan"]]),
    });

    expect(upsertedFor("tomorrow_logistics_withdrawal_supervisor")).toHaveLength(0);
    expect(upsertedFor("tomorrow_logistics_withdrawal")).toHaveLength(1);
  });
});

describe("runReminders -- same-day noon (12:00) logistics-withdrawal team coordination", () => {
  it("the assigned technician gets the personal noon reminder", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([["p_ethan", "user-ethan"]]),
    });

    const jobs = upsertedFor("logistics_withdrawal_noon_assigned");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({
      recipientUserId: "user-ethan",
      title: "📦 משיכות בעוד שעה",
      body: "היום אתה עושה משיכות בין 13:00–14:00.",
      dedupeKey: "logistics_withdrawal_noon_assigned:2026-08-19:user-ethan",
    });
  });

  it("other eligible technicians get the noon help message naming the assignee, and the assignee does NOT also get it", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [
        withdrawalAssignment("p_ethan", "2026-08-19"),
        dayTechnicianShift("p_ethan", { date: "2026-08-19" }),
        dayTechnicianShift("p_helper", { date: "2026-08-19" }),
      ],
      people: [person("p_ethan", { isTechnician: true }), person("p_helper", { isTechnician: true })],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_ethan", "user-ethan"],
        ["p_helper", "user-helper"],
      ]),
    });

    const teamJobs = upsertedFor("logistics_withdrawal_noon_team");
    expect(teamJobs).toHaveLength(1);
    expect(teamJobs[0]).toMatchObject({
      recipientUserId: "user-helper",
      title: "🤝 משיכות היום",
      body: "p_ethan עושה משיכות היום בין 13:00–14:00. נדרש לעזור לו.",
    });
    // Ethan himself never receives the generic help message about his own assignment.
    expect(store.upsertPendingReminderJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: "logistics_withdrawal_noon_team", recipientUserId: "user-ethan" }),
    );
  });

  it("no assignee at noon: supervisor gets the warning AND eligible technicians get the all-hands fallback", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [daySupervisorShift("p_sup", { date: "2026-08-19" }), dayTechnicianShift("p_tech", { date: "2026-08-19" })],
      people: [person("p_tech", { isTechnician: true })],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_sup", "user-sup"],
        ["p_tech", "user-tech"],
      ]),
    });

    const supervisorJobs = upsertedFor("logistics_withdrawal_noon_supervisor");
    expect(supervisorJobs).toHaveLength(1);
    expect(supervisorJobs[0]).toMatchObject({
      recipientUserId: "user-sup",
      title: "⚠️ לא הוגדר טכנאי למשיכות",
      body: "לא הוגדר טכנאי למשיכות היום בין 13:00–14:00. נדרש לוודא שכל הטכנאים הזמינים יוצאים למשיכות.",
    });

    const teamJobs = upsertedFor("logistics_withdrawal_noon_team");
    expect(teamJobs).toHaveLength(1);
    expect(teamJobs[0]).toMatchObject({
      recipientUserId: "user-tech",
      title: "📦 משיכות היום",
      body: "לא הוגדר טכנאי למשיכות היום. כל הטכנאים הזמינים נדרשים לצאת למשיכות בין 13:00–14:00.",
    });
  });

  it("an assignment appearing before noon replaces the stale fallback jobs on the next tick", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 480 }; // 08:00 -- still unassigned
    const week = getOperationalWeek(now);
    const events = [daySupervisorShift("p_sup", { date: "2026-08-19" }), dayTechnicianShift("p_tech", { date: "2026-08-19" })];
    const people = [person("p_tech", { isTechnician: true })];
    const recipientResolution = resolutionFor([
      ["p_sup", "user-sup"],
      ["p_tech", "user-tech"],
      ["p_ethan", "user-ethan"],
    ]);

    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    await runReminders({ events, people, shiftSchedule: schedule, week, now, persist: true, recipientResolution });
    expect(upsertedFor("logistics_withdrawal_noon_supervisor")).toHaveLength(1);
    expect(upsertedFor("logistics_withdrawal_noon_team")).toHaveLength(1);

    // 09:00 -- Ethan gets assigned. Next tick's stale-key sweep reports the
    // previously-upserted fallback jobs as still pending.
    store.upsertPendingReminderJob.mockClear();
    store.listPendingJobDedupeKeysByPrefix.mockImplementation(async (prefix: string) => {
      if (prefix === "logistics_withdrawal_noon_supervisor:2026-08-19:") return ["logistics_withdrawal_noon_supervisor:2026-08-19:user-sup"];
      if (prefix === "logistics_withdrawal_noon_team:2026-08-19:") return ["logistics_withdrawal_noon_team:2026-08-19:user-tech"];
      return [];
    });

    await runReminders({
      events: [...events, withdrawalAssignment("p_ethan", "2026-08-19")],
      people,
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });

    // The supervisor's fallback warning is no longer valid -- cancelled.
    expect(upsertedFor("logistics_withdrawal_noon_supervisor")).toHaveLength(0);
    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("logistics_withdrawal_noon_supervisor:2026-08-19:user-sup");
    // p_tech is STILL a valid team recipient (still eligible) -- their job
    // is re-upserted with fresh "help Ethan" content, never cancelled.
    expect(store.cancelPendingReminderJob).not.toHaveBeenCalledWith("logistics_withdrawal_noon_team:2026-08-19:user-tech");
    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toHaveLength(1);
    const teamJobs = upsertedFor("logistics_withdrawal_noon_team");
    expect(teamJobs).toHaveLength(1);
    expect(teamJobs[0].body).toContain("p_ethan");
  });

  it("an assignment removed before noon switches back to the fallback on the next tick", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 480 };
    const week = getOperationalWeek(now);
    const recipientResolution = resolutionFor([["p_ethan", "user-ethan"]]);

    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });
    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toHaveLength(1);

    store.upsertPendingReminderJob.mockClear();
    store.listPendingJobDedupeKeysByPrefix.mockImplementation(async (prefix: string) => {
      if (prefix === "logistics_withdrawal_noon_assigned:2026-08-19:") return ["logistics_withdrawal_noon_assigned:2026-08-19:user-ethan"];
      return [];
    });

    await runReminders({
      events: [], // the assignment was removed
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });

    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toHaveLength(0);
    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("logistics_withdrawal_noon_assigned:2026-08-19:user-ethan");
  });

  it("reassignment from A to B cancels A's stale noon-assigned job and creates B's", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 480 };
    const week = getOperationalWeek(now);
    const recipientResolution = resolutionFor([
      ["p_a", "user-a"],
      ["p_b", "user-b"],
    ]);

    store.listPendingJobDedupeKeysByPrefix.mockImplementation(async (prefix: string) => {
      if (prefix === "logistics_withdrawal_noon_assigned:2026-08-19:") return ["logistics_withdrawal_noon_assigned:2026-08-19:user-a"];
      return [];
    });

    await runReminders({
      events: [withdrawalAssignment("p_b", "2026-08-19")], // now assigns B, not A
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });

    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("logistics_withdrawal_noon_assigned:2026-08-19:user-a");
    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toEqual([
      expect.objectContaining({ recipientUserId: "user-b", dedupeKey: "logistics_withdrawal_noon_assigned:2026-08-19:user-b" }),
    ]);
  });

  it("a technician who becomes absent before noon disappears from the team recipient set on the next tick", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 480 };
    const week = getOperationalWeek(now);
    const events = [dayTechnicianShift("p_helper", { date: "2026-08-19" })];
    const people = [person("p_helper", { isTechnician: true })];
    const recipientResolution = resolutionFor([
      ["p_ethan", "user-ethan"],
      ["p_helper", "user-helper"],
    ]);

    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    await runReminders({
      events: [...events, withdrawalAssignment("p_ethan", "2026-08-19")],
      people,
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });
    expect(upsertedFor("logistics_withdrawal_noon_team")).toHaveLength(1);

    store.upsertPendingReminderJob.mockClear();
    store.listPendingJobDedupeKeysByPrefix.mockImplementation(async (prefix: string) => {
      if (prefix === "logistics_withdrawal_noon_team:2026-08-19:") return ["logistics_withdrawal_noon_team:2026-08-19:user-helper"];
      return [];
    });

    await runReminders({
      events: [
        ...events,
        withdrawalAssignment("p_ethan", "2026-08-19"),
        event({ personId: "p_helper", date: "2026-08-19", category: "absence", absenceKind: "referral" }),
      ],
      people,
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });

    expect(upsertedFor("logistics_withdrawal_noon_team")).toHaveLength(0);
    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("logistics_withdrawal_noon_team:2026-08-19:user-helper");
  });

  it("multiple assignees consolidate into ONE team job per eligible technician, not one per assignee", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [
        withdrawalAssignment("p_a", "2026-08-19"),
        withdrawalAssignment("p_b", "2026-08-19"),
        dayTechnicianShift("p_helper", { date: "2026-08-19" }),
      ],
      people: [person("p_helper", { isTechnician: true })],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_a", "user-a"],
        ["p_b", "user-b"],
        ["p_helper", "user-helper"],
      ]),
    });

    const teamJobs = upsertedFor("logistics_withdrawal_noon_team");
    expect(teamJobs).toHaveLength(1);
    expect(teamJobs[0].body).toContain("עושים");
  });

  it("repeated worker ticks are idempotent -- identical dedupe keys both times", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);
    const input = {
      events: [withdrawalAssignment("p_ethan", "2026-08-19")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([["p_ethan", "user-ethan"]]),
    };

    await runReminders(input);
    await runReminders(input);

    const jobs = upsertedFor("logistics_withdrawal_noon_assigned");
    expect(jobs).toHaveLength(2);
    expect(jobs[0].dedupeKey).toBe(jobs[1].dedupeKey);
  });

  it("dry_run computes counts but performs no store mutations", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    const summary = await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19"), daySupervisorShift("p_sup", { date: "2026-08-19" })],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: false,
      recipientResolution: resolutionFor([
        ["p_ethan", "user-ethan"],
        ["p_sup", "user-sup"],
      ]),
    });

    expect(summary.logisticsWithdrawalNoonAssignedJobs).toBe(1);
    expect(store.upsertPendingReminderJob).not.toHaveBeenCalled();
    expect(store.cancelPendingReminderJob).not.toHaveBeenCalled();
  });

  it("a person not resolvable to a Supabase account is skipped, never guessed (fails closed)", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-19", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-19")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 1, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toHaveLength(0);
  });

  it("works correctly across a Saturday -> Sunday operational-week boundary (noon reminders are calendar-date driven, not week-driven)", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-23", minuteOfDay: 600 }; // Sunday, new operational week
    const week = getOperationalWeek(now);

    await runReminders({
      events: [withdrawalAssignment("p_ethan", "2026-08-23")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([["p_ethan", "user-ethan"]]),
    });

    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toEqual([
      expect.objectContaining({ dedupeKey: "logistics_withdrawal_noon_assigned:2026-08-23:user-ethan" }),
    ]);
  });
});
