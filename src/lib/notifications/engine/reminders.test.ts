import { afterEach, describe, expect, it, vi } from "vitest";
import type { DutyFamily, Event } from "@/lib/domain/event";
import { buildShiftSchedule } from "@/lib/domain/shiftSchedule";
import { getOperationalWeek } from "@/lib/domain/operationalWeek";
import type { LocalNow } from "@/lib/domain/localNow";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";
import { resolveMotzashShabbatInstant } from "@/lib/time/motzashShabbat";
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
const fetchAllAuthUserIds = vi.fn(async () => [] as string[]);

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule() {
  vi.doMock("./store", () => store);
  vi.doMock("./recipients", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./recipients")>();
    return { ...actual, fetchAllSubscribedUserIds, fetchAllAuthUserIds };
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

  it("two same-day shifts for one person (different periods) get distinct dedupe keys AND distinct Push tags", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [
        event({ personId: "p1", date: "2026-08-19", category: "shift", period: "day" }),
        event({ personId: "p1", date: "2026-08-19", category: "shift", period: "night" }),
      ],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    const jobs = store.upsertPendingReminderJob.mock.calls.map((call) => call[0]);
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.dedupeKey)).size).toBe(2);
    expect(new Set(jobs.map((job) => job.tag)).size).toBe(2);
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

  it("two concurrent tomorrow-duty families for one person get distinct dedupe keys AND distinct Push tags", async () => {
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-18", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [
        event({ personId: "p1", date: "2026-08-19", category: "duty", dutyFamily: "guard" }),
        event({ personId: "p1", date: "2026-08-19", category: "duty", dutyFamily: "oxid" }),
      ],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    const jobs = store.upsertPendingReminderJob.mock.calls
      .map((call) => call[0])
      .filter((job) => job.category === "tomorrow_duty");
    expect(jobs).toHaveLength(2);
    expect(new Set(jobs.map((job) => job.dedupeKey)).size).toBe(2);
    expect(new Set(jobs.map((job) => job.tag)).size).toBe(2);
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
  it("creates a Sunday reminder for every real auth account, only on Sunday", async () => {
    fetchAllAuthUserIds.mockResolvedValue(["user-a", "user-b"]);
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
    fetchAllAuthUserIds.mockResolvedValue(["user-a"]);
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
    fetchAllAuthUserIds.mockResolvedValue(["user-a"]);
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
    expect(fetchAllAuthUserIds).not.toHaveBeenCalled();
  });

  it("Sunday/Monday titles, bodies, timing, and path are unchanged by the audience-source fix", async () => {
    fetchAllAuthUserIds.mockResolvedValue(["user-a"]);
    let { runReminders } = await loadModule();
    let now: LocalNow = { date: "2026-08-16", minuteOfDay: 1080 }; // Sunday
    let week = getOperationalWeek(now);

    await runReminders({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

    expect(store.insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "📌 תזכורת לאילוצים",
        body: "יש אילוץ לשבוע הבא? אפשר לשלוח עד מחר.",
        path: "/",
        scheduledFor: jerusalemLocalTimeToInstant("2026-08-16", 18, 0).toISOString(),
      }),
    );

    store.insertNotificationJobIfAbsent.mockClear();
    fetchAllAuthUserIds.mockResolvedValue(["user-a"]);
    ({ runReminders } = await loadModule());
    now = { date: "2026-08-17", minuteOfDay: 600 }; // Monday
    week = getOperationalWeek(now);

    await runReminders({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

    expect(store.insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "⏳ היום האחרון לאילוצים",
        body: "אפשר לשלוח אילוצים לשבוע הבא עד סוף היום.",
        path: "/",
        scheduledFor: jerusalemLocalTimeToInstant("2026-08-17", 9, 0).toISOString(),
      }),
    );
  });

  it("never queries push-subscription state for recipient targeting -- fetchAllSubscribedUserIds is untouched by this category", async () => {
    fetchAllAuthUserIds.mockResolvedValue(["user-a"]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-16", minuteOfDay: 1080 }; // Sunday
    const week = getOperationalWeek(now);

    await runReminders({
      events: [],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: { resolved: new Map(), unmappedCount: 0, ambiguousEmailCount: 0, noEmailCount: 0 },
    });

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

  it("no assignee: supervisor gets the anti-spam warning, and NO technician-wide push exists at 20:00 at all (Sunday evening -> Monday, a genuine logistics-withdrawal date)", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-16", minuteOfDay: 1200 }; // Sunday
    const week = getOperationalWeek(now);

    await runReminders({
      events: [daySupervisorShift("p_sup", { date: "2026-08-17" }), dayTechnicianShift("p_tech", { date: "2026-08-17" })],
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
    const now: LocalNow = { date: "2026-08-17", minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [daySupervisorShift("p_sup", { date: "2026-08-17" }), dayTechnicianShift("p_tech", { date: "2026-08-17" })],
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
    const now: LocalNow = { date: "2026-08-17", minuteOfDay: 480 }; // 08:00 -- still unassigned
    const week = getOperationalWeek(now);
    const events = [daySupervisorShift("p_sup", { date: "2026-08-17" }), dayTechnicianShift("p_tech", { date: "2026-08-17" })];
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
      if (prefix === "logistics_withdrawal_noon_supervisor:2026-08-17:") return ["logistics_withdrawal_noon_supervisor:2026-08-17:user-sup"];
      if (prefix === "logistics_withdrawal_noon_team:2026-08-17:") return ["logistics_withdrawal_noon_team:2026-08-17:user-tech"];
      return [];
    });

    await runReminders({
      events: [...events, withdrawalAssignment("p_ethan", "2026-08-17")],
      people,
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution,
    });

    // The supervisor's fallback warning is no longer valid -- cancelled.
    expect(upsertedFor("logistics_withdrawal_noon_supervisor")).toHaveLength(0);
    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith("logistics_withdrawal_noon_supervisor:2026-08-17:user-sup");
    // p_tech is STILL a valid team recipient (still eligible) -- their job
    // is re-upserted with fresh "help Ethan" content, never cancelled.
    expect(store.cancelPendingReminderJob).not.toHaveBeenCalledWith("logistics_withdrawal_noon_team:2026-08-17:user-tech");
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

describe("runReminders -- logistics-withdrawal fallback only ever exists for Monday", () => {
  // 2026-08-16=Sun, 17=Mon, 18=Tue, 19=Wed, 20=Thu, 21=Fri, 22=Sat.
  const NON_MONDAY_DATES = ["2026-08-16", "2026-08-18", "2026-08-19", "2026-08-20", "2026-08-21", "2026-08-22"];

  it("no fallback job of any kind is created for an unassigned NON-Monday date, noon", async () => {
    for (const date of NON_MONDAY_DATES) {
      store.upsertPendingReminderJob.mockClear();
      store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
      const { runReminders } = await loadModule();
      const now: LocalNow = { date, minuteOfDay: 600 };
      const week = getOperationalWeek(now);

      await runReminders({
        events: [daySupervisorShift("p_sup", { date }), dayTechnicianShift("p_tech", { date })],
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

      expect(upsertedFor("logistics_withdrawal_noon_supervisor")).toEqual([]);
      expect(upsertedFor("logistics_withdrawal_noon_team")).toEqual([]);
    }
  });

  it("no fallback job of any kind is created when TOMORROW (the target date) is not a Monday, 20:00", async () => {
    // now=Monday (17th) -> tomorrow=Tuesday (18th, non-Monday) is the one
    // case worth singling out: the EVENING of a genuine withdrawal Monday
    // itself must not produce a fallback for the day AFTER it.
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const now: LocalNow = { date: "2026-08-17", minuteOfDay: 1200 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [daySupervisorShift("p_sup", { date: "2026-08-18" }), dayTechnicianShift("p_tech", { date: "2026-08-18" })],
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

    expect(upsertedFor("tomorrow_logistics_withdrawal_supervisor")).toEqual([]);
  });

  it("an explicit 'משיכות' Event on a non-Monday still gets the FULL normal coordination treatment (an intentional exceptional withdrawal)", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [
        withdrawalAssignment("p_ethan", wednesday),
        daySupervisorShift("p_sup", { date: wednesday }),
        dayTechnicianShift("p_helper", { date: wednesday }),
      ],
      people: [person("p_helper", { isTechnician: true })],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionFor([
        ["p_ethan", "user-ethan"],
        ["p_sup", "user-sup"],
        ["p_helper", "user-helper"],
      ]),
    });

    expect(upsertedFor("logistics_withdrawal_noon_assigned")).toHaveLength(1);
    expect(upsertedFor("logistics_withdrawal_noon_team")).toEqual([
      expect.objectContaining({ recipientUserId: "user-helper", title: "🤝 משיכות היום" }),
    ]);
  });
});

// Known week used throughout this suite (also used above):
// Sun 2026-08-16, Mon 08-17, Tue 08-18, Wed 08-19, Thu 08-20, Fri 08-21, Sat 08-22.

function dutyEvent(personId: string, date: string, dutyFamily: DutyFamily, overrides: Partial<Event> = {}): Event {
  return event({ personId, date, category: "duty", dutyFamily, ...overrides });
}

describe("runReminders -- עלמ״ש check-in reminder (שמירה / עתודה / אוקסיד only)", () => {
  it.each<[DutyFamily, string]>([
    ["guard", "שמירה"],
    ["reserve", "עתודה"],
    ["oxid", "אוקסיד"],
  ])("creates the correct עלמ״ש reminder for %s (%s)", async (dutyFamily, label) => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [dutyEvent("p1", wednesday, dutyFamily)],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(upsertedFor("almash_check_in")).toEqual([
      expect.objectContaining({
        category: "almash_check_in",
        recipientUserId: "user-p1",
        title: "🫡 עלמ״ש בעוד רבע שעה",
        body: `יש לך היום עלמ״ש ל${label} — מתחילים ב־13:00`,
        path: "/duties",
        dedupeKey: `almash_check_in:${wednesday}:user-p1:${dutyFamily}:`,
        scheduledFor: jerusalemLocalTimeToInstant(wednesday, 12, 45).toISOString(),
      }),
    ]);
  });

  it.each<DutyFamily>(["rasar", "callup", "full_kitchen", "daily_kitchen", "weekend_kitchen", "evacuation_on_call"])(
    "never fires for %s -- only שמירה/עתודה/אוקסיד qualify, even though deriveDutyActions() itself has a check-in for this family too",
    async (dutyFamily) => {
      store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
      const { runReminders } = await loadModule();
      const wednesday = "2026-08-19";
      const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
      const week = getOperationalWeek(now);

      await runReminders({
        events: [dutyEvent("p1", wednesday, dutyFamily)],
        people: [],
        shiftSchedule: schedule,
        week,
        now,
        persist: true,
        recipientResolution: resolutionWith("p1", "user-p1"),
      });

      expect(upsertedFor("almash_check_in")).toEqual([]);
    },
  );

  it("a 3-day guard duty gets a check-in on day 1 and day 2, never on the final day", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const threeDayEvents = [
      dutyEvent("p1", "2026-08-19", "guard"),
      dutyEvent("p1", "2026-08-20", "guard"),
      dutyEvent("p1", "2026-08-21", "guard"),
    ];

    for (const [today, expectFires] of [
      ["2026-08-19", true],
      ["2026-08-20", true],
      ["2026-08-21", false],
    ] as const) {
      store.upsertPendingReminderJob.mockClear();
      const { runReminders } = await loadModule();
      const now: LocalNow = { date: today, minuteOfDay: 600 };
      const week = getOperationalWeek(now);

      await runReminders({
        events: threeDayEvents,
        people: [],
        shiftSchedule: schedule,
        week,
        now,
        persist: true,
        recipientResolution: resolutionWith("p1", "user-p1"),
      });

      expect(upsertedFor("almash_check_in")).toHaveLength(expectFires ? 1 : 0);
    }
  });

  it("a single-day duty behaves like day 1 of a multi-day block -- it still gets its one check-in", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [dutyEvent("p1", wednesday, "oxid")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(upsertedFor("almash_check_in")).toHaveLength(1);
  });

  it("Friday is scheduled at 12:45 Jerusalem, same as any other weekday -- only Saturday is special", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const friday = "2026-08-21";
    const now: LocalNow = { date: friday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [dutyEvent("p1", friday, "guard")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(upsertedFor("almash_check_in")).toEqual([
      expect.objectContaining({ scheduledFor: jerusalemLocalTimeToInstant(friday, 12, 45).toISOString() }),
    ]);
  });

  it("Saturday uses the real resolved מוצ״ש instant and the Saturday-specific copy, never 12:45/13:00", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const saturday = "2026-08-22";
    const now: LocalNow = { date: saturday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [dutyEvent("p1", saturday, "guard")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    const expectedMotzash = resolveMotzashShabbatInstant(saturday)!.toISOString();
    // Sanity: genuinely different from what 12:45 that day would have been.
    expect(expectedMotzash).not.toBe(jerusalemLocalTimeToInstant(saturday, 12, 45).toISOString());

    expect(upsertedFor("almash_check_in")).toEqual([
      expect.objectContaining({
        title: "🫡 הגיע הזמן לעלמ״ש",
        body: "יש לך הערב עלמ״ש לשמירה",
        scheduledFor: expectedMotzash,
      }),
    ]);
  });

  it("repeated ticks with the same input use the identical dedupe key -- no duplicates, upsert-idempotent", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);
    const input = {
      events: [dutyEvent("p1", wednesday, "reserve")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    };

    const { runReminders: tick1 } = await loadModule();
    await tick1(input);
    const firstKey = upsertedFor("almash_check_in")[0]?.dedupeKey;

    const { runReminders: tick2 } = await loadModule();
    await tick2(input);
    const secondKey = upsertedFor("almash_check_in")[0]?.dedupeKey;

    expect(firstKey).toBeDefined();
    expect(secondKey).toBe(firstKey);
  });

  it("cancels a still-pending עלמ״ש job whose qualifying duty disappeared before send", async () => {
    const staleKey = "almash_check_in:2026-08-19:user-p1:guard:";
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([staleKey]);
    const { runReminders } = await loadModule();
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [], // the duty no longer exists
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    expect(store.cancelPendingReminderJob).toHaveBeenCalledWith(staleKey);
  });

  it("never creates a job for a person who cannot be resolved to an auth user -- same recipient-resolution rule as every other reminder", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [dutyEvent("p_unmapped", wednesday, "guard")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"), // p_unmapped is NOT in the resolution
    });

    expect(upsertedFor("almash_check_in")).toEqual([]);
  });

  it("two qualifying same-day duty families for one person produce two distinct jobs AND two distinct Push tags -- the service worker collapses same-tag pushes at the OS level (public/sw.js), so a coarser tag would silently drop one", async () => {
    store.listPendingJobDedupeKeysByPrefix.mockResolvedValue([]);
    const { runReminders } = await loadModule();
    const wednesday = "2026-08-19";
    const now: LocalNow = { date: wednesday, minuteOfDay: 600 };
    const week = getOperationalWeek(now);

    await runReminders({
      events: [dutyEvent("p1", wednesday, "guard"), dutyEvent("p1", wednesday, "oxid")],
      people: [],
      shiftSchedule: schedule,
      week,
      now,
      persist: true,
      recipientResolution: resolutionWith("p1", "user-p1"),
    });

    const jobs = upsertedFor("almash_check_in");
    expect(jobs).toHaveLength(2);

    const dedupeKeys = jobs.map((job) => job.dedupeKey);
    const tags = jobs.map((job) => job.tag);
    expect(new Set(dedupeKeys).size).toBe(2);
    expect(new Set(tags).size).toBe(2);
  });
});
