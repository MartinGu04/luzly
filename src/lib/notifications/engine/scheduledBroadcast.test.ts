import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

const insertManagerScheduledBroadcast = vi.fn();
const getManagerScheduledBroadcastById = vi.fn();
const updateManagerScheduledBroadcastIfEditable = vi.fn();
const cancelManagerScheduledBroadcastIfEditable = vi.fn();
const claimDueManagerScheduledBroadcasts = vi.fn();
const claimManagerScheduledBroadcastNow = vi.fn();
const setManagerScheduledBroadcastBatchId = vi.fn();
const markManagerScheduledBroadcastDispatched = vi.fn();
const insertManagerNotificationBatchIfAbsent = vi.fn();
const getManagerNotificationBatchById = vi.fn();
const insertNotificationJobIfAbsent = vi.fn();

const fetchAllUserIdsByEmail = vi.fn();
const fetchAllSubscribedUserIds = vi.fn();
const resolvePersonIdentity = vi.fn();

async function loadModule() {
  vi.doMock("./store", () => ({
    insertManagerScheduledBroadcast,
    getManagerScheduledBroadcastById,
    updateManagerScheduledBroadcastIfEditable,
    cancelManagerScheduledBroadcastIfEditable,
    claimDueManagerScheduledBroadcasts,
    claimManagerScheduledBroadcastNow,
    setManagerScheduledBroadcastBatchId,
    markManagerScheduledBroadcastDispatched,
    insertManagerNotificationBatchIfAbsent,
    getManagerNotificationBatchById,
    insertNotificationJobIfAbsent,
  }));
  vi.doMock("./recipients", () => ({ fetchAllUserIdsByEmail, fetchAllSubscribedUserIds, resolvePersonIdentity }));
  return import("./scheduledBroadcast");
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const MANAGER = person({ id: "p_manager", name: "דני מנהל", isManager: true });
const PERSON_A = person({ id: "p_a", name: "אלון", email: "alon@example.invalid" });
const PERSON_B = person({ id: "p_b", name: "בר", email: "bar@example.invalid" });

// A moment safely in the future relative to any real clock -- avoids
// flaky failures from the "must be in the future" validation.
const FUTURE_YEAR = new Date().getFullYear() + 5;
const FUTURE_DATE = `${FUTURE_YEAR}-08-23`;

function scheduledRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sb_1",
    status: "scheduled",
    audienceKind: "people",
    targetPersonIds: ["p_a", "p_b"],
    title: "כותרת",
    body: "תוכן",
    scheduledFor: "2026-08-23T17:00:00.000Z",
    createdByPersonId: "p_manager",
    createdByPersonName: "דני מנהל",
    lastChangedByPersonId: null,
    lastChangedByPersonName: null,
    cancelledByPersonId: null,
    cancelledByPersonName: null,
    claimedAt: "2026-08-23T17:00:01.000Z",
    batchId: null,
    dispatchedAt: null,
    cancelledAt: null,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-23T17:00:01.000Z",
    ...overrides,
  };
}

