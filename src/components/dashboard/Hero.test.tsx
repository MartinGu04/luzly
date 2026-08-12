import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type {
  PersonalAssignmentView,
  PersonalNextAssignmentGroup,
  PersonalShiftContext,
} from "@/lib/readModels/types";
import { Hero } from "./Hero";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
});

function baseAssignment(overrides: Partial<PersonalAssignmentView> = {}): PersonalAssignmentView {
  return {
    date: "2026-08-12",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    dutyFamily: null,
    absenceKind: null,
    changeNote: null,
    temporalState: "current",
    timing: { status: "not_evaluable" },
    ...overrides,
  };
}

function dutyAssignment(overrides: Partial<PersonalAssignmentView> = {}): PersonalAssignmentView {
  return baseAssignment({
    category: "duty",
    role: null,
    period: "unspecified",
    dutyFamily: "guard",
    slot: 1,
    title: "שומר 1",
    rawValue: "שומר 1",
    ...overrides,
  });
}

function nextGroup(events: PersonalAssignmentView[]): PersonalNextAssignmentGroup {
  return { date: events[0].date, events };
}

function shiftContext(overrides: Partial<PersonalShiftContext> = {}): PersonalShiftContext {
  return {
    date: "2026-08-12",
    period: "day",
    role: "technician",
    coverageStatus: "full",
    missingIntervals: [],
    primaryCounterparts: [],
    shadowCounterparts: [],
    ...overrides,
  };
}

const defaultProps = {
  currentAssignments: [] as PersonalAssignmentView[],
  nextAssignmentGroup: null as PersonalNextAssignmentGroup | null,
  currentShiftContext: null as PersonalShiftContext | null,
  nextShiftContext: null as PersonalShiftContext | null,
  fetchedAt: "2026-08-12T08:00:00.000Z",
  localNowDate: "2026-08-12",
};

describe("Hero — current state", () => {
  it("11. a current shift becomes the hero when present", () => {
    render(<Hero {...defaultProps} currentAssignments={[baseAssignment()]} />);
    expect(screen.getByText("פעיל עכשיו")).toBeInTheDocument();
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
  });

  it("12. a current duty becomes the hero when there is no current shift", () => {
    render(<Hero {...defaultProps} currentAssignments={[dutyAssignment()]} />);
    expect(screen.getByText("פעיל עכשיו")).toBeInTheDocument();
    expect(screen.getByText("שומר 1")).toBeInTheDocument();
  });

  it("13. multiple current assignments are preserved (shift leads, duty shown as secondary)", () => {
    render(<Hero {...defaultProps} currentAssignments={[baseAssignment(), dutyAssignment()]} />);
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText("שומר 1")).toBeInTheDocument();
  });

  it("19. the active pulse is tied only to the current state", () => {
    const { container } = render(<Hero {...defaultProps} currentAssignments={[baseAssignment()]} />);
    expect(container.querySelector(".animate-pulse-dot")).not.toBeNull();
  });

  it("current state never shows starts-in copy", () => {
    render(<Hero {...defaultProps} currentAssignments={[baseAssignment()]} />);
    expect(screen.queryByText(/מתחיל בעוד/)).toBeNull();
  });
});

describe("Hero — next state", () => {
  it("14. nextAssignmentGroup renders every grouped Event, not just one", () => {
    const group = nextGroup([
      dutyAssignment({ temporalState: "upcoming", dutyFamily: "guard", slot: 1, title: "שומר 1" }),
      dutyAssignment({ temporalState: "upcoming", dutyFamily: "reserve", slot: 2, title: "עתודה 2" }),
    ]);
    render(<Hero {...defaultProps} nextAssignmentGroup={group} />);
    expect(screen.getByText("שומר 1")).toBeInTheDocument();
    expect(screen.getByText("עתודה 2")).toBeInTheDocument();
  });

  it("20. no active pulse appears for the upcoming state", () => {
    const group = nextGroup([dutyAssignment({ temporalState: "upcoming" })]);
    const { container } = render(<Hero {...defaultProps} nextAssignmentGroup={group} />);
    expect(screen.getByText("הבא שלך")).toBeInTheDocument();
    expect(container.querySelector(".animate-pulse-dot")).toBeNull();
  });

  it("never invents an hour for a date-level duty", () => {
    const group = nextGroup([dutyAssignment({ temporalState: "upcoming", date: "2026-08-20" })]);
    render(<Hero {...defaultProps} nextAssignmentGroup={group} localNowDate="2026-08-12" />);
    expect(screen.getByText("השעה טרם מוגדרת")).toBeInTheDocument();
  });
});

describe("Hero — empty state", () => {
  it("shows a calm, non-alarming empty state, not a bare 'no data' message", () => {
    render(<Hero {...defaultProps} />);
    expect(screen.getByText("הכול שקט כרגע")).toBeInTheDocument();
    expect(screen.queryByText("אין נתונים")).toBeNull();
  });
});

describe("Hero — counterpart context embedding", () => {
  it("embeds currentShiftContext connected to the current hero", () => {
    const context = shiftContext({
      primaryCounterparts: [
        {
          personId: "p_2",
          personName: "נועה דוגמה",
          role: "supervisor",
          certainty: "confirmed",
          shadow: false,
          period: "day",
          startTimeOverride: null,
          endTimeOverride: null,
        },
      ],
    });
    render(<Hero {...defaultProps} currentAssignments={[baseAssignment()]} currentShiftContext={context} />);
    expect(screen.getByText("מי איתי?")).toBeInTheDocument();
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
  });

  it("does not render a counterpart section when there is no shift context", () => {
    render(<Hero {...defaultProps} currentAssignments={[dutyAssignment()]} currentShiftContext={null} />);
    expect(screen.queryByText("מי איתי?")).toBeNull();
  });
});
