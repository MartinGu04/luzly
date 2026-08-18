import { describe, expect, it } from "vitest";
import { parseManagerOverviewSearchParams } from "./managerOverviewParams";

describe("parseManagerOverviewSearchParams", () => {
  it("defaults: no params at all -> everyone, 7d, no month", () => {
    const params = parseManagerOverviewSearchParams({});
    expect(params).toEqual({ personId: null, range: "7d", month: null });
  });

  it("person=all is treated the same as omitted -- everyone", () => {
    expect(parseManagerOverviewSearchParams({ person: "all" }).personId).toBeNull();
  });

  it("a specific person id is preserved as-is", () => {
    expect(parseManagerOverviewSearchParams({ person: "p_123" }).personId).toBe("p_123");
  });

  it("range is validated via parseManagerRangeParam (invalid falls back to 7d)", () => {
    expect(parseManagerOverviewSearchParams({ range: "today" }).range).toBe("today");
    expect(parseManagerOverviewSearchParams({ range: "bogus" }).range).toBe("7d");
  });

  it("month is passed through raw (validated later by resolveManagerDateRange)", () => {
    expect(parseManagerOverviewSearchParams({ month: "2026-08" }).month).toBe("2026-08");
    expect(parseManagerOverviewSearchParams({ month: "not-a-month" }).month).toBe("not-a-month");
  });

  it("takes the first value when Next.js gives an array (repeated query key)", () => {
    const params = parseManagerOverviewSearchParams({
      person: ["p_1", "p_2"],
      range: ["30d", "today"],
      month: ["2026-01", "2026-02"],
    });
    expect(params).toEqual({ personId: "p_1", range: "30d", month: "2026-01" });
  });
});
