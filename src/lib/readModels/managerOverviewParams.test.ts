import { describe, expect, it } from "vitest";
import { parseManagerOverviewSearchParams } from "./managerOverviewParams";

describe("parseManagerOverviewSearchParams", () => {
  it("defaults: no params at all -> everyone, 7d, no month, problems off", () => {
    const params = parseManagerOverviewSearchParams({});
    expect(params).toEqual({ personId: null, range: "7d", month: null, problemsOnly: false });
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

  it("problems=1 is the only value that enables problemsOnly", () => {
    expect(parseManagerOverviewSearchParams({ problems: "1" }).problemsOnly).toBe(true);
    expect(parseManagerOverviewSearchParams({ problems: "true" }).problemsOnly).toBe(false);
    expect(parseManagerOverviewSearchParams({ problems: "0" }).problemsOnly).toBe(false);
  });

  it("takes the first value when Next.js gives an array (repeated query key)", () => {
    const params = parseManagerOverviewSearchParams({
      person: ["p_1", "p_2"],
      range: ["30d", "today"],
      month: ["2026-01", "2026-02"],
      problems: ["1", "0"],
    });
    expect(params).toEqual({ personId: "p_1", range: "30d", month: "2026-01", problemsOnly: true });
  });
});
