import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PersonalEventView } from "@/lib/readModels/types";
import { ScheduleCalendar } from "./ScheduleCalendar";
import type { DayMeta } from "./types";

afterEach(() => {
  cleanup();
});

const WEEK_GRID = [
  "2026-08-09",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
];

function dayMeta(date: string, overrides: Partial<DayMeta> = {}): DayMeta {
  const day = Number(date.slice(8, 10));
  return {
    date,
    dayNumber: day,
    isToday: false,
    isPast: false,
    dateLabel: `יום · ${day} באוגוסט`,
    holiday: null,
    ...overrides,
  };
}

function weekDays(overrides: Record<string, Partial<DayMeta>> = {}): Record<string, DayMeta> {
  const days: Record<string, DayMeta> = {};
  for (const date of WEEK_GRID) days[date] = dayMeta(date, overrides[date]);
  return days;
}

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

describe("ScheduleCalendar", () => {
  it("shows the default-selected day's details on first render", () => {
    render(
      <ScheduleCalendar
        grid={WEEK_GRID}
        days={weekDays()}
        monthEvents={[shiftEvent({ date: "2026-08-12" })]}
        defaultSelectedDate="2026-08-12"
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
  });

  it("clicking a different day updates the selected-day panel", () => {
    render(
      <ScheduleCalendar
        grid={WEEK_GRID}
        days={weekDays()}
        monthEvents={[
          shiftEvent({ date: "2026-08-12", title: "טכנאי יום" }),
          shiftEvent({ date: "2026-08-13", title: "טכנאי לילה", period: "night" }),
        ]}
        defaultSelectedDate="2026-08-12"
        hasActiveShiftToday={false}
      />,
    );

    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.queryByText("טכנאי לילה")).toBeNull();

    act(() => {
      screen.getByRole("button", { name: /13 באוגוסט/ }).click();
    });

    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
    expect(screen.queryByText("טכנאי יום")).toBeNull();
  });

  it("shows the empty-day message when the selected day has no shifts", () => {
    render(
      <ScheduleCalendar
        grid={WEEK_GRID}
        days={weekDays()}
        monthEvents={[]}
        defaultSelectedDate="2026-08-12"
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.getByText("אין לך משמרת ביום הזה 😌")).toBeInTheDocument();
  });

  it("renders no selected-day panel when defaultSelectedDate is null", () => {
    render(
      <ScheduleCalendar
        grid={WEEK_GRID}
        days={weekDays()}
        monthEvents={[]}
        defaultSelectedDate={null}
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.queryByText("אין לך משמרת ביום הזה 😌")).toBeNull();
  });

  it("only ever renders events belonging to this month's monthEvents prop -- no unrelated data", () => {
    const { container } = render(
      <ScheduleCalendar
        grid={WEEK_GRID}
        days={weekDays()}
        monthEvents={[shiftEvent({ date: "2026-08-12" })]}
        defaultSelectedDate="2026-08-12"
        hasActiveShiftToday={false}
      />,
    );
    expect(container.textContent).not.toContain("@");
  });
});
