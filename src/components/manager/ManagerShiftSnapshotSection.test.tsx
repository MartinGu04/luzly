import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ShiftSnapshotTriad } from "@/lib/readModels/shiftSnapshot";
import { ManagerShiftSnapshotSection } from "./ManagerShiftSnapshotSection";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
});

function shift(overrides: Partial<ShiftSnapshotTriad["previousShift"]> = {}): ShiftSnapshotTriad["previousShift"] {
  return {
    date: "2026-08-12",
    period: "day",
    startLocalTime: "07:30",
    endLocalTime: "19:30",
    supervisors: [],
    technicians: [],
    coverageStatus: "full",
    missingIntervals: [],
    roleCoverage: {
      technician: { status: "full", missingIntervals: [] },
      supervisor: { status: "full", missingIntervals: [] },
    },
    ...overrides,
  };
}

function triad(overrides: Partial<ShiftSnapshotTriad> = {}): ShiftSnapshotTriad {
  return {
    previousShift: shift({ date: "2026-08-11", period: "night", startLocalTime: "19:30", endLocalTime: "07:30" }),
    currentShift: {
      ...shift(),
      timing: {
        status: "resolved",
        startLocalTime: "07:30",
        endLocalTime: "19:30",
        durationMinutes: 720,
        elapsedMinutesAtLoad: 30,
        remainingMinutesAtLoad: 690,
        progressPercentAtLoad: 4,
        minutesUntilStartAtLoad: 0,
      },
    },
    nextShift: shift({ period: "night", startLocalTime: "19:30", endLocalTime: "07:30" }),
    ...overrides,
  };
}

describe("ManagerShiftSnapshotSection — composition", () => {
  it("renders the section heading and all three shift cards in chronological order", () => {
    render(<ManagerShiftSnapshotSection snapshot={triad()} todayDate="2026-08-12" fetchedAt="2026-08-12T08:00:00.000Z" />);
    expect(screen.getByText("המשמרת שלי")).toBeInTheDocument();
    expect(screen.getByText("הקודמת")).toBeInTheDocument();
    expect(screen.getByText("עכשיו")).toBeInTheDocument();
    expect(screen.getByText("הבאה")).toBeInTheDocument();
  });

  it("renders exactly one live progress indicator, for the current shift only", () => {
    render(<ManagerShiftSnapshotSection snapshot={triad()} todayDate="2026-08-12" fetchedAt="2026-08-12T08:00:00.000Z" />);
    expect(screen.getAllByRole("progressbar")).toHaveLength(1);
  });

  it("shows department-wide roster names from the current shift, regardless of the viewer", () => {
    render(
      <ManagerShiftSnapshotSection
        snapshot={triad({
          currentShift: {
            ...triad().currentShift,
            technicians: [
              { personId: "p_martin", personName: "מרטין בדיקה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null },
            ],
            supervisors: [
              { personId: "p_eitan", personName: "איתן דוגמה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null },
            ],
          },
        })}
        todayDate="2026-08-12"
        fetchedAt="2026-08-12T08:00:00.000Z"
      />,
    );
    expect(screen.getByText("מרטין בדיקה")).toBeInTheDocument();
    expect(screen.getByText("איתן דוגמה")).toBeInTheDocument();
  });
});
