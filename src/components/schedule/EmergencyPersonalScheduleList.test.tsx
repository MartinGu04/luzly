import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { EmergencyPersonalScheduleList } from "./EmergencyPersonalScheduleList";

afterEach(() => {
  cleanup();
});

function shift(overrides: Partial<EmergencyPersonalShiftEntry> = {}): EmergencyPersonalShiftEntry {
  return {
    date: "2026-08-26",
    period: "day",
    ownDesks: ["הוגוורט"],
    roster: [],
    ...overrides,
  };
}

describe("EmergencyPersonalScheduleList", () => {
  it("shows an empty state with the colleague's name when person perspective has no shifts", () => {
    render(<EmergencyPersonalScheduleList shifts={[]} emptyStateName="עמית בדיקה" />);
    expect(screen.getByText(/עמית בדיקה/)).toBeInTheDocument();
  });

  it("shows a generic empty state for self with no name", () => {
    render(<EmergencyPersonalScheduleList shifts={[]} emptyStateName={null} />);
    expect(screen.getByText("אין משמרות חירום ידועות.")).toBeInTheDocument();
  });

  it("renders own desk(s) and the roster of others", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ ownDesks: ["הוגוורט", "תיעוד"], roster: [{ personId: "p2", personName: "ליה", desk: "ק'" }] })]}
        emptyStateName={null}
      />,
    );

    expect(screen.getByText(/הוגוורט, תיעוד/)).toBeInTheDocument();
    expect(screen.getByText("ליה")).toBeInTheDocument();
    expect(screen.getByText("ק'")).toBeInTheDocument();
  });
});
