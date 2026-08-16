import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { CalendarGridCell } from "@/lib/domain/calendarMonth";
import { CALENDAR_CELL_HEIGHT_CLASSES } from "./CalendarSurface";
import { CalendarGrid } from "./CalendarGrid";
import { EveryoneMonthGrid } from "./EveryoneMonthGrid";
import type { DayMeta } from "./types";

afterEach(() => {
  cleanup();
});

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

const WEEK_DATES = [
  "2026-08-09",
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
  "2026-08-13",
  "2026-08-14",
  "2026-08-15",
];

const WEEK_GRID: CalendarGridCell[] = WEEK_DATES.map((date) => ({ date, inMonth: true }));

function weekDays(): Record<string, DayMeta> {
  const days: Record<string, DayMeta> = {};
  for (const date of WEEK_DATES) days[date] = dayMeta(date);
  return days;
}

const noop = () => {};

/**
 * Both `CalendarGrid` (personal) and `EveryoneMonthGrid` (team staffing)
 * are built on the SAME shared structural primitives from this module
 * (PR #38 shell-unification round) -- these tests pin that contract at the
 * component level, not just by inspecting the shared source file, so a
 * future edit to either grid can't silently give it a taller/shorter cell
 * than the other without a test failing here.
 */
describe("shared calendar-shell geometry contract (CalendarGrid vs EveryoneMonthGrid)", () => {
  it("CalendarGrid's in-month day cell uses the exact shared height budget", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        activeShiftDates={[]}
      />,
    );
    const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
    for (const token of CALENDAR_CELL_HEIGHT_CLASSES.split(" ")) {
      expect(cell.className).toContain(token);
    }
  });

  it("EveryoneMonthGrid's in-month day cell uses the exact same shared height budget", () => {
    render(<EveryoneMonthGrid grid={WEEK_GRID} days={weekDays()} dayViews={{}} selectedDate={null} onSelectDate={noop} />);
    const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
    for (const token of CALENDAR_CELL_HEIGHT_CLASSES.split(" ")) {
      expect(cell.className).toContain(token);
    }
  });

  it("neither surface grows the cell taller than the shared budget -- Everyone's greater density never adds its own height class", () => {
    const { unmount } = render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays()}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        activeShiftDates={[]}
      />,
    );
    const personalCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    const personalHeightTokens = personalCell.className
      .split(" ")
      .filter((token) => /^(h-|sm:h-|lg:h-)/.test(token))
      .sort();
    unmount();

    render(<EveryoneMonthGrid grid={WEEK_GRID} days={weekDays()} dayViews={{}} selectedDate={null} onSelectDate={noop} />);
    const everyoneCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    const everyoneHeightTokens = everyoneCell.className
      .split(" ")
      .filter((token) => /^(h-|sm:h-|lg:h-)/.test(token))
      .sort();

    expect(everyoneHeightTokens).toEqual(personalHeightTokens);
  });

  it("out-of-month cells in both surfaces share the same height budget too", () => {
    const grid: CalendarGridCell[] = [{ date: "2026-08-08", inMonth: false }, ...WEEK_GRID];

    const { container: personalContainer, unmount } = render(
      <CalendarGrid grid={grid} days={weekDays()} eventsByDate={{}} selectedDate={null} onSelectDate={noop} activeShiftDates={[]} />,
    );
    const personalOutside = personalContainer.querySelector('div[aria-hidden="true"]') as HTMLElement;
    const personalTokens = personalOutside.className
      .split(" ")
      .filter((token) => /^(h-|sm:h-|lg:h-)/.test(token))
      .sort();
    unmount();

    const { container: everyoneContainer } = render(
      <EveryoneMonthGrid grid={grid} days={weekDays()} dayViews={{}} selectedDate={null} onSelectDate={noop} />,
    );
    const everyoneOutside = everyoneContainer.querySelector('div[aria-hidden="true"]') as HTMLElement;
    const everyoneTokens = everyoneOutside.className
      .split(" ")
      .filter((token) => /^(h-|sm:h-|lg:h-)/.test(token))
      .sort();

    expect(everyoneTokens).toEqual(personalTokens);
    expect(everyoneTokens.length).toBeGreaterThan(0);
  });
});
