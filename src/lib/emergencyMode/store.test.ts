import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getEmergencyModeServiceClient: () => fakeClient }));
  return import("./store");
}

describe("getActiveEmergencyModePeriod", () => {
  it("returns null when no period is active", async () => {
    const client = {
      from: () => ({
        select: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      }),
    };
    const { getActiveEmergencyModePeriod } = await loadModule(client);

    expect(await getActiveEmergencyModePeriod()).toBeNull();
  });

  it("maps the active db row to camelCase", async () => {
    const row = {
      id: "period1",
      activated_at: "2026-08-26T14:00:00.000Z",
      activated_by_user_id: "u1",
      activated_by_person_id: "p1",
      activated_by_person_name: "מנהל בדיקה",
      start_date: "2026-08-26",
      deactivated_at: null,
      deactivated_by_user_id: null,
      deactivated_by_person_id: null,
      deactivated_by_person_name: null,
      end_date: null,
    };
    const client = {
      from: () => ({
        select: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }) }),
      }),
    };
    const { getActiveEmergencyModePeriod } = await loadModule(client);

    expect(await getActiveEmergencyModePeriod()).toEqual({
      id: "period1",
      activatedAt: "2026-08-26T14:00:00.000Z",
      activatedByUserId: "u1",
      activatedByPersonId: "p1",
      activatedByPersonName: "מנהל בדיקה",
      startDate: "2026-08-26",
      deactivatedAt: null,
      deactivatedByUserId: null,
      deactivatedByPersonId: null,
      deactivatedByPersonName: null,
      endDate: null,
    });
  });

  it("throws on a genuine db error -- never silently swallowed", async () => {
    const client = {
      from: () => ({
        select: () => ({ is: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: new Error("db down") }) }) }),
      }),
    };
    const { getActiveEmergencyModePeriod } = await loadModule(client);

    await expect(getActiveEmergencyModePeriod()).rejects.toThrow("db down");
  });
});

describe("activateEmergencyMode", () => {
  it("calls the atomic RPC with exact snake_case params", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.fn = fn;
        calls.args = args;
        return { single: () => Promise.resolve({ data: { status: "activated", period_id: "period1", activated_at: "2026-08-26T14:00:00.000Z" }, error: null }) };
      },
    };
    const { activateEmergencyMode } = await loadModule(client);

    const result = await activateEmergencyMode("u1", "p1", "מנהל בדיקה", "2026-08-26");

    expect(calls.fn).toBe("activate_emergency_mode");
    expect(calls.args).toEqual({
      p_user_id: "u1",
      p_person_id: "p1",
      p_person_name: "מנהל בדיקה",
      p_start_date: "2026-08-26",
    });
    expect(result).toEqual({ status: "activated", periodId: "period1", activatedAt: "2026-08-26T14:00:00.000Z" });
  });

  it("surfaces already_active without treating it as an error", async () => {
    const client = {
      rpc: () => ({ single: () => Promise.resolve({ data: { status: "already_active", period_id: "period1", activated_at: "2026-08-26T14:00:00.000Z" }, error: null }) }),
    };
    const { activateEmergencyMode } = await loadModule(client);

    const result = await activateEmergencyMode("u2", "p2", "מנהל אחר", "2026-08-26");

    expect(result.status).toBe("already_active");
    expect(result.periodId).toBe("period1");
  });

  it("throws on a genuine RPC error", async () => {
    const client = { rpc: () => ({ single: () => Promise.resolve({ data: null, error: new Error("db down") }) }) };
    const { activateEmergencyMode } = await loadModule(client);

    await expect(activateEmergencyMode("u1", "p1", "מנהל בדיקה", "2026-08-26")).rejects.toThrow("db down");
  });
});

describe("deactivateEmergencyMode", () => {
  it("calls the atomic RPC with exact snake_case params", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.fn = fn;
        calls.args = args;
        return { single: () => Promise.resolve({ data: { status: "deactivated", period_id: "period1", deactivated_at: "2026-08-27T08:00:00.000Z" }, error: null }) };
      },
    };
    const { deactivateEmergencyMode } = await loadModule(client);

    const result = await deactivateEmergencyMode("u1", "p1", "מנהל בדיקה", "2026-08-27");

    expect(calls.fn).toBe("deactivate_emergency_mode");
    expect(calls.args).toEqual({
      p_user_id: "u1",
      p_person_id: "p1",
      p_person_name: "מנהל בדיקה",
      p_end_date: "2026-08-27",
    });
    expect(result).toEqual({ status: "deactivated", periodId: "period1", deactivatedAt: "2026-08-27T08:00:00.000Z" });
  });

  it("surfaces already_inactive with null period fields, never an error", async () => {
    const client = {
      rpc: () => ({ single: () => Promise.resolve({ data: { status: "already_inactive", period_id: null, deactivated_at: null }, error: null }) }),
    };
    const { deactivateEmergencyMode } = await loadModule(client);

    const result = await deactivateEmergencyMode("u1", "p1", "מנהל בדיקה", "2026-08-27");

    expect(result).toEqual({ status: "already_inactive", periodId: null, deactivatedAt: null });
  });
});

describe("getAllEmergencyModePeriods", () => {
  it("maps every row, most-recent-first as ordered by the query", async () => {
    const rows = [
      {
        id: "period2",
        activated_at: "2026-09-01T10:00:00.000Z",
        activated_by_user_id: "u1",
        activated_by_person_id: "p1",
        activated_by_person_name: "מנהל",
        start_date: "2026-09-01",
        deactivated_at: null,
        deactivated_by_user_id: null,
        deactivated_by_person_id: null,
        deactivated_by_person_name: null,
        end_date: null,
      },
    ];
    const client = {
      from: () => ({ select: () => ({ order: () => Promise.resolve({ data: rows, error: null }) }) }),
    };
    const { getAllEmergencyModePeriods } = await loadModule(client);

    const result = await getAllEmergencyModePeriods();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("period2");
  });
});
