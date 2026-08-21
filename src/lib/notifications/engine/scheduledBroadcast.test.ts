import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";
import { jerusalemLocalTimeToInstant } from "@/lib/time/jerusalemClock";

function person(overrides: Partial<Person> & Pick<Person, "id" | "name">): Person {
  return { email: null, isManager: false, isTechnician: false, isSupervisor: false, personnelType: null, ...overrides };
}

const insertManagerScheduledBroadcastIfAbsent = vi.fn();
const getManagerScheduledBroadcastByCreateIdempotencyKey = vi.fn();
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
    insertManagerScheduledBroadcastIfAbsent,
    getManagerScheduledBroadcastByCreateIdempotencyKey,
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

beforeEach(() => {
  // Default: no prior create attempt under this key -- most tests exercise
  // a genuinely NEW create; the idempotency-specific describe block below
  // overrides this per test.
  getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

const MANAGER = person({ id: "p_manager", name: "דני מנהל", isManager: true });
const MANAGER_B = person({ id: "p_manager_b", name: "רותם מנהלת", isManager: true });
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
    sentNowByPersonId: null,
    sentNowByPersonName: null,
    sentNowAt: null,
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
      createIdempotencyKey: "idem-create-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_title" });
    expect(insertManagerScheduledBroadcastIfAbsent).not.toHaveBeenCalled();
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
      createIdempotencyKey: "idem-create-1",
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
      createIdempotencyKey: "idem-create-1",
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
      createIdempotencyKey: "idem-create-1",
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

  it("fails closed on a local Asia/Jerusalem wall-clock time that does not exist -- the spring-forward DST gap -- rather than silently shifting it to a different instant", async () => {
    const { createScheduledBroadcast } = await loadModule();
    // Asia/Jerusalem's 2027 spring DST transition jumps 01:59 -> 03:00 on
    // 2027-03-26, so 02:00-02:59 that day (e.g. 02:30) is not a real local
    // wall-clock time at all.
    const result = await createScheduledBroadcast({
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: "2027-03-26",
      scheduledHour: 2,
      scheduledMinute: 30,
      createIdempotencyKey: "idem-create-1",
    });
    expect(result).toEqual({ ok: false, error: "invalid_schedule" });
    expect(insertManagerScheduledBroadcastIfAbsent).not.toHaveBeenCalled();
  });

  it("still accepts an ordinary, genuinely-existing local time on the SAME DST-transition day", async () => {
    insertManagerScheduledBroadcastIfAbsent.mockResolvedValue({ row: scheduledRow(), created: true });
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast({
      manager: MANAGER,
      people: [MANAGER, PERSON_A],
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      title: "כותרת",
      body: "תוכן",
      scheduledDate: "2027-03-26",
      scheduledHour: 20,
      scheduledMinute: 0,
      createIdempotencyKey: "idem-create-1",
    });
    expect(result.ok).toBe(true);
  });

  it("on success, freezes 'everyone' into the full current roster's ids and creates NO notification_jobs", async () => {
    insertManagerScheduledBroadcastIfAbsent.mockResolvedValue({
      row: scheduledRow({ audienceKind: "everyone", targetPersonIds: ["p_manager", "p_a", "p_b"] }),
      created: true,
    });
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
      createIdempotencyKey: "idem-create-1",
    });

    expect(result.ok).toBe(true);
    expect(insertManagerScheduledBroadcastIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ audienceKind: "everyone", targetPersonIds: ["p_manager", "p_a", "p_b"], createIdempotencyKey: "idem-create-1" }),
    );
    expect(insertNotificationJobIfAbsent).not.toHaveBeenCalled();
    expect(insertManagerNotificationBatchIfAbsent).not.toHaveBeenCalled();
  });
});

