import { describe, expect, it } from "vitest";
import { buildManagerHref } from "./managerUrl";

const BASE = { personId: null, range: "7d" as const, month: null, problemsOnly: false };

describe("buildManagerHref", () => {
  it("the default scope (everyone, 7d, no month, no problems-only) is the bare /manager", () => {
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

  it("problemsOnly adds ?problems=1", () => {
    expect(buildManagerHref({ ...BASE, problemsOnly: true })).toBe("/manager?problems=1");
  });

  it("combines every non-default param", () => {
    expect(
      buildManagerHref({ personId: "p_1", range: "month", month: "2026-02", problemsOnly: true }),
    ).toBe("/manager?person=p_1&range=month&month=2026-02&problems=1");
  });
});
