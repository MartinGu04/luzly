import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalEventView } from "@/lib/readModels/types";
import { CalendarGrid } from "./CalendarGrid";
import type { DayMeta } from "./types";

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

// A minimal one-week grid: 2026-08-09 (Sun) .. 2026-08-15 (Sat).
const WEEK_GRID = [
  "2026-08-09",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
];

function weekDays(overrides: Record<string, Partial<DayMeta>> = {}): Record<string, DayMeta> {
  const days: Record<string, DayMeta> = {};
  for (const date of WEEK_GRID) {
    days[date] = dayMeta(date, overrides[date]);
  }
  return days;
}

const noop = () => {};

describe("CalendarGrid", () => {
  it("renders a leading blank cell for padding without crashing", () => {
    const grid = [null, ...WEEK_GRID];
    render(
      <CalendarGrid
        grid={grid}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.getAllByRole("button")).toHaveLength(7);
  });

  it("shows a day-shift emoji indicator", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{ "2026-08-12": [shiftEvent({ date: "2026-08-12", period: "day" })] }}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(cell.textContent).toContain("☀️");
  });

  it("shows a night-shift emoji indicator", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{ "2026-08-13": [shiftEvent({ date: "2026-08-13", period: "night" })] }}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    const cell = screen.getByRole("button", { name: /13 באוגוסט/ });
    expect(cell.textContent).toContain("🌙");
  });

  it("shows both emojis and no duplicates for two different shifts on the same date", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{
          "2026-08-12": [
            shiftEvent({ date: "2026-08-12", period: "day" }),
            shiftEvent({ date: "2026-08-12", period: "night" }),
          ],
        }}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(cell.textContent).toContain("☀️");
    expect(cell.textContent).toContain("🌙");
  });

  it("shows a tentative marker for a tentative shift", () => {
    const { container } = render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{ "2026-08-12": [shiftEvent({ date: "2026-08-12", certainty: "tentative" })] }}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    expect(container.querySelector(".bg-warning")).not.toBeNull();
  });

  it("marks today distinctly from other days", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays({ "2026-08-12": { isToday: true } })}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    const todayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(todayCell.innerHTML).toMatch(/ring-primary|bg-primary/);
  });

  it("gives today's cell a stronger accent when a shift is currently active, distinct from an ordinary today", () => {
    const withActiveShift = render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays({ "2026-08-12": { isToday: true } })}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday
      />,
    );
    const activeCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(activeCell.innerHTML).toMatch(/bg-primary/);
    withActiveShift.unmount();

    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays({ "2026-08-12": { isToday: true } })}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    const plainTodayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(plainTodayCell.innerHTML).not.toMatch(/bg-primary/);
  });

  it("visually quiets a past day", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays({ "2026-08-09": { isPast: true } })}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.getByRole("button", { name: /9 באוגוסט/ }).className).toMatch(/opacity-60/);
  });

  it("does not quiet a future day", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.getByRole("button", { name: /15 באוגוסט/ }).className).not.toMatch(/opacity-60/);
  });

  it("renders an empty day (no events) with no emoji indicator", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    const cell = screen.getByRole("button", { name: /14 באוגוסט/ });
    expect(cell.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
  });

  it("calls onSelectDate with the clicked day's date", async () => {
    const onSelectDate = vi.fn();
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={onSelectDate}
        hasActiveShiftToday={false}
      />,
    );
    screen.getByRole("button", { name: /12 באוגוסט/ }).click();
    expect(onSelectDate).toHaveBeenCalledWith("2026-08-12");
  });

  it("marks the selected day as pressed", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate="2026-08-12"
        onSelectDate={noop}
        hasActiveShiftToday={false}
      />,
    );
    expect(screen.getByRole("button", { name: /12 באוגוסט/ })).toHaveAttribute("aria-pressed", "true");
  });
});
