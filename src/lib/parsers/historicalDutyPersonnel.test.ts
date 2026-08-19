import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import type { Person } from "@/lib/domain/types";
import { resolveHistoricalDutyPersonnel } from "./historicalDutyPersonnel";
import { stableIdFromName } from "./personnel";

function syntheticPerson(name: string): Person {
  return {
    id: `id_${name}`,
    name,
    email: null,
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
  };
}

const DANI = syntheticPerson("דני בדיקה");
const currentPeople = [DANI];

function scheduleSheetWithHeaders(...headerTexts: string[]): RawSheet {
  return {
    name: "משמרות + תורנויות",
    values: [["תאריך", "יום", ...headerTexts], ["05/01/2026", "ב", ...headerTexts.map(() => "בוקר")]],
  };
}

describe("resolveHistoricalDutyPersonnel", () => {
  it("mints a stand-in when both a real schedule column and a real unresolved Fairness row exist", () => {
    const sheet = scheduleSheetWithHeaders("עומר עזוב");
    const result = resolveHistoricalDutyPersonnel(sheet, currentPeople, ["עומר עזוב"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: stableIdFromName("עומר עזוב"),
      name: "עומר עזוב",
      email: null,
      isManager: false,
      isTechnician: false,
      isSupervisor: false,
      personnelType: null,
    });
  });

  it("does not mint a stand-in for a name already in the current roster", () => {
    const sheet = scheduleSheetWithHeaders(DANI.name);
    const result = resolveHistoricalDutyPersonnel(sheet, currentPeople, [DANI.name]);
    expect(result).toEqual([]);
  });

  it("does not mint a stand-in from a schedule header with no corroborating unresolved Fairness row", () => {
    const sheet = scheduleSheetWithHeaders("עומר עזוב");
    const result = resolveHistoricalDutyPersonnel(sheet, currentPeople, []);
    expect(result).toEqual([]);
  });

  it("does not mint a stand-in from an unresolved Fairness row with no corroborating schedule column", () => {
    const sheet = scheduleSheetWithHeaders(); // no extra headers at all
    const result = resolveHistoricalDutyPersonnel(sheet, currentPeople, ["עומר עזוב"]);
    expect(result).toEqual([]);
  });

  it("requires exact whitespace-normalized name equality, not fuzzy matching", () => {
    const sheet = scheduleSheetWithHeaders("עומר  עזוב"); // double space
    const result = resolveHistoricalDutyPersonnel(sheet, currentPeople, ["עומר עזוב"]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("עומר  עזוב");
  });

  it("dedupes and never sets any eligibility flag or contact field", () => {
    const sheet = scheduleSheetWithHeaders("עומר עזוב", "עומר עזוב");
    const result = resolveHistoricalDutyPersonnel(sheet, currentPeople, ["עומר עזוב"]);
    expect(result).toHaveLength(1);
    expect(result[0].isManager).toBe(false);
    expect(result[0].isTechnician).toBe(false);
    expect(result[0].isSupervisor).toBe(false);
    expect(result[0].email).toBeNull();
    expect(result[0].personnelType).toBeNull();
  });
});
