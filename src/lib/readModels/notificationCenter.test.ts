import { beforeEach, describe, expect, it, vi } from "vitest";

const loadManagerPersonnelContext = vi.fn();
const computeNotificationReadiness = vi.fn();

vi.mock("./managerWorkbookContext", () => ({ loadManagerPersonnelContext }));
vi.mock("@/lib/notifications/engine/readiness", () => ({ computeNotificationReadiness }));

const { loadNotificationCenterContext } = await import("./notificationCenter");

const MANAGER = { id: "p_manager", name: "דני מנהל", email: "dani@example.invalid", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null };
const MARTIN = { id: "p_martin", name: "מרטין בדיקה", email: "martin@example.invalid", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" };

beforeEach(() => {
  loadManagerPersonnelContext.mockReset();
  computeNotificationReadiness.mockReset();
  loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [MANAGER, MARTIN] } });
  computeNotificationReadiness.mockResolvedValue([]);
});

describe("loadNotificationCenterContext — authorization pass-through", () => {
  it.each(["unauthenticated", "missing_email", "unmapped", "ambiguous_identity", "forbidden"] as const)(
    "%s: passes the non-ok status straight through, never builds a context",
    async (status) => {
      loadManagerPersonnelContext.mockResolvedValue({ status });
      const result = await loadNotificationCenterContext(true);
      expect(result).toEqual({ status });
    },
  );

  it("never calls computeNotificationReadiness when authorization fails", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });
    await loadNotificationCenterContext(true);
    expect(computeNotificationReadiness).not.toHaveBeenCalled();
  });
});

describe("loadNotificationCenterContext — needsRosterAndAdoption gating", () => {
  it("true: builds the roster and calls computeNotificationReadiness exactly once, with the full roster", async () => {
    const result = await loadNotificationCenterContext(true);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.roster).toEqual([
      { id: "p_manager", name: "דני מנהל", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
      { id: "p_martin", name: "מרטין בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: "חובה" },
    ]);
    expect(computeNotificationReadiness).toHaveBeenCalledTimes(1);
    expect(computeNotificationReadiness.mock.calls[0][0]).toHaveLength(2);
  });

  it("false (e.g. היסטוריה): never calls computeNotificationReadiness, roster/adoptionPeople are both empty", async () => {
    const result = await loadNotificationCenterContext(false);
    expect(computeNotificationReadiness).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.roster).toEqual([]);
    expect(result.context.adoptionPeople).toEqual([]);
  });

  it("still authorizes (calls loadManagerPersonnelContext) even when needsRosterAndAdoption is false", async () => {
    await loadNotificationCenterContext(false);
    expect(loadManagerPersonnelContext).toHaveBeenCalledTimes(1);
  });
});

describe("loadNotificationCenterContext — adoptionPeople projection", () => {
  it("threads a resolved readiness result into the safe adoption projection", async () => {
    computeNotificationReadiness.mockResolvedValue([
      { personId: "p_manager", status: "ready", avatarUrl: null },
      { personId: "p_martin", status: "no_push_subscription", avatarUrl: null },
    ]);
    const result = await loadNotificationCenterContext(true);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.adoptionPeople).toHaveLength(2);
    const martin = result.context.adoptionPeople.find((p) => p.personId === "p_martin");
    expect(martin?.notificationStatus).toBe("not_enabled");
  });

  it("degrades to an empty adoptionPeople list (never throws) when the readiness lookup itself fails", async () => {
    computeNotificationReadiness.mockRejectedValue(new Error("supabase unreachable"));
    const result = await loadNotificationCenterContext(true);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.context.adoptionPeople).toEqual([]);
    // The roster itself is unaffected by an adoption-lookup failure -- the picker still works, on initials.
    expect(result.context.roster).toHaveLength(2);
  });

  it("never leaks an email or auth user id anywhere in the serialized result", async () => {
    computeNotificationReadiness.mockResolvedValue([{ personId: "p_martin", status: "ready", avatarUrl: null }]);
    const result = await loadNotificationCenterContext(true);
    expect(JSON.stringify(result)).not.toContain("martin@example.invalid");
    expect(JSON.stringify(result)).not.toContain("dani@example.invalid");
  });
});
