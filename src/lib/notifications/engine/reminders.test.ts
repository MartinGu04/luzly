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
  listPendingJobDedupeKeysByPrefix: vi.fn(async () => [] as string[]),
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
      body: "מחר אתה משובץ למשיכות מהלוגיסטיקה.",
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
