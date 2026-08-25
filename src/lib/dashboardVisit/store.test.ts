import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function loadModule(fakeClient: unknown) {
  vi.doMock("./serviceClient", () => ({ getDashboardVisitServiceClient: () => fakeClient }));
  return import("./store");
}

describe("getLastVisitedAt", () => {
  it("returns the stored timestamp for an existing row", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      from: (table: string) => {
        expect(table).toBe("dashboard_visit_state");
        return {
          select: (columns: string) => {
            calls.select = columns;
            return {
              eq: (column: string, value: unknown) => {
                calls.eq = [column, value];
                return {
                  maybeSingle: () =>
                    Promise.resolve({ data: { last_visited_at: "2026-08-24T20:00:00.000Z" }, error: null }),
                };
              },
            };
          },
        };
      },
    };
    const { getLastVisitedAt } = await loadModule(client);

    const result = await getLastVisitedAt("u_me");

    expect(result).toBe("2026-08-24T20:00:00.000Z");
    expect(calls.eq).toEqual(["user_id", "u_me"]);
  });

  it("returns null (never throws) when the user has no stored row -- the ordinary first-visit state", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    };
    const { getLastVisitedAt } = await loadModule(client);

    const result = await getLastVisitedAt("u_me");

    expect(result).toBeNull();
  });

  it("throws on a genuine query error (never silently swallowed here -- the caller decides fail-safe behavior)", async () => {
    const client = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () => Promise.resolve({ data: null, error: new Error("db down") }),
          }),
        }),
      }),
    };
    const { getLastVisitedAt } = await loadModule(client);

    await expect(getLastVisitedAt("u_me")).rejects.toThrow("db down");
  });
});

describe("recordDashboardVisit", () => {
  it("calls the record_dashboard_visit RPC with the exact user id and visited-at instant", async () => {
    const calls: Record<string, unknown> = {};
    const client = {
      rpc: (fn: string, args: Record<string, unknown>) => {
        calls.fn = fn;
        calls.args = args;
        return Promise.resolve({ data: null, error: null });
      },
    };
    const { recordDashboardVisit } = await loadModule(client);

    await recordDashboardVisit("u_me", "2026-08-25T10:00:00.000Z");

    expect(calls.fn).toBe("record_dashboard_visit");
    expect(calls.args).toEqual({ p_user_id: "u_me", p_visited_at: "2026-08-25T10:00:00.000Z" });
  });

  it("never writes via a plain .from().upsert() -- always through the atomic RPC", async () => {
    const client = {
      from: () => {
        throw new Error("recordDashboardVisit must never call .from() directly -- it must go through the RPC");
      },
      rpc: () => Promise.resolve({ data: null, error: null }),
    };
    const { recordDashboardVisit } = await loadModule(client);

    await expect(recordDashboardVisit("u_me", "2026-08-25T10:00:00.000Z")).resolves.toBeUndefined();
  });

  it("throws on an RPC error", async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: new Error("write failed") }) };
    const { recordDashboardVisit } = await loadModule(client);

    await expect(recordDashboardVisit("u_me", "2026-08-25T10:00:00.000Z")).rejects.toThrow("write failed");
  });
});
