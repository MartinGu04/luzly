import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import { parsePersonnelSheet } from "./personnel";

describe("parsePersonnelSheet", () => {
  it("parses people and normalizes boolean/TRUE-FALSE checkbox variants", () => {
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [
        ["שם", "מייל", "מנהל", "טכנאי", 'אחמ"ש', 'סוג כ"א'],
        ["דני בדיקה", "dani@example.com", true, "FALSE", "TRUE", "קבוע"],
        ["נועה דוגמה", "noa@example.com", "false", false, "false", "מילואים"],
        ["Test User", "", "", "", "", ""],
      ],
    };

    const people = parsePersonnelSheet(sheet);

    expect(people).toHaveLength(3);

    expect(people[0]).toMatchObject({
      name: "דני בדיקה",
      email: "dani@example.com",
      isManager: true,
      isTechnician: false,
      isSupervisor: true,
      personnelType: "קבוע",
    });

    expect(people[1]).toMatchObject({
      name: "נועה דוגמה",
      isManager: false,
      isTechnician: false,
      isSupervisor: false,
    });

    expect(people[2]).toMatchObject({
      name: "Test User",
      email: null,
      personnelType: null,
    });
  });

  it("does not add an 'active' flag to the returned records", () => {
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [["שם"], ["Test User"]],
    };

    const [person] = parsePersonnelSheet(sheet);

    expect(person).not.toHaveProperty("active");
  });

  it("gives the same person the same id across separate parses", () => {
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [["שם"], ["דני בדיקה"]],
    };

    const first = parsePersonnelSheet(sheet)[0];
    const second = parsePersonnelSheet(sheet)[0];

    expect(first.id).toBe(second.id);
    expect(first.id).toMatch(/^p_[0-9a-f]{8}$/);
  });

  it("works when columns are reordered", () => {
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [
        ['סוג כ"א', "מייל", "שם"],
        ["מילואים", "noa@example.com", "נועה דוגמה"],
      ],
    };

    const [person] = parsePersonnelSheet(sheet);

    expect(person.name).toBe("נועה דוגמה");
    expect(person.email).toBe("noa@example.com");
    expect(person.personnelType).toBe("מילואים");
  });

  it("returns an empty list instead of throwing when there is no name column", () => {
    const sheet: RawSheet = { name: 'כ"א', values: [["a", "b"]] };

    expect(parsePersonnelSheet(sheet)).toEqual([]);
  });
});

// Regression: the real כ"א sheet currently has no header at all above the
// name column — only the other labels (מייל/מנהל/טכנאי/אחמ"ש/סוג כ"א) are
// present, and the name column's header cell is blank.
describe("parsePersonnelSheet — unlabeled name column (real workbook shape)", () => {
  it("infers the name column from a blank header adjacent to the recognized labels", () => {
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [
        ["מייל", "מנהל", "טכנאי", 'אחמ"ש', 'סוג כ"א', ""],
        ["dani@example.com", "TRUE", "TRUE", "TRUE", "קבע", "דני בדיקה"],
        ["noa@example.com", "FALSE", "FALSE", "FALSE", "מילואים", "נועה דוגמה"],
      ],
    };

    const people = parsePersonnelSheet(sheet);

    expect(people).toHaveLength(2);
    expect(people[0]).toMatchObject({
      name: "דני בדיקה",
      email: "dani@example.com",
      isManager: true,
      isTechnician: true,
      isSupervisor: true,
      personnelType: "קבע",
    });
    expect(people[1]).toMatchObject({ name: "נועה דוגמה", isManager: false });
  });

  it("still infers the (still-unlabeled) name column when the personnel columns move", () => {
    // Blank name column now comes BEFORE the label block, and the labels
    // themselves are reordered — nothing here sits at a fixed letter.
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [
        ["", "טכנאי", 'אחמ"ש', "מייל", 'סוג כ"א', "מנהל"],
        ["דני בדיקה", "TRUE", "FALSE", "dani@example.com", "קבע", "TRUE"],
      ],
    };

    const [person] = parsePersonnelSheet(sheet);

    expect(person).toMatchObject({
      name: "דני בדיקה",
      email: "dani@example.com",
      isTechnician: true,
      isSupervisor: false,
      isManager: true,
      personnelType: "קבע",
    });
  });

  it("still prefers an explicit name header when one is present", () => {
    const sheet: RawSheet = {
      name: 'כ"א',
      values: [
        ["שם", "מייל"],
        ["דני בדיקה", "dani@example.com"],
      ],
    };

    const [person] = parsePersonnelSheet(sheet);

    expect(person.name).toBe("דני בדיקה");
  });
});
