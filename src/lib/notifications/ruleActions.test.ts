import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerWorkbookContext = vi.fn();
const loadManagerPersonnelContext = vi.fn();
const listActiveNotificationRules = vi.fn();
const updateSystemRule = vi.fn();
const insertCustomWeeklyRule = vi.fn();
const updateCustomWeeklyRule = vi.fn();
const setCustomWeeklyRuleEnabled = vi.fn();
const archiveCustomWeeklyRule = vi.fn();

vi.mock("@/lib/readModels/managerWorkbookContext", () => ({
  loadManagerWorkbookContext: (...args: unknown[]) => loadManagerWorkbookContext(...args),
  loadManagerPersonnelContext: (...args: unknown[]) => loadManagerPersonnelContext(...args),
}));
vi.mock("./engine/store", () => ({
  listActiveNotificationRules: (...args: unknown[]) => listActiveNotificationRules(...args),
  updateSystemRule: (...args: unknown[]) => updateSystemRule(...args),
  insertCustomWeeklyRule: (...args: unknown[]) => insertCustomWeeklyRule(...args),
  updateCustomWeeklyRule: (...args: unknown[]) => updateCustomWeeklyRule(...args),
  setCustomWeeklyRuleEnabled: (...args: unknown[]) => setCustomWeeklyRuleEnabled(...args),
  archiveCustomWeeklyRule: (...args: unknown[]) => archiveCustomWeeklyRule(...args),
}));

const {
  listNotificationRulesAction,
  updateSystemRuleAction,
  createCustomWeeklyRuleAction,
  updateCustomWeeklyRuleAction,
  setCustomWeeklyRuleEnabledAction,
  archiveCustomWeeklyRuleAction,
} = await import("./ruleActions");

const MANAGER = { id: "p_manager", name: "דני מנהל", email: "dani@example.invalid", isManager: true, isTechnician: true, isSupervisor: false, personnelType: null };
const PEOPLE = [MANAGER, { id: "p_1", name: "אחד", email: "one@example.invalid", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null }];

function okWorkbookContext() {
  return { status: "ok" as const, context: { manager: MANAGER, people: PEOPLE, snapshot: {} as never, avatarUrl: null } };
}
function okPersonnelContext() {
  return { status: "ok" as const, context: { manager: MANAGER, people: PEOPLE } };
}

function systemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    kind: "system" as const,
    systemKey: "tomorrow_shift",
    enabled: true,
    weekday: null,
    localHour: 20,
    localMinute: 0,
    title: null,
    body: null,
    audienceKind: null,
    targetPersonIds: [],
    archivedAt: null,
    createdByPersonId: null,
    createdByPersonName: null,
    updatedByPersonId: null,
    updatedByPersonName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function customRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-custom-1",
    kind: "custom_weekly" as const,
    systemKey: null,
    enabled: true,
    weekday: 6,
    localHour: 21,
    localMinute: 0,
    title: "📌 תזכורת לאילוצים",
    body: "גוף ההודעה",
    audienceKind: "everyone" as const,
    targetPersonIds: [],
    archivedAt: null,
    createdByPersonId: "p_manager",
    createdByPersonName: "דני מנהל",
    updatedByPersonId: null,
    updatedByPersonName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  loadManagerWorkbookContext.mockReset().mockResolvedValue(okWorkbookContext());
  loadManagerPersonnelContext.mockReset().mockResolvedValue(okPersonnelContext());
  listActiveNotificationRules.mockReset().mockResolvedValue([]);
  updateSystemRule.mockReset();
  insertCustomWeeklyRule.mockReset();
  updateCustomWeeklyRule.mockReset();
  setCustomWeeklyRuleEnabled.mockReset();
  archiveCustomWeeklyRule.mockReset();
});