describe("createScheduledBroadcast -- validation (mirrors the immediate-send engine's own rules)", () => {
  it("rejects a blank title without touching the store", async () => {
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast({
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "  ",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "invalid_title" });
    expect(insertManagerScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("rejects an unknown target id (fails closed, never shrinks the audience)", async () => {
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast({
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_ghost"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "invalid_targets" });
  });

  it("rejects a moment in the past", async () => {
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast({
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: "2020-01-01",
      scheduledHour: 8,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "invalid_schedule" });
  });

  it("rejects an out-of-range hour/minute and an invalid calendar date", async () => {
    const { createScheduledBroadcast } = await loadModule();
    const base = {
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person" as const,
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
    };
    expect(await createScheduledBroadcast({ ...base, scheduledDate: FUTURE_DATE, scheduledHour: 24, scheduledMinute: 0 })).toEqual({
      ok: false,
      error: "invalid_schedule",
    });
    expect(await createScheduledBroadcast({ ...base, scheduledDate: FUTURE_DATE, scheduledHour: 20, scheduledMinute: 60 })).toEqual({
      ok: false,
      error: "invalid_schedule",
    });
    expect(
      await createScheduledBroadcast({ ...base, scheduledDate: `${FUTURE_YEAR}-02-30`, scheduledHour: 20, scheduledMinute: 0 }),
    ).toEqual({ ok: false, error: "invalid_schedule" });
  });

  it("on success, freezes 'everyone' into the full current roster's ids and creates NO notification_jobs", async () => {
    insertManagerScheduledBroadcast.mockResolvedValue(scheduledRow({ audienceKind: "everyone", targetPersonIds: ["p_manager", "p_a", "p_b"] }));
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast({
      manager: MANAGER,
      people: [MANAGER, PERSON_A, PERSON_B],
      audienceKind: "everyone",
      targetPersonIds: [],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });

    expect(result.ok).toBe(true);
    expect(insertManagerScheduledBroadcast).toHaveBeenCalledWith(
      expect.objectContaining({ audienceKind: "everyone", targetPersonIds: ["p_manager", "p_a", "p_b"] }),
    );
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
    expect(insertManagerNotificationBatchIfAbsent).not.toHaveBeenCalled();
  });
});

describe("editScheduledBroadcast -- guarded by 'scheduled' state at the store layer", () => {
  it("does not call the store at all when validation fails first", async () => {
    const { editScheduledBroadcast } = await loadModule();
    const result = await editScheduledBroadcast("sb_1", {
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "invalid_title" });
    expect(updateManagerScheduledBroadcastIfEditable).not.toHaveBeenCalled();
  });

  it("returns the updated row on success", async () => {
    updateManagerScheduledBroadcastIfEditable.mockResolvedValue(scheduledRow({ title: "כותרת חדשה" }));
    const { editScheduledBroadcast } = await loadModule();
    const result = await editScheduledBroadcast("sb_1", {
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת חדשה",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ title: "כותרת חדשה" }) });
  });

  it("fails truthfully with 'already_started' once dispatch has claimed it", async () => {
    updateManagerScheduledBroadcastIfEditable.mockResolvedValue(null);
    getManagerScheduledBroadcastById.mockResolvedValue(scheduledRow({ status: "claimed" }));
    const { editScheduledBroadcast } = await loadModule();
    const result = await editScheduledBroadcast("sb_1", {
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "already_started" });
  });

  it("distinguishes 'already_cancelled' from 'already_started'", async () => {
    updateManagerScheduledBroadcastIfEditable.mockResolvedValue(null);
    getManagerScheduledBroadcastById.mockResolvedValue(scheduledRow({ status: "cancelled" }));
    const { editScheduledBroadcast } = await loadModule();
    const result = await editScheduledBroadcast("sb_1", {
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "already_cancelled" });
  });

  it("reports 'not_found' when the row no longer exists at all", async () => {
    updateManagerScheduledBroadcastIfEditable.mockResolvedValue(null);
    getManagerScheduledBroadcastById.mockResolvedValue(null);
    const { editScheduledBroadcast } = await loadModule();
    const result = await editScheduledBroadcast("sb_missing", {
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: FUTURE_DATE,
      scheduledHour: 20,
      scheduledMinute: 0,
    });
    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("cancelScheduledBroadcast", () => {
  it("succeeds while still scheduled", async () => {
    cancelManagerScheduledBroadcastIfEditable.mockResolvedValue(scheduledRow({ status: "cancelled" }));
    const { cancelScheduledBroadcast } = await loadModule();
    const result = await cancelScheduledBroadcast("sb_1", MANAGER);
    expect(result).toEqual({ ok: true });
  });

  it("fails truthfully once already dispatched", async () => {
    cancelManagerScheduledBroadcastIfEditable.mockResolvedValue(null);
    getManagerScheduledBroadcastById.mockResolvedValue(scheduledRow({ status: "dispatched" }));
    const { cancelScheduledBroadcast } = await loadModule();
    const result = await cancelScheduledBroadcast("sb_1", MANAGER);
    expect(result).toEqual({ ok: false, error: "already_started" });
  });
});

describe("dispatchScheduledBroadcast -- fresh dispatch", () => {
  it("resolves only the stored snapshot, never re-validates it against the full roster: a since-removed person becomes unresolved, not a whole-request failure", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([["alon@example.invalid", { userId: "u_a", avatarUrl: null }]]),
    );
    fetchAllSubscribedUserIds.mockResolvedValue(["u_a"]);
    resolvePersonIdentity.mockImplementation((p: Person) =>
      p.id === "p_a" ? { status: "mapped", normalizedEmail: "alon@example.invalid", userId: "u_a", avatarUrl: null } : { status: "no_email" },
    );
    insertManagerNotificationBatchIfAbsent.mockResolvedValue({
      row: {
        id: "batch_1",
        idempotencyKey: "scheduled:sb_1",
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
        audienceKind: "people",
        targetPersonIds: ["p_a", "p_b"],
        resolvedRecipientUserIds: ["u_a"],
        title: "כותרת",
        body: "תוכן",
        resolvedRecipientCount: 1,
        pushCapableCount: 1,
        inboxOnlyCount: 0,
        unresolvedCount: 1,
        createdAt: "2026-08-23T17:00:01.000Z",
      },
      created: true,
    });

    const { dispatchScheduledBroadcast } = await loadModule();
    // p_b is no longer in the fresh roster -- only p_a (and the manager) are.
    const row = scheduledRow({ targetPersonIds: ["p_a", "p_b"] });
    const outcome = await dispatchScheduledBroadcast(row as never, [MANAGER, PERSON_A]);

    expect(outcome).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "scheduled:sb_1",
        targetPersonIds: ["p_a", "p_b"],
        resolvedRecipientUserIds: ["u_a"],
        unresolvedCount: 1,
      }),
    );
    expect(setManagerScheduledBroadcastBatchId).toHaveBeenCalledWith("sb_1", "batch_1");
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientUserId: "u_a", dedupeKey: "manual:batch_1:u_a", category: "manager_broadcast" }),
    );
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledWith("sb_1");
  });

  it("fails closed with idempotency_conflict when a reused key's stored batch has genuinely different content, and never marks the schedule dispatched", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(new Map());
    fetchAllSubscribedUserIds.mockResolvedValue([]);
    resolvePersonIdentity.mockReturnValue({ status: "no_email" });
    insertManagerNotificationBatchIfAbsent.mockResolvedValue({
      row: {
        id: "batch_1",
        idempotencyKey: "scheduled:sb_1",
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
        audienceKind: "people",
        targetPersonIds: ["p_a", "p_b"],
        resolvedRecipientUserIds: [],
        title: "כותרת אחרת לגמרי", // mismatched vs. row.title below
        body: "תוכן",
        resolvedRecipientCount: 0,
        pushCapableCount: 0,
        inboxOnlyCount: 0,
        unresolvedCount: 2,
        createdAt: "2026-08-23T17:00:01.000Z",
      },
      created: false,
    });

    const { dispatchScheduledBroadcast } = await loadModule();
    const row = scheduledRow({ title: "כותרת" });
    const outcome = await dispatchScheduledBroadcast(row as never, [MANAGER, PERSON_A, PERSON_B]);

    expect(outcome).toEqual({ ok: false, error: "idempotency_conflict" });
    expect(setManagerScheduledBroadcastBatchId).not.toHaveBeenCalled();
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
    expect(markManagerScheduledBroadcastDispatched).not.toHaveBeenCalled();
  });
});

describe("dispatchScheduledBroadcast -- resuming after a crash checkpoint", () => {
  it("when batch_id is already set, reuses the EXISTING batch's frozen recipient set and never re-resolves recipients", async () => {
    getManagerNotificationBatchById.mockResolvedValue({
      id: "batch_1",
      idempotencyKey: "scheduled:sb_1",
      createdByPersonId: "p_manager",
      createdByPersonName: "דני מנהל",
      audienceKind: "people",
      targetPersonIds: ["p_a", "p_b"],
      resolvedRecipientUserIds: ["u_a", "u_b"],
      title: "כותרת",
      body: "תוכן",
      resolvedRecipientCount: 2,
      pushCapableCount: 2,
      inboxOnlyCount: 0,
      unresolvedCount: 0,
      createdAt: "2026-08-23T17:00:01.000Z",
    });

    const { dispatchScheduledBroadcast } = await loadModule();
    const row = scheduledRow({ batchId: "batch_1" });
    const outcome = await dispatchScheduledBroadcast(row as never, [MANAGER, PERSON_A, PERSON_B]);

    expect(outcome).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 2 });
    expect(fetchAllUserIdsByEmail).not.toHaveBeenCalled();
    expect(insertManagerNotificationBatchIfAbsent).not.toHaveBeenCalled();
    expect(setManagerScheduledBroadcastBatchId).not.toHaveBeenCalled();
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(2);
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledWith("sb_1");
  });
});

