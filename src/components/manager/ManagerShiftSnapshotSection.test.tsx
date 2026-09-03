import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
    expect(screen.getByText("תמונת מצב משמרות")).toBeInTheDocument();
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

describe('ManagerShiftSnapshotSection — regression: a generic (period-unspecified) אחמ"ש assignment is shown as the card\'s supervisor', () => {
  it("through the REAL production pipeline (Event[] -> resolveShiftSnapshotTriad), a date staffed with a period-specific technician and only a generic supervisor shows that supervisor on the current-shift card", async () => {
    const { buildShiftSchedule } = await import("@/lib/domain/shiftSchedule");
    const { resolveShiftSnapshotTriad } = await import("@/lib/readModels/shiftSnapshot");
    const schedule = buildShiftSchedule("07:30"); // day 07:30-19:30, night 19:30-07:30(+1)

    function event(overrides: Partial<import("@/lib/domain/event").Event>): import("@/lib/domain/event").Event {
      return {
        personId: "p_default",
        personName: "ברירת מחדל",
        date: "2026-08-12",
        title: "",
        rawValue: "",
        category: "shift",
        certainty: "confirmed",
        role: null,
        period: "unspecified",
        sourceSheet: "משמרות + תורנויות",
        sourceCell: "C2",
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

    const events = [
      event({ personId: "p_itay", personName: "איתי אולר", role: "technician", period: "day" }),
      event({ personId: "p_ilay", personName: "עילאי שפירא", role: "supervisor", period: "unspecified" }),
    ];

    const snapshot = resolveShiftSnapshotTriad(events, schedule, { date: "2026-08-12", minuteOfDay: 8 * 60 });

    render(
      <ManagerShiftSnapshotSection snapshot={snapshot} todayDate="2026-08-12" fetchedAt="2026-08-12T08:00:00.000Z" />,
    );

    // Scope to the "עכשיו" (current) card specifically -- the hero-variant
    // Panel is the only one with `bg-surface-2`. The SAME generic
    // assignment also, correctly, covers "הבאה" (next: tonight, same
    // date) -- see shiftSnapshot.test.ts for that behavior on its own; this
    // test only asserts the reported card (current) is fixed.
    const currentCard = screen.getByText("עכשיו").closest(".bg-surface-2") as HTMLElement;
    expect(currentCard).toBeTruthy();
    expect(within(currentCard).getByText("איתי אולר")).toBeInTheDocument();
    expect(within(currentCard).getByText("עילאי שפירא")).toBeInTheDocument();
    expect(within(currentCard).getByText('אחמ״ש')).toBeInTheDocument();
    // Never a missing-supervisor message on the current shift.
    expect(within(currentCard).queryByText(/חסר אחמ/)).toBeNull();
  });
});