describe("createScheduledBroadcast -- create-exactly-once idempotency (separate from dispatch's own scheduled:<id> key)", () => {
  const CREATE_INPUT = {
    manager: MANAGER,
    people: [MANAGER, PERSON_A],
    audienceKind: "person" as const,
    targetPersonIds: ["p_a"],
    title: "כותרת",
    body: "תוכן",
    scheduledDate: FUTURE_DATE,
    scheduledHour: 20,
    scheduledMinute: 0,
    createIdempotencyKey: "idem-create-1",
  };
  // The exact instant `createScheduledBroadcast` will resolve CREATE_INPUT's
  // own date/hour/minute to -- a stored row must match this exactly for the
  // replay comparison (`isSameLogicalScheduledCreateRequest`) to treat it as
  // the SAME logical request. (By the time a REAL stored row reaches this
  // comparison it has already been canonicalized once, at the store's own
  // mapping boundary -- see `scheduledBroadcastStore.test.ts` for the
  // `+00:00` vs `.000Z` proof; this file mocks the store entirely, so its
  // fixtures already use the canonical form the real store guarantees.)
  const CREATE_INPUT_SCHEDULED_FOR = jerusalemLocalTimeToInstant(FUTURE_DATE, 20, 0).toISOString();
  const PAST_DATE = "2020-01-01";
  const PAST_SCHEDULED_FOR = jerusalemLocalTimeToInstant(PAST_DATE, 20, 0).toISOString();

  it("a genuinely new key inserts and returns the fresh row", async () => {
    insertManagerScheduledBroadcastIfAbsent.mockResolvedValue({ row: scheduledRow(), created: true });
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast(CREATE_INPUT);

    expect(result).toEqual({ ok: true, row: scheduledRow() });
    expect(getManagerScheduledBroadcastByCreateIdempotencyKey).toHaveBeenCalledWith("idem-create-1");
    expect(insertManagerScheduledBroadcastIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ createIdempotencyKey: "idem-create-1" }),
    );
  });

  it("a retry with the SAME key and the SAME logical request returns the ORIGINAL row, never a second one, and never calls insert at all", async () => {
    const originalRow = scheduledRow({
      id: "sb_original",
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      scheduledFor: CREATE_INPUT_SCHEDULED_FOR,
    });
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(originalRow);
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast(CREATE_INPUT);

    expect(result).toEqual({ ok: true, row: originalRow });
    expect(insertManagerScheduledBroadcastIfAbsent).not.toHaveBeenCalled();
  });

  it("an exact retry after the scheduled time has already passed returns the existing row -- never invalid_schedule (a replay must not re-decide whether the original create would still be valid today)", async () => {
    const originalRow = scheduledRow({
      id: "sb_original",
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      scheduledFor: PAST_SCHEDULED_FOR,
    });
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(originalRow);
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast({ ...CREATE_INPUT, scheduledDate: PAST_DATE });

    expect(result).toEqual({ ok: true, row: originalRow });
  });

  it("an exact retry after the targeted person disappeared from the fresh roster returns the existing row -- never invalid_targets", async () => {
    const originalRow = scheduledRow({
      id: "sb_original",
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      scheduledFor: CREATE_INPUT_SCHEDULED_FOR,
    });
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(originalRow);
    const { createScheduledBroadcast } = await loadModule();

    // p_a is no longer in the fresh roster at all.
    const result = await createScheduledBroadcast({ ...CREATE_INPUT, people: [MANAGER] });

    expect(result).toEqual({ ok: true, row: originalRow });
  });

  it("a genuinely NEW key with a past time still fails invalid_schedule -- the future rule only relaxes for a REPLAY, never for an actually-new create", async () => {
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast({ ...CREATE_INPUT, scheduledDate: PAST_DATE });
    expect(result).toEqual({ ok: false, error: "invalid_schedule" });
    expect(insertManagerScheduledBroadcastIfAbsent).not.toHaveBeenCalled();
  });

  it("a genuinely NEW key with a target id no longer in the roster still fails invalid_targets -- the roster rule only relaxes for a REPLAY", async () => {
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast({ ...CREATE_INPUT, people: [MANAGER] });
    expect(result).toEqual({ ok: false, error: "invalid_targets" });
    expect(insertManagerScheduledBroadcastIfAbsent).not.toHaveBeenCalled();
  });

  it("fails closed with idempotency_conflict when a reused key's stored title differs -- never silently returns the mismatched row", async () => {
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(
      scheduledRow({ scheduledFor: CREATE_INPUT_SCHEDULED_FOR, title: "כותרת אחרת לגמרי" }),
    );
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast(CREATE_INPUT);
    expect(result).toEqual({ ok: false, error: "idempotency_conflict" });
  });

  it("fails closed with idempotency_conflict when a reused key's stored body differs", async () => {
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(
      scheduledRow({ scheduledFor: CREATE_INPUT_SCHEDULED_FOR, body: "תוכן אחר לגמרי" }),
    );
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast(CREATE_INPUT);
    expect(result).toEqual({ ok: false, error: "idempotency_conflict" });
  });

  it("fails closed with idempotency_conflict when a reused key's stored time differs", async () => {
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(
      scheduledRow({ scheduledFor: jerusalemLocalTimeToInstant(FUTURE_DATE, 21, 0).toISOString() }),
    );
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast(CREATE_INPUT);
    expect(result).toEqual({ ok: false, error: "idempotency_conflict" });
  });

  it("fails closed with idempotency_conflict when a reused key's stored audience differs", async () => {
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(
      scheduledRow({ scheduledFor: CREATE_INPUT_SCHEDULED_FOR, audienceKind: "people", targetPersonIds: ["p_a", "p_b"] }),
    );
    const { createScheduledBroadcast } = await loadModule();
    const result = await createScheduledBroadcast(CREATE_INPUT);
    expect(result).toEqual({ ok: false, error: "idempotency_conflict" });
  });

  it("a very late replay of the ORIGINAL request, after the row was intentionally edited, fails closed rather than reverting the edit -- the edit is never touched or overwritten", async () => {
    // A manager edited title/body after the original create -- the stored
    // row no longer represents CREATE_INPUT's own (pre-edit) content.
    const editedRow = scheduledRow({
      id: "sb_original",
      scheduledFor: CREATE_INPUT_SCHEDULED_FOR,
      title: "כותרת אחרי עריכה",
      lastChangedByPersonId: "p_manager",
      lastChangedByPersonName: "דני מנהל",
    });
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(editedRow);
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast(CREATE_INPUT);

    expect(result).toEqual({ ok: false, error: "idempotency_conflict" });
    expect(insertManagerScheduledBroadcastIfAbsent).not.toHaveBeenCalled();
    expect(updateManagerScheduledBroadcastIfEditable).not.toHaveBeenCalled();
  });

  it("'everyone' replay comparison skips target-id comparison, same as the immediate-send engine's own rule (a roster that grew between two near-simultaneous requests must never itself manufacture a false conflict)", async () => {
    getManagerScheduledBroadcastByCreateIdempotencyKey.mockResolvedValue(
      scheduledRow({
        audienceKind: "everyone",
        targetPersonIds: ["p_manager", "p_a"], // stored BEFORE the roster grew
        scheduledFor: CREATE_INPUT_SCHEDULED_FOR,
      }),
    );
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast({
      ...CREATE_INPUT,
      audienceKind: "everyone",
      people: [MANAGER, PERSON_A, PERSON_B], // roster now includes PERSON_B too
      targetPersonIds: [],
    });

    expect(result.ok).toBe(true);
  });

  it("a DIFFERENT compose-session key creates an independent new schedule normally, not a replay of anything", async () => {
    insertManagerScheduledBroadcastIfAbsent.mockResolvedValue({ row: scheduledRow({ id: "sb_new" }), created: true });
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast({ ...CREATE_INPUT, createIdempotencyKey: "idem-create-2" });

    expect(result).toEqual({ ok: true, row: scheduledRow({ id: "sb_new" }) });
    expect(insertManagerScheduledBroadcastIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ createIdempotencyKey: "idem-create-2" }),
    );
  });

  it("a concurrent request wins the race between our own lookup and our own insert -- we still resolve to exactly one row, never retry the insert", async () => {
    // Our own lookup found nothing (genuine race window), so we proceed to
    // insert -- but by the time our insert runs, a concurrent identical
    // request has already created the row under the same key.
    const winnerRow = scheduledRow({
      id: "sb_winner",
      audienceKind: "person",
      targetPersonIds: ["p_a"],
      scheduledFor: CREATE_INPUT_SCHEDULED_FOR,
    });
    insertManagerScheduledBroadcastIfAbsent.mockResolvedValue({ row: winnerRow, created: false });
    const { createScheduledBroadcast } = await loadModule();

    const result = await createScheduledBroadcast(CREATE_INPUT);

    expect(result).toEqual({ ok: true, row: winnerRow });
    expect(insertManagerScheduledBroadcastIfAbsent).toHaveBeenCalledTimes(1);
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

  it("resuming a crash BEFORE the batch_id checkpoint (row still batchId: null, but its batch was already created by the interrupted attempt): finds the SAME batch via the deterministic key, checkpoints it, creates only the missing jobs, marks dispatched -- never a second batch", async () => {
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([["alon@example.invalid", { userId: "u_a", avatarUrl: null }]]),
    );
    fetchAllSubscribedUserIds.mockResolvedValue(["u_a"]);
    resolvePersonIdentity.mockImplementation((p: Person) =>
      p.id === "p_a" ? { status: "mapped", normalizedEmail: "alon@example.invalid", userId: "u_a", avatarUrl: null } : { status: "no_email" },
    );
    // insertManagerNotificationBatchIfAbsent models the REAL unique-key
    // conflict: the batch from the interrupted first attempt already
    // exists with IDENTICAL content (same row, never edited -- editing is
    // blocked once claimed), so this is a genuine replay, not a conflict.
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
      created: false, // it already existed -- this retry attempt did NOT create it
    });

    const { dispatchScheduledBroadcast } = await loadModule();
    // row.batchId is still null -- exactly the crash-before-checkpoint state.
    const row = scheduledRow({ batchId: null });
    const outcome = await dispatchScheduledBroadcast(row as never, [MANAGER, PERSON_A]);

    expect(outcome).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
    // Exactly one insertManagerNotificationBatchIfAbsent call, which itself
    // reported created: false -- proving no SECOND batch was created.
    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledTimes(1);
    // The checkpoint is (finally) written now, closing the crash window.
    expect(setManagerScheduledBroadcastBatchId).toHaveBeenCalledWith("sb_1", "batch_1");
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledWith("sb_1");
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
    const outcome = await sendScheduledBroadcastNow("sb_1", [MANAGER, PERSON_A], MANAGER);
    expect(outcome).toEqual({ ok: false, error: "already_started" });
  });

  it("passes the acting manager's identity straight through to the atomic claim -- never a client-supplied identity", async () => {
    claimManagerScheduledBroadcastNow.mockResolvedValue(null);
    getManagerScheduledBroadcastById.mockResolvedValue(scheduledRow({ status: "dispatched" }));
    const { sendScheduledBroadcastNow } = await loadModule();
    await sendScheduledBroadcastNow("sb_1", [MANAGER_B, PERSON_A], MANAGER_B);
    expect(claimManagerScheduledBroadcastNow).toHaveBeenCalledWith("sb_1", "p_manager_b", "רותם מנהלת");
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
    const outcome = await sendScheduledBroadcastNow("sb_1", [MANAGER, PERSON_A, PERSON_B], MANAGER);

    expect(outcome).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
    expect(markManagerScheduledBroadcastDispatched).toHaveBeenCalledWith("sb_1");
  });

  it("truthful attribution: Manager A schedules, Manager B sends now -> the eventual batch identifies B, never A, while the schedule's own audit still shows A as creator", async () => {
    // The claim RPC atomically stamps sent_now_by_* on the winning claim --
    // this test starts from that already-claimed shape (see the store-level
    // RPC test for the atomic write itself).
    claimManagerScheduledBroadcastNow.mockResolvedValue(
      scheduledRow({
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
        sentNowByPersonId: "p_manager_b",
        sentNowByPersonName: "רותם מנהלת",
      }),
    );
    fetchAllUserIdsByEmail.mockResolvedValue(
      new Map([["alon@example.invalid", { userId: "u_a", avatarUrl: null }]]),
    );
    fetchAllSubscribedUserIds.mockResolvedValue(["u_a"]);
    resolvePersonIdentity.mockReturnValue({ status: "mapped", normalizedEmail: "alon@example.invalid", userId: "u_a", avatarUrl: null });
    insertManagerNotificationBatchIfAbsent.mockResolvedValue({
      row: {
        id: "batch_1",
        idempotencyKey: "scheduled:sb_1",
        createdByPersonId: "p_manager_b",
        createdByPersonName: "רותם מנהלת",
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
      },
      created: true,
    });

    const { sendScheduledBroadcastNow } = await loadModule();
    const outcome = await sendScheduledBroadcastNow("sb_1", [MANAGER, PERSON_A, PERSON_B], MANAGER_B);

    expect(outcome).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
    // The eventual batch is created for the SEND-NOW actor, never the original scheduler.
    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ createdByPersonId: "p_manager_b", createdByPersonName: "רותם מנהלת" }),
    );
    // Exactly one logical batch/job, same as every other dispatch path.
    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledTimes(1);
    expect(insertNotificationJobIfAbsent).toHaveBeenCalledTimes(1);
  });

  it("automatic due dispatch (no send-now actor) keeps the ORIGINAL scheduling manager as the batch's sender", async () => {
    claimDueManagerScheduledBroadcasts.mockResolvedValue([
      scheduledRow({ createdByPersonId: "p_manager", createdByPersonName: "דני מנהל", sentNowByPersonId: null, sentNowByPersonName: null }),
    ]);
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
        title: "כותרת",
        body: "תוכן",
        resolvedRecipientCount: 0,
        pushCapableCount: 0,
        inboxOnlyCount: 0,
        unresolvedCount: 2,
        createdAt: "2026-08-23T17:00:01.000Z",
      },
      created: true,
    });

    const { runDueScheduledBroadcastDispatch } = await loadModule();
    await runDueScheduledBroadcastDispatch([MANAGER, PERSON_A, PERSON_B]);

    expect(insertManagerNotificationBatchIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({ createdByPersonId: "p_manager", createdByPersonName: "דני מנהל" }),
    );
  });
});
