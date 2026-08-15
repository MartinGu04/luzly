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
