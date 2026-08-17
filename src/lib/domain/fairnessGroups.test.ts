import { describe, expect, it } from "vitest";
import { buildFairnessComparisonGroups, buildFairnessPersonContext } from "./fairnessGroups";
import type { Person } from "./types";

const PERIOD_START = "2026-08-01";
const PERIOD_END = "2026-08-31";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_x",
    name: "שם",
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: "חובה",
    ...overrides,
  };
}

describe("buildFairnessComparisonGroups", () => {
  it("groups by actual rotation capability, never by personnelType/title", () => {
    const supervisor = person({ id: "p_sup", isSupervisor: true });
    const technician = person({ id: "p_tech", isTechnician: true });
    const other = person({ id: "p_other" });

    const groups = buildFairnessComparisonGroups([supervisor, technician, other]);

    expect(groups).toEqual([
      { key: "supervisor", personIds: ["p_sup"] },
      { key: "technician", personIds: ["p_tech"] },
      { key: "other", personIds: ["p_other"] },
    ]);
  });

  it("an empty group is omitted, never rendered as an empty bucket", () => {
    const technician = person({ id: "p_tech", isTechnician: true });
    const groups = buildFairnessComparisonGroups([technician]);
    expect(groups).toEqual([{ key: "technician", personIds: ["p_tech"] }]);
  });

  it("supervisor takes precedence for a dual-capability person -- appears once, in supervisor only", () => {
    const dual = person({ id: "p_dual", isSupervisor: true, isTechnician: true });
    const groups = buildFairnessComparisonGroups([dual]);
    expect(groups).toEqual([{ key: "supervisor", personIds: ["p_dual"] }]);
  });

  it('אחמ"ש + ר"צ: a person whose personnelType/title metadata is anything else still lands in the supervisor group purely from isSupervisor -- role-title text is never consulted', () => {
    // מי-מה-מו does not store a "ר״צ" title field on Person today -- only
    // the personnelType service category (קבע/חובה/מילואים) and the
    // isSupervisor/isTechnician capability flags. This test documents the
    // domain rule that will keep such a person correctly grouped once
    // richer role-metadata (e.g. a displayed "אחמ״ש + ר״צ" label) exists:
    // grouping never depends on that metadata, only on actual capability.
    const razatzhWhoWorksSupervisorRotation = person({
      id: "p_razatzh",
      personnelType: "קבע",
      isSupervisor: true,
      isTechnician: false,
    });
    const groups = buildFairnessComparisonGroups([razatzhWhoWorksSupervisorRotation]);
    expect(groups).toEqual([{ key: "supervisor", personIds: ["p_razatzh"] }]);
  });
});

describe("buildFairnessPersonContext", () => {
  it("ties group + participation + eligibility + combined data completeness together", () => {
    const p = person({ id: "p_ctx", isSupervisor: true, personnelType: "חובה" });
    const context = buildFairnessPersonContext(p, [], PERIOD_START, PERIOD_END);

    expect(context.personId).toBe("p_ctx");
    expect(context.group).toBe("supervisor");
    expect(context.participation.basis).toBe("full_period");
    expect(context.eligibility).toHaveLength(2);
    expect(context.eligibility.find((entry) => entry.role === "supervisor")?.eligible).toBe(true);
    expect(context.eligibility.find((entry) => entry.role === "technician")?.eligible).toBe(false);
    // eligibility is always partial ("eligibility_undated") -- so the combined result is too, even though participation was complete.
    expect(context.dataCompleteness.status).toBe("partial");
    expect(context.dataCompleteness.reasons).toContain("eligibility_undated");
  });

  it("carries participation's own incompleteness reason through to the combined result", () => {
    const p = person({ id: "p_res", personnelType: "מילואים" });
    const context = buildFairnessPersonContext(p, [], PERIOD_START, PERIOD_END);
    expect(context.participation.basis).toBe("unknown");
    expect(context.dataCompleteness.reasons).toEqual(
      expect.arrayContaining(["participation_unknown", "eligibility_undated"]),
    );
  });
});
