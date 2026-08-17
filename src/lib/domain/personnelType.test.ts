import { describe, expect, it } from "vitest";
import { classifyPersonnelType, classifyRoleGroup } from "./personnelType";

describe("classifyPersonnelType", () => {
  it("קבע -> permanent", () => {
    expect(classifyPersonnelType("קבע")).toBe("permanent");
  });

  it("חובה -> regular", () => {
    expect(classifyPersonnelType("חובה")).toBe("regular");
  });

  it("מילואים -> reserve", () => {
    expect(classifyPersonnelType("מילואים")).toBe("reserve");
  });

  it("null -> unclassified", () => {
    expect(classifyPersonnelType(null)).toBe("unclassified");
  });

  it("an unrecognized string -> unclassified, never dropped/guessed", () => {
    expect(classifyPersonnelType("משהו אחר")).toBe("unclassified");
  });

  it("trims/collapses whitespace only -- no fuzzy matching", () => {
    expect(classifyPersonnelType("  קבע  ")).toBe("permanent");
    expect(classifyPersonnelType("חובה   ")).toBe("regular");
    expect(classifyPersonnelType("  מילואים")).toBe("reserve");
  });

  it("never partial-matches -- a string merely containing a valid label is unclassified", () => {
    expect(classifyPersonnelType("קבע לשעבר")).toBe("unclassified");
    expect(classifyPersonnelType("לא חובה")).toBe("unclassified");
  });
});

describe("classifyRoleGroup", () => {
  it("isSupervisor takes precedence even when also isTechnician -- one group only", () => {
    expect(classifyRoleGroup({ isSupervisor: true, isTechnician: true })).toBe("supervisor");
  });

  it("technician-only resolves to technician", () => {
    expect(classifyRoleGroup({ isSupervisor: false, isTechnician: true })).toBe("technician");
  });

  it("neither flag resolves to other", () => {
    expect(classifyRoleGroup({ isSupervisor: false, isTechnician: false })).toBe("other");
  });
});
