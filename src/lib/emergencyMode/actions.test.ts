import { afterEach, describe, expect, it, vi } from "vitest";
import type { Person } from "@/lib/domain/types";

const getRequestAuthenticatedIdentity = vi.fn();
const loadManagerPersonnelContext = vi.fn();
const activateEmergencyMode = vi.fn();
const deactivateEmergencyMode = vi.fn();
const revalidatePath = vi.fn();

vi.mock("@/lib/auth/getRequestAuthenticatedIdentity", () => ({ getRequestAuthenticatedIdentity }));
vi.mock("@/lib/readModels/managerWorkbookContext", () => ({ loadManagerPersonnelContext }));
vi.mock("./store", () => ({ activateEmergencyMode, deactivateEmergencyMode }));
vi.mock("next/cache", () => ({ revalidatePath }));

const { activateEmergencyModeAction, deactivateEmergencyModeAction } = await import("./actions");

const MANAGER: Person = {
  id: "mgr1",
  name: "מנהל בדיקה",
  email: "manager@example.invalid",
  isManager: true,
  isTechnician: false,
  isSupervisor: false,
  personnelType: "קבע",
  dischargeDate: null,
  enlistmentDate: null,
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("activateEmergencyModeAction -- manager-only, never trusts the client", () => {
  it("rejects a non-manager caller server-side and never calls the store", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });

    const result = await activateEmergencyModeAction();

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(activateEmergencyMode).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated/unmapped caller", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "unmapped" });

    const result = await activateEmergencyModeAction();

    expect(result).toEqual({ ok: false, error: "unmapped" });
    expect(activateEmergencyMode).not.toHaveBeenCalled();
  });

  it("activates using the server-derived manager identity (never a client-supplied one) and revalidates the app layout", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [MANAGER] } });
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "manager@example.invalid", avatarUrl: null, createdAt: "2020-01-01T00:00:00.000Z" });
    activateEmergencyMode.mockResolvedValue({ status: "activated", periodId: "period1", activatedAt: "2026-08-26T14:00:00.000Z" });

    const result = await activateEmergencyModeAction();

    expect(result).toEqual({ ok: true, status: "activated" });
    expect(activateEmergencyMode).toHaveBeenCalledWith("u1", "mgr1", "מנהל בדיקה", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("surfaces already_active (a concurrent double-click) without erroring", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [MANAGER] } });
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "manager@example.invalid", avatarUrl: null, createdAt: "2020-01-01T00:00:00.000Z" });
    activateEmergencyMode.mockResolvedValue({ status: "already_active", periodId: "period1", activatedAt: "2026-08-26T14:00:00.000Z" });

    const result = await activateEmergencyModeAction();

    expect(result).toEqual({ ok: true, status: "already_active" });
  });
});

describe("deactivateEmergencyModeAction -- manager-only, never trusts the client", () => {
  it("rejects a non-manager caller server-side", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "forbidden" });

    const result = await deactivateEmergencyModeAction();

    expect(result).toEqual({ ok: false, error: "forbidden" });
    expect(deactivateEmergencyMode).not.toHaveBeenCalled();
  });

  it("deactivates using the server-derived manager identity and revalidates the app layout", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [MANAGER] } });
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "manager@example.invalid", avatarUrl: null, createdAt: "2020-01-01T00:00:00.000Z" });
    deactivateEmergencyMode.mockResolvedValue({ status: "deactivated", periodId: "period1", deactivatedAt: "2026-08-27T08:00:00.000Z" });

    const result = await deactivateEmergencyModeAction();

    expect(result).toEqual({ ok: true, status: "deactivated" });
    expect(deactivateEmergencyMode).toHaveBeenCalledWith("u1", "mgr1", "מנהל בדיקה", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("surfaces already_inactive (a concurrent double-click) without erroring", async () => {
    loadManagerPersonnelContext.mockResolvedValue({ status: "ok", context: { manager: MANAGER, people: [MANAGER] } });
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: "u1", email: "manager@example.invalid", avatarUrl: null, createdAt: "2020-01-01T00:00:00.000Z" });
    deactivateEmergencyMode.mockResolvedValue({ status: "already_inactive", periodId: null, deactivatedAt: null });

    const result = await deactivateEmergencyModeAction();

    expect(result).toEqual({ ok: true, status: "already_inactive" });
  });
});