describe("listNotificationRulesAction -- authorization + shape", () => {
  it("a non-manager cannot list rules", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });

    const result = await listNotificationRulesAction();

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(listActiveNotificationRules).not.toHaveBeenCalled();
  });

  it("an unauthenticated caller cannot list rules", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "unauthenticated" });

    const result = await listNotificationRulesAction();

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("returns system rules and custom weekly rules separately, with a Hebrew name never the raw system key as primary label", async () => {
    listActiveNotificationRules.mockResolvedValue([systemRow(), customRow()]);

    const result = await listNotificationRulesAction();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.systemRules).toHaveLength(1);
    expect(result.systemRules[0].kind).toBe("system");
    expect(result.systemRules[0].name).not.toBe("tomorrow_shift"); // curated Hebrew name, not the raw key
    expect(result.systemRules[0].systemKey).toBe("tomorrow_shift"); // still available as secondary diagnostic info
    expect(result.customWeeklyRules).toHaveLength(1);
    expect(result.customWeeklyRules[0].kind).toBe("custom_weekly");
    expect(result.customWeeklyRules[0].scheduleSummary).toContain("שבת");
  });

  it("a disabled custom rule has no next-send summary (never a fake prediction for something that won't fire)", async () => {
    listActiveNotificationRules.mockResolvedValue([customRow({ enabled: false })]);

    const result = await listNotificationRulesAction();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.customWeeklyRules[0].nextSendSummary).toBeNull();
  });
});

describe("updateSystemRuleAction -- authorization + field lockdown", () => {
  it("a non-manager cannot update a system rule", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });

    const result = await updateSystemRuleAction("rule-1", { enabled: false, localHour: 19, localMinute: 0 });

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range hour/minute", async () => {
    const result = await updateSystemRuleAction("rule-1", { enabled: true, localHour: 24, localMinute: 0 });
    expect(result).toEqual({ ok: false, error: "invalid_schedule" });
    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  it("an authorized manager can disable/enable and change the send time -- ONLY those fields are ever sent to the store layer", async () => {
    updateSystemRule.mockResolvedValue(systemRow({ enabled: false, localHour: 19, localMinute: 30 }));

    const result = await updateSystemRuleAction("rule-1", { enabled: false, localHour: 19, localMinute: 30 });

    expect(result.ok).toBe(true);
    expect(updateSystemRule).toHaveBeenCalledWith("rule-1", {
      enabled: false,
      localHour: 19,
      localMinute: 30,
      updatedByPersonId: "p_manager",
      updatedByPersonName: "דני מנהל",
    });
  });

  it("a not-found/not-a-system-row id fails truthfully", async () => {
    updateSystemRule.mockResolvedValue(null);

    const result = await updateSystemRuleAction("nope", { enabled: true, localHour: 20, localMinute: 0 });

    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});

describe("createCustomWeeklyRuleAction -- authorization + roster revalidation", () => {
  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      title: "📌 תזכורת לאילוצים",
      body: "גוף ההודעה",
      weekday: 6,
      localHour: 21,
      localMinute: 0,
      audienceKind: "everyone" as const,
      targetPersonIds: [],
      ...overrides,
    };
  }

  it("a non-manager cannot create a custom rule", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });

    const result = await createCustomWeeklyRuleAction(validInput());

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(insertCustomWeeklyRule).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range weekday", async () => {
    const result = await createCustomWeeklyRuleAction(validInput({ weekday: 7 }));
    expect(result).toEqual({ ok: false, error: "invalid_weekday" });
  });

  it("rejects an empty title", async () => {
    const result = await createCustomWeeklyRuleAction(validInput({ title: "" }));
    expect(result).toEqual({ ok: false, error: "invalid_title" });
  });

  it("a client-supplied person id that is not a genuine roster member fails the WHOLE request closed -- never silently drops it", async () => {
    const result = await createCustomWeeklyRuleAction(
      validInput({ audienceKind: "people", targetPersonIds: ["p_1", "not-a-real-roster-id"] }),
    );
    expect(result).toEqual({ ok: false, error: "invalid_targets" });
    expect(insertCustomWeeklyRule).not.toHaveBeenCalled();
  });

  it("creates the rule with the manager's identity and canonicalized target ids", async () => {
    insertCustomWeeklyRule.mockResolvedValue(customRow());

    const result = await createCustomWeeklyRuleAction(validInput({ audienceKind: "people", targetPersonIds: ["p_1", "p_1"] }));

    expect(result.ok).toBe(true);
    expect(insertCustomWeeklyRule).toHaveBeenCalledWith(
      expect.objectContaining({
        weekday: 6,
        localHour: 21,
        localMinute: 0,
        title: "📌 תזכורת לאילוצים",
        body: "גוף ההודעה",
        audienceKind: "people",
        targetPersonIds: ["p_1"], // deduplicated
        createdByPersonId: "p_manager",
        createdByPersonName: "דני מנהל",
      }),
    );
  });
});

