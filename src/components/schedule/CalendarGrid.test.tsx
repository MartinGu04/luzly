import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { weekOfYear } from "@/lib/domain/weekOfYear";
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
      />,
    );
    const todayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(todayCell.innerHTML).toMatch(/ring-primary|bg-primary/);
  });

  describe("active-shift accent (event-date-aware, not tied to isToday)", () => {
    it("1. a current same-day day shift: its own date gets the active accent", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { isToday: true } })}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={["2026-08-12"]}
        />,
      );
      expect(screen.getByRole("button", { name: /12 באוגוסט/ }).innerHTML).toMatch(/bg-primary/);
    });

    it("2. a previous-date overnight shift still current after midnight: the PREVIOUS date gets the active accent, not today's cell", () => {
      // "Today" is the 13th, but the still-running overnight shift's own Event date is the 12th.
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-13": { isToday: true } })}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={["2026-08-12"]}
        />,
      );
      expect(screen.getByRole("button", { name: /12 באוגוסט/ }).innerHTML).toMatch(/bg-primary/);
    });

    it("3. civil today keeps the normal today ring but is NOT given the active-shift fill unless a shift actually belongs to that date", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-13": { isToday: true } })}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={["2026-08-12"]}
        />,
      );
      const todayCell = screen.getByRole("button", { name: /13 באוגוסט/ });
      expect(todayCell.innerHTML).toMatch(/ring-primary/);
      expect(todayCell.innerHTML).not.toMatch(/bg-primary/);
    });

    it("4. no current shift: no cell gets the active-shift accent", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { isToday: true } })}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const todayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(todayCell.innerHTML).toMatch(/ring-primary/);
      expect(todayCell.innerHTML).not.toMatch(/bg-primary/);
    });
  });

  it("visually quiets a past day", () => {
    render(
      <CalendarGrid
        grid={WEEK_GRID}
        days={weekDays({ "2026-08-09": { isPast: true } })}
        eventsByDate={{}}
        selectedDate={null}
        onSelectDate={noop}
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
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
        activeShiftDates={[]}
      />,
    );
    expect(screen.getByRole("button", { name: /12 באוגוסט/ })).toHaveAttribute("aria-pressed", "true");
  });

  describe("no longer relies on square desktop cells (Design Pass PR #20)", () => {
    it("cells use a fixed, non-square height class, not aspect-square", () => {
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
      expect(cell.className).not.toMatch(/aspect-square/);
      expect(cell.className).toMatch(/h-\[/);
    });
  });

  describe("in-cell event labels (Design Pass PR #20)", () => {
    it("shows the event's own (already-safe) title as a compact label inside its day", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [shiftEvent({ date: "2026-08-12", title: "טכנאי יום" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("טכנאי יום");
    });

    it("shows at most 2 event labels, then a '+N' overflow indicator for the rest", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{
            "2026-08-12": [
              shiftEvent({ date: "2026-08-12", title: "אירוע ראשון", period: "day" }),
              shiftEvent({ date: "2026-08-12", title: "אירוע שני", period: "night" }),
              shiftEvent({ date: "2026-08-12", title: "אירוע שלישי", period: "morning" }),
            ],
          }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("אירוע ראשון");
      expect(cell.textContent).toContain("אירוע שני");
      expect(cell.textContent).not.toContain("אירוע שלישי");
      expect(cell.textContent).toContain("+1");
    });

    it("shows no overflow indicator when there are exactly 2 events", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{
            "2026-08-12": [
              shiftEvent({ date: "2026-08-12", title: "אירוע ראשון", period: "day" }),
              shiftEvent({ date: "2026-08-12", title: "אירוע שני", period: "night" }),
            ],
          }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).not.toMatch(/\+\d/);
    });

    it("a day with no events shows no label", () => {
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
      const cell = screen.getByRole("button", { name: /14 באוגוסט/ });
      expect(cell.textContent?.trim()).toBe("14");
    });
  });

  describe("week numbers (Design Pass PR #20, Sunday-first convention)", () => {
    it("shows the Sunday-first week-of-year number beside the row, matching the weekOfYear helper", () => {
      const { container } = render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const expectedWeek = weekOfYear(parseCalendarDate("2026-08-09")!);
      expect(container.querySelector(`[aria-label="שבוע ${expectedWeek}"]`)).not.toBeNull();
    });

    it("a week straddling a month boundary still gets exactly one week number for the whole row", () => {
      // 2026-08-30 (Sun) .. 2026-09-05 (Sat) -- but buildMonthGrid only ever
      // supplies real dates from ONE month at a time, nulling the rest, so
      // this row (as August's grid would render it) has August dates only.
      const grid = ["2026-08-30", "2026-08-31", null, null, null, null, null];
      const days: Record<string, DayMeta> = {
        "2026-08-30": dayMeta("2026-08-30"),
        "2026-08-31": dayMeta("2026-08-31"),
      };
      const { container } = render(
        <CalendarGrid
          grid={grid}
          days={days}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const expectedWeek = weekOfYear(parseCalendarDate("2026-08-30")!);
      expect(container.querySelectorAll(`[aria-label="שבוע ${expectedWeek}"]`).length).toBe(1);
    });
  });
});
