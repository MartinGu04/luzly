import { describe, expect, it, vi } from "vitest";

const loadManagerOverviewReadModel = vi.fn();

vi.mock("./managerOverview", () => ({ loadManagerOverviewReadModel }));

const { getRequestManagerOverview } = await import("./getRequestManagerOverview");

/**
 * Same caveat as `getRequestPersonalSchedule.test.ts`: true cross-call
 * dedup comes from React's `cache()` dispatcher, only present inside a
 * real Server Component render. This suite verifies correct delegation.
 */
describe("getRequestManagerOverview", () => {
  it("delegates to loadManagerOverviewReadModel with the given params", async () => {
    loadManagerOverviewReadModel.mockResolvedValue({ status: "forbidden" });

    const result = await getRequestManagerOverview("p_1", "7d", null);

    expect(result).toEqual({ status: "forbidden" });
    expect(loadManagerOverviewReadModel).toHaveBeenCalledWith({
      personId: "p_1",
      range: "7d",
      month: null,
    });
  });

  it("accepts distinct primitive args for person/range/month (cache-friendly, not one object literal)", async () => {
    loadManagerOverviewReadModel.mockResolvedValue({ status: "ok", model: {} });
    await getRequestManagerOverview(null, "month", "2026-08");
    expect(loadManagerOverviewReadModel).toHaveBeenCalledWith({
      personId: null,
      range: "month",
      month: "2026-08",
    });
  });
});