describe("updateCustomWeeklyRuleAction -- authorization + re-validation", () => {
  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      title: "כותרת מעודכנת",
      body: "גוף מעודכן",
      weekday: 0,
      localHour: 8,
      localMinute: 0,
      audienceKind: "everyone" as const,
      targetPersonIds: [],
      ...overrides,
    };
  }

  it("a non-manager cannot edit a custom rule", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });

    const result = await updateCustomWeeklyRuleAction("rule-custom-1", validInput());

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(updateCustomWeeklyRule).not.toHaveBeenCalled();
  });

  it("an already-archived/unknown rule fails truthfully", async () => {
    updateCustomWeeklyRule.mockResolvedValue(null);

    const result = await updateCustomWeeklyRuleAction("rule-custom-1", validInput());

    expect(result).toEqual({ ok: false, error: "not_found" });
  });

  it("saves the edit when valid", async () => {
    updateCustomWeeklyRule.mockResolvedValue(customRow({ weekday: 0, localHour: 8, localMinute: 0, title: "כותרת מעודכנת", body: "גוף מעודכן" }));

    const result = await updateCustomWeeklyRuleAction("rule-custom-1", validInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule.weekday).toBe(0);
    expect(result.rule.title).toBe("כותרת מעודכנת");
  });
});

describe("setCustomWeeklyRuleEnabledAction / archiveCustomWeeklyRuleAction -- authorization", () => {
  it("a non-manager cannot enable/disable a custom rule", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });

    const result = await setCustomWeeklyRuleEnabledAction("rule-custom-1", false);

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(setCustomWeeklyRuleEnabled).not.toHaveBeenCalled();
  });

  it("an authorized manager can disable a custom rule", async () => {
    setCustomWeeklyRuleEnabled.mockResolvedValue(customRow({ enabled: false }));

    const result = await setCustomWeeklyRuleEnabledAction("rule-custom-1", false);

    expect(result.ok).toBe(true);
    expect(setCustomWeeklyRuleEnabled).toHaveBeenCalledWith("rule-custom-1", false, "p_manager", "דני מנהל");
  });

  it("a non-manager cannot archive a custom rule", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });

    const result = await archiveCustomWeeklyRuleAction("rule-custom-1");

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(archiveCustomWeeklyRule).not.toHaveBeenCalled();
  });

  it("an authorized manager can archive a custom rule -- historical jobs/batches are never touched by this action", async () => {
    archiveCustomWeeklyRule.mockResolvedValue(customRow({ archivedAt: "2026-08-24T00:00:00.000Z" }));

    const result = await archiveCustomWeeklyRuleAction("rule-custom-1");

    expect(result).toEqual({ ok: true });
    expect(archiveCustomWeeklyRule).toHaveBeenCalledWith("rule-custom-1", "p_manager", "דני מנהל");
  });

  it("archiving a not-found rule fails truthfully", async () => {
    archiveCustomWeeklyRule.mockResolvedValue(null);

    const result = await archiveCustomWeeklyRuleAction("nope");

    expect(result).toEqual({ ok: false, error: "not_found" });
  });
});
