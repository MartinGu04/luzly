import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalDutyBlock, PersonalEventView } from "@/lib/readModels/types";
import { UpcomingSection } from "./UpcomingSection";

afterEach(() => {
  cleanup();
});

function shiftEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
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

function dutyEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return shiftEvent({
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

function dutyBlock(overrides: Partial<PersonalDutyBlock> = {}): PersonalDutyBlock {
  return {
    dutyFamily: "guard",
    slot: 1,
    startDate: "2026-08-12",
    endDate: "2026-08-12",
    dates: ["2026-08-12"],
    certainty: "confirmed",
    dayCount: 1,
    weekendCompleteness: "not_applicable",
    ...overrides,
  };
}

const defaultProps = { localNowDate: "2026-08-12", representedAssignments: [] as PersonalEventView[] };

describe("UpcomingSection", () => {
  it("a Hero day shift + a later same-date night shift: the night shift remains upcoming", () => {
    const daySh = shiftEvent({ date: "2026-08-20", period: "day", title: "טכנאי יום" });
    const nightSh = shiftEvent({ date: "2026-08-20", period: "night", title: "טכנאי לילה" });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[daySh, nightSh]}
        dutyBlocks={[]}
        representedAssignments={[daySh]}
      />,
    );
    expect(screen.queryByText("טכנאי יום")).toBeNull();
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
  });

  it("a current duty hero + a later same-day shift: the shift remains upcoming", () => {
    const duty = dutyEvent({ date: "2026-08-12" });
    const laterShift = shiftEvent({ date: "2026-08-12", period: "night", title: "טכנאי לילה" });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[laterShift]}
        dutyBlocks={[]}
        representedAssignments={[duty]}
      />,
    );
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
  });

  it("a current overnight shift dated yesterday is not repeated as an upcoming row", () => {
    const overnight = shiftEvent({ date: "2026-08-11", period: "night" });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[overnight]}
        dutyBlocks={[]}
        representedAssignments={[overnight]}
      />,
    );
    expect(screen.getByText("אין פריטים נוספים באופק הקרוב.")).toBeInTheDocument();
  });

  it("the exact Hero shift is not duplicated in the upcoming list", () => {
    const heroShift = shiftEvent({ date: "2026-08-15" });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[heroShift]}
        dutyBlocks={[]}
        representedAssignments={[heroShift]}
      />,
    );
    expect(screen.getByText("אין פריטים נוספים באופק הקרוב.")).toBeInTheDocument();
  });

  it("an unrelated same-date assignment remains visible", () => {
    const heroShift = shiftEvent({ date: "2026-08-15", period: "day" });
    const unrelated = shiftEvent({ date: "2026-08-15", period: "night", title: "טכנאי לילה" });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[unrelated]}
        dutyBlocks={[]}
        representedAssignments={[heroShift]}
      />,
    );
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
  });

  it("a current multi-day duty block that started before today is not duplicated as upcoming", () => {
    const currentDutyToday = dutyEvent({ date: "2026-08-12" });
    const block = dutyBlock({
      startDate: "2026-08-11",
      endDate: "2026-08-13",
      dates: ["2026-08-11", "2026-08-12", "2026-08-13"],
      dayCount: 3,
    });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[]}
        dutyBlocks={[block]}
        representedAssignments={[currentDutyToday]}
      />,
    );
    expect(screen.getByText("אין פריטים נוספים באופק הקרוב.")).toBeInTheDocument();
  });

  it("an unrelated duty block (different family/slot) on the hero date remains visible", () => {
    const heroDuty = dutyEvent({ date: "2026-08-12", dutyFamily: "guard", slot: 1 });
    const unrelatedBlock = dutyBlock({ dutyFamily: "reserve", slot: 2, startDate: "2026-08-12", endDate: "2026-08-12", dates: ["2026-08-12"] });
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[]}
        dutyBlocks={[unrelatedBlock]}
        representedAssignments={[heroDuty]}
      />,
    );
    expect(screen.getByText(/עתודה/)).toBeInTheDocument();
  });

  it("preserves multiplicity: two identical-signature upcoming Events with only one represented -- one remains", () => {
    const a = shiftEvent({ date: "2026-08-20" });
    const b = shiftEvent({ date: "2026-08-20" }); // same signature as a, distinct object
    render(
      <UpcomingSection
        {...defaultProps}
        upcomingEvents={[a, b]}
        dutyBlocks={[]}
        representedAssignments={[a]}
      />,
    );
    // One of the two identical-looking rows should remain (not both removed).
    expect(screen.getAllByText("טכנאי יום")).toHaveLength(1);
  });

  it("32. does not include any unrelated person's data -- only Events/blocks passed in are ever rendered", () => {
    const shift = shiftEvent({ date: "2026-08-20" });
    const { container } = render(
      <UpcomingSection {...defaultProps} upcomingEvents={[shift]} dutyBlocks={[]} />,
    );
    expect(container.textContent).not.toContain("@");
  });

  it("shows a semantic emoji beside a shift row and a duty row, from typed fields only", () => {
    const shift = shiftEvent({ date: "2026-08-20", period: "night", title: "טכנאי לילה" });
    const block = dutyBlock({ dutyFamily: "reserve", startDate: "2026-08-21", endDate: "2026-08-21", dates: ["2026-08-21"] });
    const { container } = render(
      <UpcomingSection {...defaultProps} upcomingEvents={[shift]} dutyBlocks={[block]} />,
    );
    expect(container.textContent).toContain("🌙");
    expect(container.textContent).toContain("🧩");
  });
});
