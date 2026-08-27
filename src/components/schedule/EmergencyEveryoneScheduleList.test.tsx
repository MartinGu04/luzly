import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMERGENCY_DESK_NAMES } from "@/lib/domain/emergencyDesks";
import type { EmergencyEveryoneShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { EmergencyEveryoneScheduleList } from "./EmergencyEveryoneScheduleList";

afterEach(() => {
  cleanup();
});

describe("EmergencyEveryoneScheduleList", () => {
  it("shows an empty state when there are no shifts at all", () => {
    render(<EmergencyEveryoneScheduleList shifts={[]} />);
    expect(screen.getByText("אין נתוני שיבוץ חירום לתקופה זו.")).toBeInTheDocument();
  });

  it("renders all ten canonical desks, staffed ones with the person's name and unstaffed ones as 'לא מאויש' -- never a fabricated coverage gap message", () => {
    const desks: EmergencyEveryoneShiftEntry["desks"] = EMERGENCY_DESK_NAMES.map((desk, index) =>
      index === 0 ? { desk, personId: "p1", personName: "מרטין" } : { desk, personId: null, personName: null },
    );

    render(<EmergencyEveryoneScheduleList shifts={[{ date: "2026-08-26", period: "day", desks }]} />);

    expect(screen.getByText("מרטין")).toBeInTheDocument();
    expect(screen.getAllByText("לא מאויש")).toHaveLength(9);
    for (const desk of EMERGENCY_DESK_NAMES) {
      expect(screen.getByText(desk)).toBeInTheDocument();
    }
  });
});
