import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerWorkbookContext = vi.fn();
const createScheduledBroadcast = vi.fn();
const editScheduledBroadcast = vi.fn();
const cancelScheduledBroadcast = vi.fn();
const sendScheduledBroadcastNow = vi.fn();
const listActiveManagerScheduledBroadcasts = vi.fn();

vi.mock("@/lib/readModels/managerWorkbookContext", () => ({
  loadManagerWorkbookContext: (...args: unknown[]) => loadManagerWorkbookContext(...args),
}));
vi.mock("./engine/scheduledBroadcast", () => ({
  createScheduledBroadcast: (...args: unknown[]) => createScheduledBroadcast(...args),
  editScheduledBroadcast: (...args: unknown[]) => editScheduledBroadcast(...args),
  cancelScheduledBroadcast: (...args: unknown[]) => cancelScheduledBroadcast(...args),
  sendScheduledBroadcastNow: (...args: unknown[]) => sendScheduledBroadcastNow(...args),
}));
vi.mock("./engine/store", () => ({
  listActiveManagerScheduledBroadcasts: (...args: unknown[]) => listActiveManagerScheduledBroadcasts(...args),
}));

const {
  createScheduledBroadcastAction,
  editScheduledBroadcastAction,
  cancelScheduledBroadcastAction,
  sendScheduledBroadcastNowAction,
  listActiveScheduledBroadcastsAction,
} = await import("./scheduledBroadcastActions");

const MANAGER = { id: "p_manager", name: "דני מנהל", email: "dani@example.invalid", isManager: true, isTechnician: true, isSupervisor: false, personnelType: null };
const PEOPLE = [MANAGER];

function okContext() {
  return { status: "ok" as const, context: { manager: MANAGER, people: PEOPLE, snapshot: {} as never, avatarUrl: null } };
}

function validInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    audienceKind: "person" as const,
    targetPersonIds: ["p_1"],
    title: "כותרת",
    body: "תוכן",
    scheduledDate: "2026-08-23",
    scheduledHour: 20,
    scheduledMinute: 0,
    idempotencyKey: "idem-key-12345678", // CREATE-only; harmlessly ignored by edit/cancel callers below.
    ...overrides,
  };
}

function storedRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sb_1",
    status: "scheduled",
    audienceKind: "person",
    targetPersonIds: ["p_1"],
    title: "כותרת",
    body: "תוכן",
    scheduledFor: "2026-08-23T17:00:00.000Z",
    createdByPersonId: "p_manager",
    createdByPersonName: "דני מנהל",
    lastChangedByPersonId: null,
    lastChangedByPersonName: null,
    cancelledByPersonId: null,
    cancelledByPersonName: null,
    claimedAt: null,
    batchId: null,
    dispatchedAt: null,
    cancelledAt: null,
    createdAt: "2026-08-20T08:00:00.000Z",
    updatedAt: "2026-08-20T08:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  loadManagerWorkbookContext.mockReset().mockResolvedValue(okContext());
  createScheduledBroadcast.mockReset().mockResolvedValue({ ok: true, row: storedRow() });
  editScheduledBroadcast.mockReset().mockResolvedValue({ ok: true, row: storedRow() });
  cancelScheduledBroadcast.mockReset().mockResolvedValue({ ok: true });
  sendScheduledBroadcastNow.mockReset().mockResolvedValue({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
  listActiveManagerScheduledBroadcasts.mockReset().mockResolvedValue([]);
});

