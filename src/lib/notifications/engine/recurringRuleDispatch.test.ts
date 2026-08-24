import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";
import type { LocalNow } from "@/lib/domain/localNow";
import type { CustomWeeklyRuleConfig } from "./ruleConfig";

const insertManagerNotificationBatchIfAbsent = vi.fn();
const insertNotificationJobIfAbsent = vi.fn();
const listExistingManagerNotificationBatchIdempotencyKeys = vi.fn<(keys: readonly string[]) => Promise<Set<string>>>(
  async () => new Set(),
);
const fetchAllUserIdsByEmail = vi.fn<() => Promise<Map<string, { userId: string; avatarUrl: string | null }>>>(
  async () => new Map(),
);
const fetchAllSubscribedUserIds = vi.fn<() => Promise<string[]>>(async () => []);

async function loadModule() {
  vi.doMock("./store", () => ({
    insertManagerNotificationBatchIfAbsent,
    insertNotificationJobIfAbsent,
    listExistingManagerNotificationBatchIdempotencyKeys,
  }));
  vi.doMock("./recipients", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./recipients")>();
    return { ...actual, fetchAllUserIdsByEmail, fetchAllSubscribedUserIds };
  });
  return import("./recurringRuleDispatch");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

function rule(overrides: Partial<CustomWeeklyRuleConfig> = {}): CustomWeeklyRuleConfig {
  return {
    id: "rule-1",
    enabled: true,
    weekday: 6, // Saturday
    localHour: 21,
    localMinute: 0,
    title: "📌 תזכורת לאילוצים",
    body: "body",
    audienceKind: "everyone",
    targetPersonIds: [],
    createdByPersonId: "mgr-1",
    createdByPersonName: "מנהל",
    ...overrides,
  };
}

function person(id: string, overrides: Partial<Person> = {}): Person {
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

describe("findDueCustomWeeklyOccurrences -- weekday/time due check", () => {
  it("is due once the configured weekday's configured time has passed", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const saturday2100 = rule({ weekday: 6, localHour: 21, localMinute: 0 });
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 21 * 60 }; // Saturday, exactly 21:00

    const due = await findDueCustomWeeklyOccurrences([saturday2100], now);

    expect(due).toHaveLength(1);
    expect(due[0].idempotencyKey).toBe("recurring:rule-1:2026-08-22");
  });

  it("is NOT due before the configured time on the correct weekday", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const saturday2100 = rule({ weekday: 6, localHour: 21, localMinute: 0 });
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 20 * 60 + 59 }; // Saturday 20:59

    const due = await findDueCustomWeeklyOccurrences([saturday2100], now);

    expect(due).toHaveLength(0);
  });

  it("is NOT due on a different weekday, even at/after the configured time", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const saturday2100 = rule({ weekday: 6, localHour: 21, localMinute: 0 });
    const now: LocalNow = { date: "2026-08-23", minuteOfDay: 22 * 60 }; // Sunday 22:00

    const due = await findDueCustomWeeklyOccurrences([saturday2100], now);

    expect(due).toHaveLength(0);
  });

  it("a disabled rule is never due, even on its configured weekday/time", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const disabled = rule({ enabled: false });
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 21 * 60 };

    const due = await findDueCustomWeeklyOccurrences([disabled], now);

    expect(due).toHaveLength(0);
  });

  it("an occurrence already dispatched (idempotency key already has a batch) is excluded -- repeated ticks send once", async () => {
    listExistingManagerNotificationBatchIdempotencyKeys.mockResolvedValue(new Set(["recurring:rule-1:2026-08-22"]));
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 21 * 60 };

    const due = await findDueCustomWeeklyOccurrences([rule()], now);

    expect(due).toHaveLength(0);
  });

  it("editing a rule's title/body/time AFTER its occurrence already dispatched does not resend the SAME local occurrence -- the idempotency key is keyed only on (ruleId, date)", async () => {
    listExistingManagerNotificationBatchIdempotencyKeys.mockResolvedValue(new Set(["recurring:rule-1:2026-08-22"]));
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    // Same rule id/date, but content and time already changed since the
    // original send -- the occurrence identity is unaffected.
    const editedRule = rule({ localHour: 22, localMinute: 0, title: "כותרת חדשה" });
    const now: LocalNow = { date: "2026-08-22", minuteOfDay: 22 * 60 };

    const due = await findDueCustomWeeklyOccurrences([editedRule], now);

    expect(due).toHaveLength(0);
  });

  it("no due occurrences never queries existing batches (cheap no-op on a quiet minute)", async () => {
    const { findDueCustomWeeklyOccurrences } = await loadModule();
    const now: LocalNow = { date: "2026-08-23", minuteOfDay: 0 }; // Sunday midnight -- no Saturday rule due

    const due = await findDueCustomWeeklyOccurrences([rule()], now);

    expect(due).toHaveLength(0);
    expect(listExistingManagerNotificationBatchIdempotencyKeys).not.toHaveBeenCalled();
  });
});

