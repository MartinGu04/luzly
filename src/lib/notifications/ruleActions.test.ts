import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerWorkbookContext = vi.fn();
const loadManagerPersonnelContext = vi.fn();
const listActiveNotificationRules = vi.fn();
const getNotificationRuleById = vi.fn();
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
  getNotificationRuleById: (...args: unknown[]) => getNotificationRuleById(...args),
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
    revision: 1,
    systemTitleOverride: null,
    systemBodyOverride: null,
    systemAudienceMode: "all_eligible" as const,
    systemTargetPersonIds: [] as string[],
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

/** Wraps `systemRow(...)` in the `updateSystemRule` "ok" outcome shape (`store.ts`'s `UpdateSystemRuleOutcome`). */
function okOutcome(overrides: Record<string, unknown> = {}) {
  return { status: "ok" as const, rule: systemRow(overrides) };
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
    revision: 1,
    systemTitleOverride: null,
    systemBodyOverride: null,
    systemAudienceMode: "all_eligible" as const,
    systemTargetPersonIds: [] as string[],
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
  getNotificationRuleById.mockReset().mockResolvedValue(systemRow());
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

describe("updateSystemRuleAction -- authorization + validation + audience/copy revalidation", () => {
  function validInput(overrides: Record<string, unknown> = {}) {
    return {
      enabled: true,
      localHour: 19,
      localMinute: 30,
      titleOverride: null,
      bodyOverride: null,
      audienceMode: "all_eligible" as const,
      targetPersonIds: [] as string[],
      expectedRevision: 1, // matches systemRow()'s own default `revision: 1`
      ...overrides,
    };
  }

  it("a non-manager cannot update a system rule", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "forbidden" });

    const result = await updateSystemRuleAction("rule-1", validInput());

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  it("an unauthenticated caller cannot update a system rule", async () => {
    loadManagerWorkbookContext.mockResolvedValue({ status: "unauthenticated" });

    const result = await updateSystemRuleAction("rule-1", validInput());

    expect(result).toEqual({ ok: false, error: "unauthenticated" });
  });

  it("rejects an out-of-range hour/minute", async () => {
    const result = await updateSystemRuleAction("rule-1", validInput({ localHour: 24 }));
    expect(result).toEqual({ ok: false, error: "invalid_schedule" });
    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  it("an authorized manager can disable/enable, change the send time, and clear copy/audience overrides -- all sent to the store layer together", async () => {
    updateSystemRule.mockResolvedValue(okOutcome({ enabled: false, localHour: 19, localMinute: 30 }));

    const result = await updateSystemRuleAction("rule-1", validInput({ enabled: false }));

    expect(result.ok).toBe(true);
    expect(updateSystemRule).toHaveBeenCalledWith("rule-1", {
      enabled: false,
      localHour: 19,
      localMinute: 30,
      titleOverride: null,
      bodyOverride: null,
      audienceMode: "all_eligible",
      targetPersonIds: [],
      audienceGroupKeys: [],
      excludedPersonIds: [],
      expectedRevision: 1,
      updatedByPersonId: "p_manager",
      updatedByPersonName: "דני מנהל",
    });
  });

  it("rejects a missing/non-positive-integer expectedRevision before ever touching the store or roster", async () => {
    const zero = await updateSystemRuleAction("rule-1", validInput({ expectedRevision: 0 }));
    expect(zero).toEqual({ ok: false, error: "invalid_request" });

    const fractional = await updateSystemRuleAction("rule-1", validInput({ expectedRevision: 1.5 }));
    expect(fractional).toEqual({ ok: false, error: "invalid_request" });

    const missing = await updateSystemRuleAction("rule-1", validInput({ expectedRevision: undefined }));
    expect(missing).toEqual({ ok: false, error: "invalid_request" });

    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  it("[mandatory 6] a successful edit's returned SystemRuleView exposes the INCREMENTED revision from the store layer", async () => {
    updateSystemRule.mockResolvedValue(okOutcome({ revision: 2 }));

    const result = await updateSystemRuleAction("rule-1", validInput({ expectedRevision: 1 }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rule.revision).toBe(2);
  });

  it("a stale expectedRevision (someone else edited this rule since it was loaded) is reported as 'conflict', never silently applied", async () => {
    updateSystemRule.mockResolvedValue({ status: "conflict" as const });

    const result = await updateSystemRuleAction("rule-1", validInput({ expectedRevision: 4 }));

    expect(result).toEqual({ ok: false, error: "conflict" });
    expect(updateSystemRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ expectedRevision: 4 }));
  });

  it("a not-found/not-a-system-row id fails truthfully before ever calling the store's update", async () => {
    getNotificationRuleById.mockResolvedValue(null);

    const result = await updateSystemRuleAction("nope", validInput());

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  it("a custom_weekly row id fails truthfully -- this action never touches a custom rule", async () => {
    getNotificationRuleById.mockResolvedValue(customRow());

    const result = await updateSystemRuleAction("rule-custom-1", validInput());

    expect(result).toEqual({ ok: false, error: "not_found" });
    expect(updateSystemRule).not.toHaveBeenCalled();
  });

  describe("copy validation", () => {
    it("trims and saves a static title/body override outright (tomorrow_logistics_withdrawal -- static_editable)", async () => {
      getNotificationRuleById.mockResolvedValue(systemRow({ systemKey: "tomorrow_logistics_withdrawal" }));
      updateSystemRule.mockResolvedValue(okOutcome({ systemKey: "tomorrow_logistics_withdrawal" }));

      const result = await updateSystemRuleAction(
        "rule-1",
        validInput({ titleOverride: "  כותרת מותאמת  ", bodyOverride: "  תוכן מותאם  " }),
      );

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ titleOverride: "כותרת מותאמת", bodyOverride: "תוכן מותאם" }),
      );
    });

    it("a blank/whitespace-only override is treated as a reset to default (null), same as the explicit reset button", async () => {
      updateSystemRule.mockResolvedValue(okOutcome());

      const result = await updateSystemRuleAction("rule-1", validInput({ titleOverride: "   ", bodyOverride: "" }));

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ titleOverride: null, bodyOverride: null }));
    });

    it("rejects a too-long title override", async () => {
      const result = await updateSystemRuleAction("rule-1", validInput({ titleOverride: "א".repeat(500) }));
      expect(result).toEqual({ ok: false, error: "invalid_title" });
      expect(updateSystemRule).not.toHaveBeenCalled();
    });

    it("rejects a too-long body override", async () => {
      const result = await updateSystemRuleAction("rule-1", validInput({ bodyOverride: "א".repeat(5000) }));
      expect(result).toEqual({ ok: false, error: "invalid_body" });
      expect(updateSystemRule).not.toHaveBeenCalled();
    });

    it("a dynamic-body category's saved template MUST contain exactly one {details} -- accepted with exactly one", async () => {
      getNotificationRuleById.mockResolvedValue(systemRow({ systemKey: "tomorrow_shift" })); // dynamic_details_required
      updateSystemRule.mockResolvedValue(okOutcome({ systemKey: "tomorrow_shift" }));

      const result = await updateSystemRuleAction("rule-1", validInput({ bodyOverride: "תזכורת חשובה 👀 {details}" }));

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ bodyOverride: "תזכורת חשובה 👀 {details}" }));
    });

    it("a dynamic-body category's saved body override WITHOUT {details} is rejected server-side, never trusting the client", async () => {
      getNotificationRuleById.mockResolvedValue(systemRow({ systemKey: "tomorrow_shift" }));

      const result = await updateSystemRuleAction("rule-1", validInput({ bodyOverride: "תזכורת חשובה בלי הפרטים" }));

      expect(result).toEqual({ ok: false, error: "invalid_body_details_placeholder" });
      expect(updateSystemRule).not.toHaveBeenCalled();
    });

    it("a dynamic-body category's saved body override with {details} appearing TWICE is rejected -- exactly-one semantics", async () => {
      getNotificationRuleById.mockResolvedValue(systemRow({ systemKey: "tomorrow_shift" }));

      const result = await updateSystemRuleAction("rule-1", validInput({ bodyOverride: "{details} ... {details}" }));

      expect(result).toEqual({ ok: false, error: "invalid_body_details_placeholder" });
      expect(updateSystemRule).not.toHaveBeenCalled();
    });

    it("a static-body category's body override is NEVER required to contain {details} -- ordinary free text is accepted as-is", async () => {
      getNotificationRuleById.mockResolvedValue(systemRow({ systemKey: "constraints_sunday" })); // static_editable
      updateSystemRule.mockResolvedValue(okOutcome({ systemKey: "constraints_sunday" }));

      const result = await updateSystemRuleAction("rule-1", validInput({ bodyOverride: "תוכן חופשי לגמרי, בלי שום פרט מיוחד" }));

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ bodyOverride: "תוכן חופשי לגמרי, בלי שום פרט מיוחד" }),
      );
    });

    it("resetting BOTH title and body to null clears the overrides -- 'איפוס לברירת מחדל'", async () => {
      getNotificationRuleById.mockResolvedValue(systemRow({ systemTitleOverride: "ישן", systemBodyOverride: "ישן גם" }));
      updateSystemRule.mockResolvedValue(okOutcome());

      const result = await updateSystemRuleAction("rule-1", validInput({ titleOverride: null, bodyOverride: null }));

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ titleOverride: null, bodyOverride: null }));
    });
  });

  describe("audience validation", () => {
    it("'all_eligible' ignores any client-supplied targetPersonIds -- always forced to []", async () => {
      updateSystemRule.mockResolvedValue(okOutcome());

      const result = await updateSystemRuleAction(
        "rule-1",
        validInput({ audienceMode: "all_eligible", targetPersonIds: ["p_1", "untrusted-id"] }),
      );

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ audienceMode: "all_eligible", targetPersonIds: [] }));
    });

    it("'selected' with zero target ids is rejected -- at least one selection is required to save", async () => {
      const result = await updateSystemRuleAction("rule-1", validInput({ audienceMode: "selected", targetPersonIds: [] }));
      expect(result).toEqual({ ok: false, error: "no_targets" });
      expect(updateSystemRule).not.toHaveBeenCalled();
    });

    it("'selected' with a genuine current roster id saves it, canonicalized (deduplicated)", async () => {
      updateSystemRule.mockResolvedValue(okOutcome({ systemAudienceMode: "selected", systemTargetPersonIds: ["p_1"] }));

      const result = await updateSystemRuleAction(
        "rule-1",
        validInput({ audienceMode: "selected", targetPersonIds: ["p_1", "p_1"] }),
      );

      expect(result.ok).toBe(true);
      expect(updateSystemRule).toHaveBeenCalledWith("rule-1", expect.objectContaining({ audienceMode: "selected", targetPersonIds: ["p_1"] }));
    });

    it("a client-supplied person id that is NOT a genuine CURRENT roster member fails the WHOLE request closed -- never silently dropped, never trusting the client picker", async () => {
      const result = await updateSystemRuleAction(
        "rule-1",
        validInput({ audienceMode: "selected", targetPersonIds: ["p_1", "not-a-real-roster-id"] }),
      );

      expect(result).toEqual({ ok: false, error: "invalid_targets" });
      expect(updateSystemRule).not.toHaveBeenCalled();
    });

    it("re-fetches a FRESH roster for this validation (loadManagerWorkbookContext, not the lighter loadManagerPersonnelContext) -- a stale/cached roster is never trusted", async () => {
      updateSystemRule.mockResolvedValue(okOutcome());

      await updateSystemRuleAction("rule-1", validInput({ audienceMode: "selected", targetPersonIds: ["p_1"] }));

      expect(loadManagerWorkbookContext).toHaveBeenCalledWith(["personnel"]);
    });
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
