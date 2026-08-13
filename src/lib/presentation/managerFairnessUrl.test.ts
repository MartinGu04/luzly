import { describe, expect, it } from "vitest";
import { buildManagerFairnessHref } from "./managerFairnessUrl";

describe("buildManagerFairnessHref", () => {
  it("always includes the period explicitly (no fixed default to omit)", () => {
    expect(buildManagerFairnessHref({ period: "h1", personId: null })).toBe("/manager/fairness?period=h1");
  });

  it("includes the person id when set", () => {
    expect(buildManagerFairnessHref({ period: "h2", personId: "p_martin" })).toBe(
      "/manager/fairness?period=h2&person=p_martin",
    );
  });
});
