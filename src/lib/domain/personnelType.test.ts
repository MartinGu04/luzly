import { describe, expect, it } from "vitest";
import { classifyPersonnelType } from "./personnelType";

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
