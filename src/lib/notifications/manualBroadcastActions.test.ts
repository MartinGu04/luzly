import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerWorkbookContext = vi.fn();
const loadManagerPersonnelContext = vi.fn();
const sendManagerBroadcastNotification = vi.fn();
const listRecentManagerNotificationBatches = vi.fn();
const getManagerBroadcastDeliveryTiming = vi.fn();
const after = vi.fn();
const runDelivery = vi.fn();

vi.mock("@/lib/readModels/managerWorkbookContext", () => ({
  loadManagerWorkbookContext: (...args: unknown[]) => loadManagerWorkbookContext(...args),
  loadManagerPersonnelContext: (...args: unknown[]) => loadManagerPersonnelContext(...args),
}));
vi.mock("./engine/manualBroadcast", () => ({
  sendManagerBroadcastNotification: (...args: unknown[]) => sendManagerBroadcastNotification(...args),
}));
vi.mock("./engine/store", () => ({
  listRecentManagerNotificationBatches: (...args: unknown[]) => listRecentManagerNotificationBatches(...args),
  getManagerBroadcastDeliveryTiming: (...args: unknown[]) => getManagerBroadcastDeliveryTiming(...args),
  RECENT_MANAGER_BROADCASTS_LIMIT: 10,
}));
vi.mock("next/server", () => ({
  after: (...args: unknown[]) => after(...args),
}));
vi.mock("./engine/delivery", () => ({
  runDelivery: (...args: unknown[]) => runDelivery(...args),
}));

const { sendManagerBroadcastAction, getRecentManagerBroadcastsAction } = await import("./manualBroadcastActions");

const MANAGER = { id: "p_manager", name: "דני מנהל", email: "dani@example.invalid", isManager: true, isTechnician: true, isSupervisor: false, personnelType: null };
const PEOPLE = [MANAGER];

function okContext(overrides: Partial<{ manager: typeof MANAGER; people: typeof PEOPLE }> = {}) {
  return { status: "ok" as const, context: { manager: MANAGER, people: PEOPLE, snapshot: {} as never, avatarUrl: null, ...overrides } };
}

function okPersonnelContext(overrides: Partial<{ manager: typeof MANAGER; people: typeof PEOPLE }> = {}) {
  return { status: "ok" as const, context: { manager: MANAGER, people: PEOPLE, ...overrides } };
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
  loadManagerPersonnelContext.mockReset().mockResolvedValue(okPersonnelContext());
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
  getManagerBroadcastDeliveryTiming.mockReset().mockResolvedValue(new Map());
  after.mockReset();
  runDelivery.mockReset().mockResolvedValue({
    jobsClaimed: 0,
    jobsCompleted: 0,
    jobsFailed: 0,
    jobsPending: 0,
    jobsSkipped: 0,
    deliveriesSucceeded: 0,
    deliveriesFailedPermanent: 0,
    deliveriesFailedTransient: 0,
    subscriptionsRemoved: 0,
  });
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

describe("sendManagerBroadcastAction -- immediate delivery kick (true immediate delivery for Send Now)", () => {
  it("registers EXACTLY ONE background after() callback once the broadcast is durably created", async () => {
    await sendManagerBroadcastAction(validInput());
    expect(after).toHaveBeenCalledTimes(1);
    expect(after).toHaveBeenCalledWith(expect.any(Function));
  });

  it("invoking the registered callback calls the existing runDelivery() pipeline -- never a second push sender", async () => {
    await sendManagerBroadcastAction(validInput());
    const callback = after.mock.calls[0][0] as () => Promise<void>;
    expect(runDelivery).not.toHaveBeenCalled();
    await callback();
    expect(runDelivery).toHaveBeenCalledTimes(1);
    expect(runDelivery).toHaveBeenCalledWith();
  });

  it("does NOT register a delivery callback for an invalid request (fails before authorization)", async () => {
    await sendManagerBroadcastAction(validInput({ audienceKind: "hacked" as never }));
    expect(after).not.toHaveBeenCalled();
  });

  it("does NOT register a delivery callback for an unauthorized/non-manager caller", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });
    await sendManagerBroadcastAction(validInput());
    expect(after).not.toHaveBeenCalled();
  });

  it("does NOT register a delivery callback when the engine itself reports failure (e.g. idempotency_conflict)", async () => {
    sendManagerBroadcastNotification.mockResolvedValue({ ok: false, error: "idempotency_conflict" });
    await sendManagerBroadcastAction(validInput());
    expect(after).not.toHaveBeenCalled();
  });

  it("contains and logs an immediate-delivery failure (PII-safely sanitized) without altering the already-successful action result", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    runDelivery.mockRejectedValue(new Error("push failed for leaked-person@example.com"));

    const result = await sendManagerBroadcastAction(validInput());
    expect(result.ok).toBe(true);

    const callback = after.mock.calls[0][0] as () => Promise<void>;
    await expect(callback()).resolves.toBeUndefined();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const logged = consoleErrorSpy.mock.calls[0][0] as string;
    expect(logged).not.toContain("leaked-person@example.com");
    expect(logged).toContain("[email]");

    consoleErrorSpy.mockRestore();
  });
});

