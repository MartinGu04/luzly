import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerWorkbookContext = vi.fn();
const sendManagerBroadcastNotification = vi.fn();
const listRecentManagerNotificationBatches = vi.fn();

vi.mock("@/lib/readModels/managerWorkbookContext", () => ({
  loadManagerWorkbookContext: (...args: unknown[]) => loadManagerWorkbookContext(...args),
}));
vi.mock("./engine/manualBroadcast", () => ({
  sendManagerBroadcastNotification: (...args: unknown[]) => sendManagerBroadcastNotification(...args),
}));
vi.mock("./engine/store", () => ({
  listRecentManagerNotificationBatches: (...args: unknown[]) => listRecentManagerNotificationBatches(...args),
  RECENT_MANAGER_BROADCASTS_LIMIT: 10,
}));

const { sendManagerBroadcastAction, getRecentManagerBroadcastsAction } = await import("./manualBroadcastActions");

const MANAGER = { id: "p_manager", name: "דני מנהל", email: "dani@example.invalid", isManager: true, isTechnician: true, isSupervisor: false, personnelType: null };
const PEOPLE = [MANAGER];

function okContext(overrides: Partial<{ manager: typeof MANAGER; people: typeof PEOPLE }> = {}) {
  return { status: "ok" as const, context: { manager: MANAGER, people: PEOPLE, snapshot: {} as never, avatarUrl: null, ...overrides } };
}

function validInput(overrides: Partial<Parameters<typeof sendManagerBroadcastAction>[0]> = {}) {
  return {
    audienceKind: "person" as const,
    targetPersonIds: ["p_1"],
    title: "כותרת",
    body: "תוכן",
    idempotencyKey: "idem-key-12345678",
    ...overrides,
  };
}

beforeEach(() => {
  loadManagerWorkbookContext.mockReset().mockResolvedValue(okContext());
  sendManagerBroadcastNotification.mockReset().mockResolvedValue({
    ok: true,
    result: {
      batchId: "batch_1",
      resolvedRecipientCount: 1,
      pushCapableCount: 1,
      inboxOnlyCount: 0,
      unresolvedCount: 0,
      unresolved: [],
    },
  });
  listRecentManagerNotificationBatches.mockReset().mockResolvedValue([]);
});

describe("sendManagerBroadcastAction -- authorization", () => {
  it("rejects an unauthenticated caller before ever resolving recipients or creating jobs", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "unauthenticated" });
    const result = await sendManagerBroadcastAction(validInput());
    expect(result).toEqual({ ok: false, error: "unauthenticated" });
    expect(sendManagerBroadcastNotification).not.toHaveBeenCalled();
  });

  it("rejects a non-manager -- loadManagerWorkbookContext's own forbidden status, never a manual isManager check duplicated here", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    const result = await sendManagerBroadcastAction(validInput());
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(sendManagerBroadcastNotification).not.toHaveBeenCalled();
  });

  it("only fetches the personnel source -- narrower than the full manager workbook, since this feature needs no schedule/settings/potential data", async () => {
    await sendManagerBroadcastAction(validInput());
    expect(loadManagerWorkbookContext).toHaveBeenCalledWith(["personnel"]);
  });

  it("passes the authorized manager + freshly-fetched roster straight through, never a client-supplied identity", async () => {
    const input = validInput({ targetPersonIds: ["p_x", "p_y"] });
    await sendManagerBroadcastAction(input);
    expect(sendManagerBroadcastNotification).toHaveBeenCalledWith(
      expect.objectContaining({ manager: MANAGER, people: PEOPLE, targetPersonIds: ["p_x", "p_y"] }),
    );
  });
});

describe("sendManagerBroadcastAction -- request shape validation (fails BEFORE authorization even runs)", () => {
  it("rejects a malformed audienceKind", async () => {
    const result = await sendManagerBroadcastAction(validInput({ audienceKind: "hacked" as never }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
    expect(loadManagerWorkbookContext).not.toHaveBeenCalled();
  });

  it("rejects a non-array targetPersonIds", async () => {
    const result = await sendManagerBroadcastAction(validInput({ targetPersonIds: "p_1" as never }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects a targetPersonIds array containing a non-string entry", async () => {
    const result = await sendManagerBroadcastAction(validInput({ targetPersonIds: [42] as never }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects a missing/short idempotencyKey -- this is the double-submission guard's own input", async () => {
    const result = await sendManagerBroadcastAction(validInput({ idempotencyKey: "short" }));
    expect(result).toEqual({ ok: false, error: "invalid_request" });
  });

  it("rejects a non-string title/body", async () => {
    expect(await sendManagerBroadcastAction(validInput({ title: 5 as never }))).toEqual({ ok: false, error: "invalid_request" });
    expect(await sendManagerBroadcastAction(validInput({ body: 5 as never }))).toEqual({ ok: false, error: "invalid_request" });
  });
});

describe("sendManagerBroadcastAction -- happy path", () => {
  it("returns the engine's own resolved counts on success", async () => {
    const result = await sendManagerBroadcastAction(validInput());
    expect(result).toEqual({
      ok: true,
      batchId: "batch_1",
      resolvedRecipientCount: 1,
      pushCapableCount: 1,
      inboxOnlyCount: 0,
      unresolvedCount: 0,
      unresolved: [],
    });
  });

  it("surfaces the engine's own validation error (e.g. invalid_title) untouched", async () => {
    sendManagerBroadcastNotification.mockResolvedValue({ ok: false, error: "invalid_title" });
    const result = await sendManagerBroadcastAction(validInput());
    expect(result).toEqual({ ok: false, error: "invalid_title" });
  });
});

describe("getRecentManagerBroadcastsAction", () => {
  it("is manager-gated exactly like the send action", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    const result = await getRecentManagerBroadcastsAction();
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(listRecentManagerNotificationBatches).not.toHaveBeenCalled();
  });

  it("maps recent batch rows to a safe view", async () => {
    listRecentManagerNotificationBatches.mockResolvedValue([
      {
        id: "b1",
        idempotencyKey: "k1",
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
        audienceKind: "everyone",
        targetPersonIds: ["p_1", "p_2"],
        title: "כותרת",
        body: "תוכן",
        resolvedRecipientCount: 2,
        pushCapableCount: 1,
        inboxOnlyCount: 1,
        unresolvedCount: 0,
        createdAt: "2026-08-21T08:00:00.000Z",
      },
    ]);
    const result = await getRecentManagerBroadcastsAction();
    expect(result).toEqual({
      ok: true,
      items: [
        {
          id: "b1",
          title: "כותרת",
          body: "תוכן",
          audienceKind: "everyone",
          createdByPersonName: "דני מנהל",
          createdAt: "2026-08-21T08:00:00.000Z",
          resolvedRecipientCount: 2,
          pushCapableCount: 1,
          inboxOnlyCount: 1,
          unresolvedCount: 0,
        },
      ],
    });
  });
});
