import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getReportOneReserveInclusionServiceClient: () => fakeClient }));
  return import("./store");
}

describe("getReserveInclusionPreferences", () => {
  it("1. returns an empty map without querying at all when there are no personIds to look up", async () => {
    const client = {
      from: () => {
        throw new Error("must never query when personIds is empty");
      },
    };
    const { getReserveInclusionPreferences } = await loadModule(client);

    const result = await getReserveInclusionPreferences([]);

    expect(result.size).toBe(0);
  });

  it("18. returns only EXPLICIT saved rows, keyed by the stable person_id -- a person with no row is simply absent from the map (never defaulted here)", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      from: (table: string) => {
        expect(table).toBe("report_one_reserve_inclusion");
        return {
          select: (columns: string) => {
            calls.select = columns;
            return {
              in: (column: string, values: unknown) => {
                calls.in = [column, values];
                return Promise.resolve({
                  data: [{ person_id: "p_roi", included: false }],
                  error: null,
                });
              },
            };
          },
        };
      },
    };
    const { getReserveInclusionPreferences } = await loadModule(client);

    const result = await getReserveInclusionPreferences(["p_roi", "p_hila"]);

    expect(calls.in).toEqual(["person_id", ["p_roi", "p_hila"]]);
    expect(result.get("p_roi")).toBe(false);
    expect(result.has("p_hila")).toBe(false);
  });

  it("throws on a genuine query error", async () => {
    const client = {
      from: () => ({
        select: () => ({
          in: () => Promise.resolve({ data: null, error: new Error("db down") }),
        }),
      }),
    };
    const { getReserveInclusionPreferences } = await loadModule(client);

    await expect(getReserveInclusionPreferences(["p_roi"])).rejects.toThrow("db down");
  });
});

describe("setReserveInclusionPreference", () => {
  it("12. upserts the exact person_id/included/audit fields", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      from: (table: string) => {
        expect(table).toBe("report_one_reserve_inclusion");
        return {
          upsert: (row: Record<string, unknown>) => {
            calls.row = row;
            return Promise.resolve({ error: null });
          },
        };
      },
    };
    const { setReserveInclusionPreference } = await loadModule(client);

    await setReserveInclusionPreference("p_roi", false, "p_manager", "דני מנהל");

    const row = calls.row as Record<string, unknown>;
    expect(row.person_id).toBe("p_roi");
    expect(row.included).toBe(false);
    expect(row.updated_by_person_id).toBe("p_manager");
    expect(row.updated_by_person_name).toBe("דני מנהל");
    expect(typeof row.updated_at).toBe("string");
  });

  it("throws on a genuine write error", async () => {
    const client = { from: () => ({ upsert: () => Promise.resolve({ error: new Error("write failed") }) }) };
    const { setReserveInclusionPreference } = await loadModule(client);

    await expect(setReserveInclusionPreference("p_roi", true, "p_manager", "דני מנהל")).rejects.toThrow("write failed");
  });
});