describe("getRecentManagerBroadcastsAction", () => {
  it("is manager-gated exactly like the send action", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });
    const result = await getRecentManagerBroadcastsAction();
    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(listRecentManagerNotificationBatches).not.toHaveBeenCalled();
  });

  it("uses the LIGHTWEIGHT loadManagerPersonnelContext boundary, never the full loadManagerWorkbookContext -- this is a ~17s poll alongside the scheduled-broadcast list", async () => {
    listRecentManagerNotificationBatches.mockResolvedValue([]);
    await getRecentManagerBroadcastsAction();
    expect(loadManagerPersonnelContext).toHaveBeenCalledTimes(1);
    expect(loadManagerWorkbookContext).not.toHaveBeenCalled();
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
          scheduleCreatedAt: null,
          scheduledFor: null,
          sentNowAt: null,
          firstSuccessfulPushAt: null,
          deliveryLatencySeconds: null,
          deliveryState: "pending",
        },
      ],
    });
  });

  it("passes the bounded batch list straight through to getManagerBroadcastDeliveryTiming -- one bulk aggregation call, never one per batch", async () => {
    const rows = [
      { id: "b1", pushCapableCount: 1, createdAt: "2026-08-21T08:00:00.000Z" },
      { id: "b2", pushCapableCount: 0, createdAt: "2026-08-21T08:01:00.000Z" },
    ];
    listRecentManagerNotificationBatches.mockResolvedValue(
      rows.map((row) => ({
        idempotencyKey: "k",
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
        audienceKind: "everyone",
        targetPersonIds: [],
        title: "כותרת",
        body: "תוכן",
        resolvedRecipientCount: 1,
        inboxOnlyCount: 0,
        unresolvedCount: 0,
        ...row,
      })),
    );
    await getRecentManagerBroadcastsAction();

    expect(getManagerBroadcastDeliveryTiming).toHaveBeenCalledTimes(1);
    expect(getManagerBroadcastDeliveryTiming.mock.calls[0][0]).toMatchObject([
      { id: "b1", pushCapableCount: 1 },
      { id: "b2", pushCapableCount: 0 },
    ]);
  });

  it("merges the store's aggregated timing into each item, and computes deliveryLatencySeconds via the SAME pure formula used elsewhere", async () => {
    listRecentManagerNotificationBatches.mockResolvedValue([
      {
        id: "b1",
        idempotencyKey: "k1",
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
        audienceKind: "everyone",
        targetPersonIds: [],
        title: "כותרת",
        body: "תוכן",
        resolvedRecipientCount: 1,
        pushCapableCount: 1,
        inboxOnlyCount: 0,
        unresolvedCount: 0,
        createdAt: "2026-08-22T21:46:00.000Z",
      },
    ]);
    getManagerBroadcastDeliveryTiming.mockResolvedValue(
      new Map([
        [
          "b1",
          {
            scheduleCreatedAt: null,
            scheduledFor: null,
            sentNowAt: null,
            firstSuccessfulPushAt: "2026-08-22T21:46:02.000Z",
            deliveryState: "sent",
          },
        ],
      ]),
    );

    const result = await getRecentManagerBroadcastsAction();

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.items[0]).toMatchObject({
      firstSuccessfulPushAt: "2026-08-22T21:46:02.000Z",
      deliveryLatencySeconds: 2, // immediate broadcast -- measured from the batch's own createdAt
      deliveryState: "sent",
    });
  });
});