describe("runDueCustomWeeklyRuleDispatch -- audience resolution + at-most-once dispatch", () => {
  it("'everyone' resolves against the CURRENT roster passed in, never a frozen snapshot on the rule itself", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([
        ["a@example.com", { userId: "user-a", avatarUrl: null }],
        ["b@example.com", { userId: "user-b", avatarUrl: null }],
      ]),
    );
    insertManagerNotificationBatchIfAbsent.mockImplementation(async (batch) => ({
      row: { id: "batch-1", ...batch },
      created: true,
    }));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    const everyoneRule = rule({ audienceKind: "everyone", targetPersonIds: [] });
    const occurrence = { rule: everyoneRule, occurrenceDate: "2026-08-22", idempotencyKey: "recurring:rule-1:2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" }), person("p_b", { email: "b@example.com" })];

    const summary = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(summary).toEqual({ dispatched: 1, failed: 0 });
    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedRecipientUserIds: ["user-a", "user-b"] }),
    );
  });

  it("selected 'people' audience is revalidated against the current roster -- a person no longer in the roster is skipped truthfully, never fails the whole occurrence", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    insertManagerNotificationBatchIfAbsent.mockImplementation(async (batch) => ({
      row: { id: "batch-1", ...batch },
      created: true,
    }));
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    // "p_removed" is a stale id (e.g. that person left the roster since the
    // rule was created) -- it must never inject an unresolvable/invalid id.
    const selectedRule = rule({ audienceKind: "people", targetPersonIds: ["p_a", "p_removed"] });
    const occurrence = { rule: selectedRule, occurrenceDate: "2026-08-22", idempotencyKey: "recurring:rule-1:2026-08-22" };
    const people = [person("p_a", { email: "a@example.com" })]; // p_removed is genuinely absent

    const summary = await runDueCustomWeeklyRuleDispatch([occurrence], people);

    expect(summary).toEqual({ dispatched: 1, failed: 0 });
    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedRecipientUserIds: ["user-a"], unresolvedCount: 1 }),
    );
  });

  it("concurrent dispatch of the SAME occurrence (idempotency key already won by another invocation) reuses the ALREADY-stored batch, never re-resolves or duplicates", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    insertManagerNotificationBatchIfAbsent.mockResolvedValue({
      row: {
        id: "batch-existing",
        resolvedRecipientUserIds: ["user-a", "user-b"], // the winning invocation's frozen set
        title: "original title",
        body: "original body",
      },
      created: false, // lost the race -- someone else already created this batch
    });
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    const occurrence = { rule: rule({ title: "a different title this call resolved" }), occurrenceDate: "2026-08-22", idempotencyKey: "recurring:rule-1:2026-08-22" };
    await runDueCustomWeeklyRuleDispatch([occurrence], [person("p_a", { email: "a@example.com" })]);

    // Job creation uses the STORED batch's frozen recipients/copy, not this
    // call's own (possibly different) resolution.
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "user-a", title: "original title", dedupeKey: "recurring:batch-existing:user-a" }),
    );
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "user-b", title: "original title", dedupeKey: "recurring:batch-existing:user-b" }),
    );
  });

  it("one occurrence's dispatch failure never blocks the others -- independently caught and counted", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(new Map([["a@example.com", { userId: "user-a", avatarUrl: null }]]));
    insertManagerNotificationBatchIfAbsent
      .mockRejectedValueOnce(new Error("db error"))
      .mockResolvedValueOnce({ row: { id: "batch-2", resolvedRecipientUserIds: ["user-a"], title: "t", body: "b" }, created: true });
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    const occurrences = [
      { rule: rule({ id: "rule-1" }), occurrenceDate: "2026-08-22", idempotencyKey: "recurring:rule-1:2026-08-22" },
      { rule: rule({ id: "rule-2" }), occurrenceDate: "2026-08-22", idempotencyKey: "recurring:rule-2:2026-08-22" },
    ];
    const summary = await runDueCustomWeeklyRuleDispatch(occurrences, [person("p_a", { email: "a@example.com" })]);

    expect(summary).toEqual({ dispatched: 1, failed: 1 });
  });

  it("zero due occurrences performs zero I/O", async () => {
    const { runDueCustomWeeklyRuleDispatch } = await loadModule();

    const summary = await runDueCustomWeeklyRuleDispatch([], []);

    expect(summary).toEqual({ dispatched: 0, failed: 0 });
    expect(fetchAllUserIdsByEmail).not.toHaveBeenCalled();
    expect(insertManagerNotificationBatchIfAbsent).not.toHaveBeenCalled();
  });
});
