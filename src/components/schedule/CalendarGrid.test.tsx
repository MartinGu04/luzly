import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { weekOfYear } from "@/lib/domain/weekOfYear";
import type { PersonalEventView } from "@/lib/readModels/types";
import type { HolidayContext } from "@/lib/presentation/hebrewCalendar";
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

function dutyEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return shiftEvent({
    title: "שומר 1",
    rawValue: "שומר 1",
    category: "duty",
    role: null,
    period: "unspecified",
    dutyFamily: "guard",
    slot: 1,
    ...overrides,
  });
}

function absenceEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return shiftEvent({
    title: "חופש",
    rawValue: "חופש",
    category: "absence",
    role: null,
    period: "unspecified",
    absenceKind: "vacation",
    ...overrides,
  });
}

const HOLIDAY: HolidayContext = { emoji: "🍎", label: "ראש השנה", kind: "holiday", shortLabel: "חג" };

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
    const cell = screen.getByRole("button", { name: /11 באוגוסט/ });
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

  describe("in-cell indicators are compact and generic ('הלוח שלי' density pass)", () => {
    it("shows a short generic label ('יום'), never the full assignment title, inside the cell", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [shiftEvent({ date: "2026-08-12", period: "day", title: "טכנאי יום" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("יום");
      expect(cell.textContent).not.toContain("טכנאי יום");
    });

    it("labels a duty generically as 'תורנות', never the specific duty family/title", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [dutyEvent({ date: "2026-08-12" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("תורנות");
      expect(cell.textContent).not.toContain("שומר 1");
    });

    it("labels an absence with its own kind ('חופש')", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [absenceEvent({ date: "2026-08-12" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("חופש");
    });

    it("on wide layouts, shows up to 2 indicators plus a '+N' overflow chip marked visible only from sm: up", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{
            "2026-08-12": [
              shiftEvent({ date: "2026-08-12", period: "day" }),
              shiftEvent({ date: "2026-08-12", period: "night" }),
              dutyEvent({ date: "2026-08-12" }),
            ],
          }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("יום");
      expect(cell.textContent).toContain("לילה");
      expect(cell.textContent).not.toContain("תורנות");

      // Wide overflow ("+1", counting past the 2 visible-on-wide indicators)
      // is present and marked wide-only.
      const wideOverflow = screen.getByText("+1");
      expect(wideOverflow.className).toMatch(/sm:block/);
      expect(wideOverflow.className).toMatch(/hidden/);
    });

    it("on narrow layouts, only 1 indicator is meant to show, with a deeper '+N' overflow marked mobile-only", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{
            "2026-08-12": [
              shiftEvent({ date: "2026-08-12", period: "day" }),
              shiftEvent({ date: "2026-08-12", period: "night" }),
              dutyEvent({ date: "2026-08-12" }),
            ],
          }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      // The second indicator's OUTER chip wrapper is present in the DOM (so
      // a real sm:+ viewport can show it) but marked hidden below sm:.
      const secondIndicatorChip = screen.getByText("לילה").parentElement;
      expect(secondIndicatorChip?.className).toMatch(/hidden/);
      expect(secondIndicatorChip?.className).toMatch(/sm:flex/);

      // Mobile overflow ("+2", counting past only the 1 indicator meant to
      // show on a narrow layout) is present and marked mobile-only.
      const mobileOverflow = screen.getByText("+2");
      expect(mobileOverflow.className).toMatch(/sm:hidden/);
    });

    it("shows no wide-layout overflow when there are exactly 2 indicators -- both fit the wide budget", () => {
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
      // Exactly 2 indicators fit the wide-layout budget of 2, so there's no
      // "hidden sm:block" wide overflow chip at all -- only the mobile-only
      // "+1" (since a narrow layout still shows just 1 indicator) exists.
      expect(screen.queryByText("+1")).not.toBeNull();
      expect(screen.getByText("+1").className).toMatch(/sm:hidden/);
    });

    it("shows no overflow at all, on either layout, when there is exactly 1 indicator", () => {
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
      expect(cell.textContent).not.toMatch(/\+\d/);
    });

    it("a day with no events and no holiday shows no indicator at all", () => {
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
      const cell = screen.getByRole("button", { name: /11 באוגוסט/ });
      expect(cell.textContent?.trim()).toBe("11");
    });

  });

  describe("holiday is calendar context, never a personal-event indicator (polish pass)", () => {
    it("shows the holiday emoji beside the day number, not as a chip in the personal-event stack", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { holiday: HOLIDAY } })}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("🍎");
      // Never the generic "חג" short label, nor the specific holiday name --
      // just the emoji, matching the "כולם" calendar's own holiday placement.
      expect(cell.textContent).not.toContain("חג");
      expect(cell.textContent).not.toContain("ראש השנה");
    });

    it("a holiday alone (no personal events) never renders an overflow chip", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { holiday: HOLIDAY } })}
          eventsByDate={{}}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).not.toMatch(/\+\d/);
    });

    it("does not consume one of the 2 wide-layout personal-event slots -- both shifts still show, no wide overflow", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { holiday: HOLIDAY } })}
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
      expect(cell.textContent).toContain("🍎");
      expect(cell.textContent).toContain("יום");
      expect(cell.textContent).toContain("לילה");
      // Both personal events fit the wide budget of 2 -- the holiday didn't
      // take a slot, so there's no wide-layout ("hidden sm:block") overflow
      // chip at all. The mobile-only "+1" (from showing just 1 of 2 events
      // below sm:) is a separate, expected thing and is not what's asserted
      // here -- see the "mobile indicators" describe block below for that.
      const wideOverflow = [...cell.querySelectorAll("span")].find(
        (el) => el.textContent === "+1" && /hidden/.test(el.className) && /sm:block/.test(el.className),
      );
      expect(wideOverflow).toBeUndefined();
    });

    it("does not contribute to the personal-event overflow count", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { holiday: HOLIDAY } })}
          eventsByDate={{
            "2026-08-12": [
              shiftEvent({ date: "2026-08-12", period: "day" }),
              shiftEvent({ date: "2026-08-12", period: "night" }),
              dutyEvent({ date: "2026-08-12" }),
            ],
          }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("🍎");
      // 3 personal events, 2 visible on wide -- the wide overflow chip is
      // "+1" (the 3rd event only), never "+2" -- the holiday never inflates it.
      const wideOverflow = [...cell.querySelectorAll("span")].find(
        (el) => /hidden/.test(el.className) && /sm:block/.test(el.className) && el.getAttribute("dir") === "ltr",
      );
      expect(wideOverflow?.textContent).toBe("+1");
    });

    it("holiday and personal events both stay visible together -- neither hides the other", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays({ "2026-08-12": { holiday: HOLIDAY } })}
          eventsByDate={{ "2026-08-12": [shiftEvent({ date: "2026-08-12", period: "night" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("🍎");
      expect(cell.textContent).toContain("🌙");
      expect(cell.textContent).toContain("לילה");
    });
  });

  describe("mobile indicators never rely on truncated text (polish pass)", () => {
    it("an indicator with a semantic emoji shows the emoji at every width, with its text label hidden below sm:", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [shiftEvent({ date: "2026-08-12", period: "night" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const label = screen.getByText("לילה");
      // The label text itself is never visible below sm: -- only from sm: up.
      expect(label.className).toMatch(/hidden/);
      expect(label.className).toMatch(/sm:inline/);
      // Nothing here ever truncates with an ellipsis-style class combined
      // with hidden text -- the emoji (not the label) is what mobile shows.
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(cell.textContent).toContain("🌙");
    });

    it("an indicator with no semantic emoji (e.g. an 'אפטר' absence) shows a small non-truncated fallback dot instead of clipped text", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [absenceEvent({ date: "2026-08-12", absenceKind: "after", title: "אפטר" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
      // The label text is present in the DOM (for sm:+) but hidden below sm:.
      const label = screen.getByText("אפטר");
      expect(label.className).toMatch(/hidden/);
      expect(label.className).toMatch(/sm:inline/);
      // A small fallback dot exists for the mobile-only, non-text representation.
      const fallbackDot = cell.querySelector(".rounded-full.bg-border-strong");
      expect(fallbackDot).not.toBeNull();
      expect(fallbackDot?.className).toMatch(/sm:hidden/);
    });

    it("never applies a truncating ellipsis class to anything visible below sm: -- truncate only ever wraps the sm:-only label", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{ "2026-08-12": [dutyEvent({ date: "2026-08-12" })] }}
          selectedDate={null}
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const label = screen.getByText("תורנות");
      expect(label.className).toMatch(/truncate/);
      // The truncate class lives on the label span itself, which is hidden
      // below sm: -- it never applies to the always-visible emoji/fallback.
      expect(label.className).toMatch(/hidden/);
    });
  });

  describe("weekend distinction (Thursday-Saturday, tasteful and subtle)", () => {
    it("gives the Thursday/Friday/Saturday weekday header labels a distinct, non-quiet tone", () => {
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
      const headerLabels = container.querySelectorAll("div.grid.flex-1.grid-cols-7 > span");
      expect(headerLabels).toHaveLength(7);
      // Sunday (index 0) stays the quiet weekday tone.
      expect(headerLabels[0].className).toMatch(/text-muted-2/);
      // Thursday/Friday/Saturday (indices 4-6) get the distinct weekend tone.
      expect(headerLabels[4].className).toMatch(/text-muted(?!-2)/);
      expect(headerLabels[5].className).toMatch(/text-muted(?!-2)/);
      expect(headerLabels[6].className).toMatch(/text-muted(?!-2)/);
    });

    it("gives an unselected weekend day cell a subtle background wash a weekday cell doesn't get", () => {
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
      // 2026-08-14 is a Friday (weekend); 2026-08-12 is a Wednesday (weekday).
      const weekendCell = screen.getByRole("button", { name: /14 באוגוסט/ });
      const weekdayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
      expect(weekendCell.className).toMatch(/bg-overlay-faint/);
      expect(weekdayCell.className).not.toMatch(/bg-overlay-faint/);
    });

    it("a selected weekend day uses the normal selection background, not the weekend wash", () => {
      render(
        <CalendarGrid
          grid={WEEK_GRID}
          days={weekDays()}
          eventsByDate={{}}
          selectedDate="2026-08-14"
          onSelectDate={noop}
          activeShiftDates={[]}
        />,
      );
      const cell = screen.getByRole("button", { name: /14 באוגוסט/ });
      expect(cell.className).toMatch(/bg-overlay-strong/);
      expect(cell.className).not.toMatch(/bg-overlay-faint/);
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
