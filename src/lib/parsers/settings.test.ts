import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import { parseSettingsSheet } from "./settings";

describe("parseSettingsSheet", () => {
  it("reads values when 'הגדרה'/'ערך' are in A/B as usual", () => {
    const sheet: RawSheet = {
      name: "הגדרות",
      values: [
        ["הגדרה", "ערך"],
        ["תחילת משמרת יום", "07:30"],
        ["הגדרה אחרת", "42"],
      ],
    };

    const settings = parseSettingsSheet(sheet);

    expect(settings.shiftStartTimeDay).toBe("07:30");
    expect(settings.raw["הגדרה אחרת"]).toBe("42");
  });

  it("still works when the label/value columns are not A/B", () => {
    const sheet: RawSheet = {
      name: "הגדרות",
      values: [
        ["", "note", "הגדרה", "", "ערך"],
        ["", "x", "תחילת משמרת יום", "", "06:45"],
      ],
    };

    const settings = parseSettingsSheet(sheet);

    expect(settings.shiftStartTimeDay).toBe("06:45");
  });

  it("does not hard-code a default shift start time", () => {
    const sheet: RawSheet = {
      name: "הגדרות",
      values: [
        ["הגדרה", "ערך"],
        ["הגדרה שאינה רלוונטית", "1"],
      ],
    };

    expect(parseSettingsSheet(sheet).shiftStartTimeDay).toBeNull();
  });

  it("returns empty settings instead of throwing when headers are missing", () => {
    const sheet: RawSheet = { name: "הגדרות", values: [["a", "b"], ["c", "d"]] };

    expect(parseSettingsSheet(sheet)).toEqual({ shiftStartTimeDay: null, raw: {} });
  });
});
