import { describe, expect, it } from "vitest";
import type { Event } from "@/lib/domain/event";
import { isLogisticsWithdrawalEvent } from "./logisticsWithdrawal";

function event(overrides: Partial<Event> & Pick<Event, "personId" | "date" | "category">): Event {
  return {
    personName: overrides.personId,
    title: "",
    rawValue: "",
    certainty: "confirmed",
    role: null,
    period: "unspecified",
    sourceSheet: "sheet",
    sourceCell: "A1",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    changeNote: null,
    dutyFamily: null,
    absenceKind: null,
    ...overrides,
  };
}

describe("isLogisticsWithdrawalEvent", () => {
  it("matches the full phrase 'משיכות מהלוגיסטיקה'", () => {
    const e = event({ personId: "p1", date: "2026-08-19", category: "other", title: "משיכות מהלוגיסטיקה" });
    expect(isLogisticsWithdrawalEvent(e)).toBe(true);
  });

  it("matches the bare word 'משיכות'", () => {
    const e = event({ personId: "p1", date: "2026-08-19", category: "other", title: "משיכות" });
    expect(isLogisticsWithdrawalEvent(e)).toBe(true);
  });

  it("never matches a non-'other' category, even with the same text -- classification is never re-decided here", () => {
    const e = event({ personId: "p1", date: "2026-08-19", category: "context", title: "משיכות" });
    expect(isLogisticsWithdrawalEvent(e)).toBe(false);
  });

  it("does not match unrelated 'other' text", () => {
    const e = event({ personId: "p1", date: "2026-08-19", category: "other", title: "הערה כללית" });
    expect(isLogisticsWithdrawalEvent(e)).toBe(false);
  });
});