describe("createScheduledBroadcastAction -- authorization + shape validation", () => {
  it("rejects an unauthenticated caller before touching the engine", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "unauthenticated" });
    const result = await createScheduledBroadcastAction(validInput());
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(createScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("rejects a non-manager via loadManagerWorkbookContext's own forbidden status", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    const result = await createScheduledBroadcastAction(validInput());
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });

  it("only fetches the personnel source, same as the immediate-send action", async () => {
    await createScheduledBroadcastAction(validInput());
    expect(loadManagerWorkbookContext).toHaveBeenCalledWith(["personnel"]);
  });

  it("rejects a malformed audienceKind before authorization even runs", async () => {
    const result = await createScheduledBroadcastAction(validInput({ audienceKind: "hacked" }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(loadManagerWorkbookContext).not.toHaveBeenCalled();
  });

  it("rejects a malformed scheduledDate", async () => {
    const result = await createScheduledBroadcastAction(validInput({ scheduledDate: "23-08-2026" }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects a non-integer hour/minute", async () => {
    expect(await createScheduledBroadcastAction(validInput({ scheduledHour: 20.5 }))).toEqual({ ok: false, error: "invalid_request" });
    expect(await createScheduledBroadcastAction(validInput({ scheduledMinute: "0" }))).toEqual({ ok: false, error: "invalid_request" });
  });

  it("passes the authorized manager + freshly-fetched roster straight through, never a client-supplied identity", async () => {
    await createScheduledBroadcastAction(validInput());
    expect(createScheduledBroadcast).toHaveBeenCalledWith(expect.objectContaining({ manager: MANAGER, people: PEOPLE }));
  });

  it("rejects a missing/short idempotencyKey -- this is the create-exactly-once guard's own input", async () => {
    const result = await createScheduledBroadcastAction(validInput({ idempotencyKey: "short" }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(createScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("rejects a non-string idempotencyKey", async () => {
    const result = await createScheduledBroadcastAction(validInput({ idempotencyKey: 12345678 }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("forwards the client's idempotencyKey as createIdempotencyKey -- the engine's own create-exactly-once field name", async () => {
    await createScheduledBroadcastAction(validInput({ idempotencyKey: "idem-abcdefgh" }));
    expect(createScheduledBroadcast).toHaveBeenCalledWith(expect.objectContaining({ createIdempotencyKey: "idem-abcdefgh" }));
  });

  it("returns a view built from the engine's own row on success", async () => {
    const result = await createScheduledBroadcastAction(validInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.item.id).toBe("sb_1");
      expect(result.item.scheduledLocalDate).toBeTypeOf("string");
      expect(result.item.scheduledLocalMinuteOfDay).toBeTypeOf("number");
    }
  });

  it("surfaces the engine's own validation error untouched", async () => {
    createScheduledBroadcast.mockResolvedValue({ ok: false, error: "invalid_schedule" });
    const result = await createScheduledBroadcastAction(validInput());
    expect(result).toEqual({ ok: false, error: "invalid_schedule" });
  });
});

describe("editScheduledBroadcastAction", () => {
  it("rejects a missing id before authorization", async () => {
    const result = await editScheduledBroadcastAction("", validInput());
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(loadManagerWorkbookContext).not.toHaveBeenCalled();
  });

  it("forwards to the engine with the given id and returns the updated view", async () => {
    const result = await editScheduledBroadcastAction("sb_1", validInput({ title: "עודכן" }));
    expect(editScheduledBroadcast).toHaveBeenCalledWith("sb_1", expect.objectContaining({ manager: MANAGER }));
    expect(result.ok).toBe(true);
  });

  it("surfaces 'already_started' untouched", async () => {
    editScheduledBroadcast.mockResolvedValue({ ok: false, error: "already_started" });
    const result = await editScheduledBroadcastAction("sb_1", validInput());
    expect(result).toEqual({ ok: false, error: "already_started" });
  });

  it("never forwards a createIdempotencyKey -- editing never creates or replaces the row's own creation-idempotency key", async () => {
    await editScheduledBroadcastAction("sb_1", validInput());
    const forwarded = editScheduledBroadcast.mock.calls[0][1];
    expect(forwarded).not.toHaveProperty("createIdempotencyKey");
  });
});

describe("cancelScheduledBroadcastAction", () => {
  it("rejects a missing id", async () => {
    const result = await cancelScheduledBroadcastAction("");
    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("is manager-gated", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    const result = await cancelScheduledBroadcastAction("sb_1");
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(cancelScheduledBroadcast).not.toHaveBeenCalled();
  });

  it("passes the authenticated manager (never a client-supplied identity) to the engine", async () => {
    await cancelScheduledBroadcastAction("sb_1");
    expect(cancelScheduledBroadcast).toHaveBeenCalledWith("sb_1", MANAGER);
  });
});

describe("sendScheduledBroadcastNowAction", () => {
  it("is manager-gated", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    const result = await sendScheduledBroadcastNowAction("sb_1");
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(sendScheduledBroadcastNow).not.toHaveBeenCalled();
  });

  it("dispatches through the engine using the freshly-fetched roster AND the authenticated manager as the send-now actor", async () => {
    const result = await sendScheduledBroadcastNowAction("sb_1");
    expect(sendScheduledBroadcastNow).toHaveBeenCalledWith("sb_1", PEOPLE, MANAGER);
    expect(result).toEqual({ ok: true, batchId: "batch_1", resolvedRecipientCount: 1 });
  });
});

describe("listActiveScheduledBroadcastsAction", () => {
  it("is manager-gated exactly like every other action here", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    const result = await listActiveScheduledBroadcastsAction();
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(listActiveManagerScheduledBroadcasts).not.toHaveBeenCalled();
  });

  it("maps stored rows to safe views with derived local date/time fields", async () => {
    listActiveManagerScheduledBroadcasts.mockResolvedValue([storedRow()]);
    const result = await listActiveScheduledBroadcastsAction();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ id: "sb_1", status: "scheduled", title: "כותרת" });
      expect(result.items[0].scheduledLocalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
