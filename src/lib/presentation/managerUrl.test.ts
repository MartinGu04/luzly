import { describe, expect, it } from "vitest";
import { buildManagerHref, managerCategoryNeedsAdoptionReadiness, parseManagerCategoryParam } from "./managerUrl";

const BASE = { personId: null, range: "7d" as const, month: null, category: "overview" as const };

describe("buildManagerHref", () => {
  it("the default scope (everyone, 7d, no month, overview category) is the bare /manager", () => {
    expect(buildManagerHref(BASE)).toBe("/manager");
  });

  it("a selected person adds ?person=<id>", () => {
    expect(buildManagerHref({ ...BASE, personId: "p_123" })).toBe("/manager?person=p_123");
  });

  it("a non-default range adds ?range=", () => {
    expect(buildManagerHref({ ...BASE, range: "today" })).toBe("/manager?range=today");
    expect(buildManagerHref({ ...BASE, range: "30d" })).toBe("/manager?range=30d");
  });

  it("month range with a month value adds both range and month", () => {
    expect(buildManagerHref({ ...BASE, range: "month", month: "2026-08" })).toBe(
      "/manager?range=month&month=2026-08",
    );
  });

  it("month range without a month value omits month (server defaults it)", () => {
    expect(buildManagerHref({ ...BASE, range: "month", month: null })).toBe("/manager?range=month");
  });

  it("month is never included for a non-month range, even if set", () => {
    expect(buildManagerHref({ ...BASE, range: "7d", month: "2026-08" })).toBe("/manager");
  });

  it("a non-default category adds ?category=", () => {
    expect(buildManagerHref({ ...BASE, category: "shifts" })).toBe("/manager?category=shifts");
    expect(buildManagerHref({ ...BASE, category: "personnel" })).toBe("/manager?category=personnel");
    expect(buildManagerHref({ ...BASE, category: "duties" })).toBe("/manager?category=duties");
    expect(buildManagerHref({ ...BASE, category: "logins" })).toBe("/manager?category=logins");
  });

  it("combines every non-default param", () => {
    expect(
      buildManagerHref({ personId: "p_1", range: "month", month: "2026-02", category: "shifts" }),
    ).toBe("/manager?person=p_1&range=month&month=2026-02&category=shifts");
  });
});

describe("parseManagerCategoryParam", () => {
  it("defaults to overview for missing/unknown values", () => {
    expect(parseManagerCategoryParam(undefined)).toBe("overview");
    expect(parseManagerCategoryParam(null)).toBe("overview");
    expect(parseManagerCategoryParam("bogus")).toBe("overview");
    expect(parseManagerCategoryParam("overview")).toBe("overview");
  });

  it("accepts the four other real categories", () => {
    expect(parseManagerCategoryParam("shifts")).toBe("shifts");
    expect(parseManagerCategoryParam("personnel")).toBe("personnel");
    expect(parseManagerCategoryParam("duties")).toBe("duties");
    expect(parseManagerCategoryParam("logins")).toBe("logins");
  });
});

describe("managerCategoryNeedsAdoptionReadiness", () => {
  it("is true ONLY for logins -- the sole category that renders model.adoption", () => {
    expect(managerCategoryNeedsAdoptionReadiness("logins")).toBe(true);
  });

  it("is false for overview, shifts, personnel, and duties", () => {
    expect(managerCategoryNeedsAdoptionReadiness("overview")).toBe(false);
    expect(managerCategoryNeedsAdoptionReadiness("shifts")).toBe(false);
    expect(managerCategoryNeedsAdoptionReadiness("personnel")).toBe(false);
    expect(managerCategoryNeedsAdoptionReadiness("duties")).toBe(false);
  });
});
