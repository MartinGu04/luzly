import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getShootingRangesServiceClient: () => fakeClient }));
  return import("./store");
}

describe("confirmShootingRangeOccurrences", () => {
  it("calls the atomic RPC with the exact snake_case params and dedupes/spreads the confirmed id list", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.fn = fn;
        calls.args = args;
        return Promise.resolve({
          data: [{ person_id: "p1", resolved_status: "confirmed" }, { person_id: "p2", resolved_status: "not_completed" }],
          error: null,
        });
      },
    };
    const { confirmShootingRangeOccurrences } = await loadModule(client);

    const result = await confirmShootingRangeOccurrences("2026-09-01", ["p1", "p1"], "mgr1", "מנהל בדיקה");

    expect(calls.fn).toBe("confirm_shooting_range_occurrences");
    expect(calls.args).toEqual({
      p_range_date: "2026-09-01",
      p_confirmed_person_ids: ["p1", "p1"],
      p_resolver_person_id: "mgr1",
      p_resolver_person_name: "מנהל בדיקה",
    });
    expect(result).toEqual({ confirmedPersonIds: ["p1"], rejectedPersonIds: ["p2"] });
  });

  it("returns empty arrays (never a guess) when the RPC resolves nothing -- e.g. a full replay after everything was already resolved", async () => {
    const client = { rpc: () => Promise.resolve({ data: [], error: null }) };
    const { confirmShootingRangeOccurrences } = await loadModule(client);

    const result = await confirmShootingRangeOccurrences("2026-09-01", ["p1"], "mgr1", "מנהל בדיקה");

    expect(result).toEqual({ confirmedPersonIds: [], rejectedPersonIds: [] });
  });

  it("throws on a genuine RPC error -- never silently swallowed", async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: new Error("db down") }) };
    const { confirmShootingRangeOccurrences } = await loadModule(client);

    await expect(confirmShootingRangeOccurrences("2026-09-01", ["p1"], "mgr1", "מנהל בדיקה")).rejects.toThrow("db down");
  });
});
