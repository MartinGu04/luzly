import { describe, expect, it } from "vitest";
import type { RawSheet } from "@/lib/google";
import { parseEmergencyFairnessGroups } from "./emergencyFairnessGroups";

function sheet(values: string[][]): RawSheet {
  return { name: "גזירת נתונים", values };
}

describe("parseEmergencyFairnessGroups", () => {
  it("collects member names listed below each group's header column", () => {
    const result = parseEmergencyFairnessGroups(
      sheet([
        ['טבלת צדק - סדיר תקש"ל', 'טבלת צדק - סדיר מ"א', "טבלת צדק - קבע", "טבלת צדק - מילואים"],
        ["אליס בדיקה", "בוב בדיקה", "כרמל בדיקה", "דנה בדיקה"],
        ["איתן בדיקה", "", "", ""],
      ]),
    );

    expect(result.membersByGroup['טבלת צדק - סדיר תקש"ל']).toEqual(["אליס בדיקה", "איתן בדיקה"]);
    expect(result.membersByGroup['טבלת צדק - סדיר מ"א']).toEqual(["בוב בדיקה"]);
    expect(result.membersByGroup["טבלת צדק - קבע"]).toEqual(["כרמל בדיקה"]);
    expect(result.membersByGroup["טבלת צדק - מילואים"]).toEqual(["דנה בדיקה"]);
  });

  it("skips blank rows without stopping the scan", () => {
    const result = parseEmergencyFairnessGroups(
      sheet([
        ['טבלת צדק - סדיר תקש"ל'],
        ["אליס בדיקה"],
        [""],
        ["בוב בדיקה"],
      ]),
    );

    expect(result.membersByGroup['טבלת צדק - סדיר תקש"ל']).toEqual(["אליס בדיקה", "בוב בדיקה"]);
  });

  it("returns empty groups (never throws) when no group headers are found at all", () => {
    const result = parseEmergencyFairnessGroups(sheet([["irrelevant", "content"]]));

    expect(result.membersByGroup['טבלת צדק - סדיר תקש"ל']).toEqual([]);
    expect(result.membersByGroup["טבלת צדק - מילואים"]).toEqual([]);
  });

  it("real layout: numeric COUNTIF total columns sitting beside a group's name column are never consumed as membership -- group membership only", () => {
    const result = parseEmergencyFairnessGroups(
      sheet([
        ['טבלת צדק - סדיר תקש"ל', "יום", "לילה", 'טבלת צדק - סדיר מ"א', "יום", "לילה"],
        ["אליס בדיקה", "3", "2", "בוב בדיקה", "1", "4"],
        ["איתן בדיקה", "0", "1", "", "", ""],
      ]),
    );

    // Only the exact name-column beneath each header is read -- the
    // adjacent numeric total columns are simply never scanned (this
    // parser has no notion of "total" columns at all), so a real
    // COUNTIF value can never leak into membership as a fake member name.
    expect(result.membersByGroup['טבלת צדק - סדיר תקש"ל']).toEqual(["אליס בדיקה", "איתן בדיקה"]);
    expect(result.membersByGroup['טבלת צדק - סדיר מ"א']).toEqual(["בוב בדיקה"]);
  });
});