describe("runDueScheduledBroadcastDispatch -- the worker tick's own phase", () => {
  it("claims due broadcasts and dispatches each sequentially, summarizing successes/failures", async () => {
    claimDueManagerScheduledBroadcasts.mockResolvedValue([
      scheduledRow({ id: "sb_1" }),
      scheduledRow({ id: "sb_2" }),
    ]);
    fetchAllUserIdsByEmail.mockResolvedValue(new Map());
    fetchAllSubscribedUserIds.mockResolvedValue([]);
    resolvePersonIdentity.mockReturnValue({ status: "no_email" });

    insertManagerNotificationBatchIfAbsent
      .mockResolvedValueOnce({
        row: {
          id: "batch_1",
          idempotencyKey: "scheduled:sb_1",
          createdByPersonId: "p_manager",
          createdByPersonName: "דני מנהל",
          audienceKind: "people",
          targetPersonIds: ["p_a", "p_b"],
          resolvedRecipientUserIds: [],
          title: "כותרת",
          body: "תוכן",
          resolvedRecipientCount: 0,
          pushCapableCount: 0,
          inboxOnlyCount: 0,
          unresolvedCount: 2,
          createdAt: "2026-08-23T17:00:01.000Z",
        },
        created: true,
      })
      .mockResolvedValueOnce({
        // A reused idempotency key whose STORED content differs from sb_2's
        // own frozen fields -- unreachable in real operation (see
        // `dispatchScheduledBroadcast`'s own docs) but exercises the
        // fail-closed guard's effect on this loop's own counting.
        row: {
          id: "batch_2",
          idempotencyKey: "scheduled:sb_2",
          createdByPersonId: "p_manager",
          createdByPersonName: "דני מנהל",
          audienceKind: "people",
          targetPersonIds: ["p_a", "p_b"],
          resolvedRecipientUserIds: [],
          title: "כותרת שונה לגמרי",
          body: "תוכן",
          resolvedRecipientCount: 0,
          pushCapableCount: 0,
          inboxOnlyCount: 0,
          unresolvedCount: 2,
          createdAt: "2026-08-23T17:00:01.000Z",
        },
        created: false,
      });

    const { runDueScheduledBroadcastDispatch } = await loadModule();
    const summary = await runDueScheduledBroadcastDispatch([MANAGER, PERSON_A, PERSON_B]);

    expect(summary).toEqual({ claimed: 2, dispatched: 1, failed: 1 });
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledTimes(1);
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledWith("sb_1");
  });
});

