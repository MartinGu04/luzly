import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type {
  PersonalAssignmentView,
  PersonalDutyBlock,
  PersonalEventView,
  PersonalScheduleReadModel,
  PersonalShiftContext,
} from "@/lib/readModels/types";
import { Dashboard } from "./Dashboard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

afterEach(() => {
  cleanup();
});

function baseEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
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
    timing: { status: "not_evaluable" },
    ...overrides,
  };
}

function assignment(overrides: Partial<PersonalAssignmentView> = {}): PersonalAssignmentView {
  return { ...baseEvent(), temporalState: "current", ...overrides };
}

function dutyAssignment(overrides: Partial<PersonalAssignmentView> = {}): PersonalAssignmentView {
  return assignment({
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

function shiftContext(overrides: Partial<PersonalShiftContext> = {}): PersonalShiftContext {
  return {
    date: "2026-08-12",
    period: "day",
    role: "technician",
    coverageStatus: "full",
    missingIntervals: [],
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
    shadowCounterparts: [],
    ...overrides,
  };
}

function model(overrides: Partial<PersonalScheduleReadModel> = {}): PersonalScheduleReadModel {
  return {
    person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    fetchedAt: "2026-08-12T08:00:00.000Z",
    localNow: { date: "2026-08-12", minuteOfDay: 600 },
    todayEvents: [],
    upcomingEvents: [],
    calendarEvents: [],
    currentAssignments: [],
    nextAssignmentGroup: null,
    currentShiftContexts: [],
    nextShiftContexts: [],
    issues: [],
    dutyBlocks: [],
    dutyActions: [],
    ...overrides,
  };
}

describe("Dashboard composition — counterpart binding (issue 1)", () => {
  it("a duty-only next group must not receive a later shift's counterpart context", () => {
    const duty = dutyAssignment({ date: "2026-08-13", temporalState: "upcoming" });
    const laterShiftContext = shiftContext({ date: "2026-08-15", period: "day", role: "technician" });

    render(
      <Dashboard
        model={model({
          nextAssignmentGroup: { date: "2026-08-13", events: [duty] },
          nextShiftContexts: [laterShiftContext],
        })}
      />,
    );

    expect(screen.getByText("הבא שלך")).toBeInTheDocument();
    expect(screen.queryByText("מי איתי?")).toBeNull();
    expect(screen.queryByText("נועה דוגמה")).toBeNull();
  });
});

describe("Dashboard composition — Upcoming exclusion (issue 2)", () => {
  it("the exact current-hero shift is not repeated in Upcoming, but a later same-date shift is", () => {
    const dayShift = assignment({ date: "2026-08-12", period: "day", title: "טכנאי יום" });
    const nightShift = baseEvent({ date: "2026-08-12", period: "night", title: "טכנאי לילה" });

    render(
      <Dashboard
        model={model({
          currentAssignments: [dayShift],
          upcomingEvents: [dayShift, nightShift],
        })}
      />,
    );

    // The day shift appears once (in the hero) -- not duplicated in Upcoming.
    expect(screen.getAllByText("טכנאי יום")).toHaveLength(1);
    // The later, unrelated night shift still shows up in Upcoming.
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
  });

  it("a current overnight shift dated yesterday is not misclassified/duplicated as upcoming", () => {
    const overnight = assignment({ date: "2026-08-11", period: "night", title: "טכנאי לילה" });

    render(
      <Dashboard
        model={model({
          localNow: { date: "2026-08-12", minuteOfDay: 120 },
          currentAssignments: [overnight],
          upcomingEvents: [overnight],
        })}
      />,
    );

    expect(screen.getAllByText("טכנאי לילה")).toHaveLength(1);
    expect(screen.getByText("אין פריטים נוספים באופק הקרוב.")).toBeInTheDocument();
  });

  it("a current duty block is not shown again as an upcoming duplicate", () => {
    const currentDuty = dutyAssignment({ date: "2026-08-12" });
    const block: PersonalDutyBlock = {
      dutyFamily: "guard",
      slot: 1,
      startDate: "2026-08-11",
      endDate: "2026-08-13",
      dates: ["2026-08-11", "2026-08-12", "2026-08-13"],
      certainty: "confirmed",
      dayCount: 3,
      weekendCompleteness: "not_applicable",
    };

    render(
      <Dashboard
        model={model({
          currentAssignments: [currentDuty],
          dutyBlocks: [block],
        })}
      />,
    );

    expect(screen.getByText("אין פריטים נוספים באופק הקרוב.")).toBeInTheDocument();
  });
});

describe("Dashboard composition — vacation state wiring", () => {
  it("a blocking absence today with nothing current becomes the vacation hero", () => {
    const vacation = baseEvent({
      category: "absence",
      role: null,
      absenceKind: "vacation",
      title: "חופש",
      rawValue: "חופש",
    });

    render(<Dashboard model={model({ todayEvents: [vacation] })} />);

    expect(screen.getByText("היום שלך פנוי")).toBeInTheDocument();
  });

  it("a current assignment still leads even when today also has a blocking absence (conflict case)", () => {
    const vacation = baseEvent({
      category: "absence",
      role: null,
      absenceKind: "vacation",
      title: "חופש",
      rawValue: "חופש",
    });
    const currentShift = assignment({ title: "טכנאי יום" });

    render(
      <Dashboard model={model({ todayEvents: [vacation], currentAssignments: [currentShift] })} />,
    );

    expect(screen.getByText("פעיל עכשיו")).toBeInTheDocument();
    expect(screen.queryByText("היום שלך פנוי")).toBeNull();
  });

  it("a non-blocking absence kind ('after') never triggers the vacation hero", () => {
    const partial = baseEvent({ category: "absence", role: null, absenceKind: "after", title: "אפטר" });

    render(<Dashboard model={model({ todayEvents: [partial] })} />);

    expect(screen.queryByText("היום שלך פנוי")).toBeNull();
    expect(screen.getByText("הכול שקט כרגע")).toBeInTheDocument();
  });
});

describe("Dashboard — data freshness uses PersonalScheduleReadModel.fetchedAt (PR #17 §10/§19)", () => {
  it("the freshness status receives this model's own fetchedAt", () => {
    render(<Dashboard model={model({ fetchedAt: "2026-08-13T10:45:00.000Z" })} />);
    expect(screen.getByTestId("freshness")).toHaveTextContent("2026-08-13T10:45:00.000Z");
  });
});
