import { describe, expect, it } from "vitest";
import { resolveFairnessExemption, resolveFairnessExemptions } from "./fairnessExemptions";

describe("resolveFairnessExemption — known mappings", () => {
  it('"שמירות" affects guard', () => {
    expect(resolveFairnessExemption("שמירות")).toEqual({ raw: "שמירות", affectedDutyFamilies: ["guard"] });
  });

  it('"מטבח" affects daily_kitchen, full_kitchen, and weekend_kitchen', () => {
    expect(resolveFairnessExemption("מטבח").affectedDutyFamilies).toEqual([
      "daily_kitchen",
      "full_kitchen",
      "weekend_kitchen",
    ]);
  });

  it('רס"ר affects rasar', () => {
    expect(resolveFairnessExemption('רס"ר').affectedDutyFamilies).toEqual(["rasar"]);
  });

  it("an unknown exemption is preserved raw with no invented duty-family mapping", () => {
    const result = resolveFairnessExemption("פטור מוזר שלא קיים");
    expect(result.raw).toBe("פטור מוזר שלא קיים");
    expect(result.affectedDutyFamilies).toEqual([]);
  });
});

describe("resolveFairnessExemptions — order-preserving batch resolution", () => {
  it('"מטבח, רס"ר" both mappings present, in order', () => {
    const result = resolveFairnessExemptions(["מטבח", 'רס"ר']);
    expect(result).toEqual([
      { raw: "מטבח", affectedDutyFamilies: ["daily_kitchen", "full_kitchen", "weekend_kitchen"] },
      { raw: 'רס"ר', affectedDutyFamilies: ["rasar"] },
    ]);
  });

  it("empty input -> empty output", () => {
    expect(resolveFairnessExemptions([])).toEqual([]);
  });
});