describe("sendScheduledBroadcastNow -- 'שלח עכשיו' uses the SAME dispatch path", () => {
  it("fails truthfully when the single-row claim finds nothing claimable", async () => {
    claimManagerScheduledBroadcastNow.mockResolvedValue(null);
    getManagerScheduledBroadcastById.mockResolvedValue(scheduledRow({ status: "dispatched" }));
    const { sendScheduledBroadcastNow } = await loadModule();
    const outcome = await sendScheduledBroadcastNow("sb_1", [MANAGER, PERSON_A]);
    expect(outcome).toEqual({ ok: false, error: "already_started" });
  });

  it("on a successful claim, dispatches through the identical dispatch function", async () => {
    claimManagerScheduledBroadcastNow.mockResolvedValue(scheduledRow({ batchId: "batch_1" }));
    getManagerNotificationBatchById.mockResolvedValue({
      id: "batch_1",
      idempotencyKey: "scheduled:sb_1",
      createdByPersonId: "p_manager",
      createdByPersonName: "דני מנהל",
      audienceKind: "people",
      targetPersonIds: ["p_a", "p_b"],
      resolvedRecipientUserIds: ["u_a"],
      title: "כותרת",
      body: "תוכן",
      resolvedRecipientCount: 1,
      pushCapableCount: 1,
      inboxOnlyCount: 0,
      unresolvedCount: 0,
      createdAt: "2026-08-23T17:00:01.000Z",
    });

    const { sendScheduledBroadcastNow } = await loadModule();
    const outcome = await sendScheduledBroadcastNow("sb_1", [MANAGER, PERSON_A, PERSON_B]);

    expect(outcome).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledWith("sb_1");
  });
});
