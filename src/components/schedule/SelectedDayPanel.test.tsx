import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalEventView } from "@/lib/readModels/types";
import type { HolidayContext } from "@/lib/presentation/hebrewCalendar";
import { SelectedDayPanel } from "./SelectedDayPanel";
import type { DayMeta } from "./types";

afterEach(() => {
  cleanup();
});

function shiftEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return {
    date: "2026-08-16",
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

function holiday(overrides: Partial<HolidayContext> = {}): HolidayContext {
  return { emoji: "🍎", label: "ראש השנה", kind: "holiday", shortLabel: "חג", ...overrides };
}

function meta(overrides: Partial<DayMeta> = {}): DayMeta {
  return {
    date: "2026-08-16",
    dayNumber: 16,
    isToday: false,
    isPast: false,
    dateLabel: "יום ראשון · 16 באוגוסט · ג׳ באלול תשפ״ו",
    holiday: null,
    ...overrides,
  };
}

describe("SelectedDayPanel", () => {
  it("renders nothing when no day is selected", () => {
    const { container } = render(<SelectedDayPanel dayMeta={null} events={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the composed weekday/Gregorian/Hebrew-calendar date line", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[]} />);
    expect(screen.getByText("יום ראשון · 16 באוגוסט · ג׳ באלול תשפ״ו")).toBeInTheDocument();
  });

  it("shows a calm free-day message when there is nothing scheduled", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[]} />);
    expect(screen.getByText("היום פנוי אצלך 😌")).toBeInTheDocument();
  });

  it("shows a resolved TimeRange for a resolved shift", () => {
    const event = shiftEvent({
      timing: {
        status: "resolved",
        startLocalTime: "07:30",
        endLocalTime: "19:30",
        durationMinutes: 720,
        elapsedMinutesAtLoad: 0,
        remainingMinutesAtLoad: 720,
        progressPercentAtLoad: 0,
        minutesUntilStartAtLoad: 0,
      },
    });
    const { container } = render(<SelectedDayPanel dayMeta={meta()} events={[event]} />);
    expect(container.textContent).toContain("07:30");
    expect(container.textContent).toContain("19:30");
    expect(screen.queryByText("השעה טרם מוגדרת")).toBeNull();
  });

  it("shows 'השעה טרם מוגדרת' instead of inventing a time for a not_evaluable shift", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ timing: { status: "not_evaluable" } })]} />);
    expect(screen.getByText("השעה טרם מוגדרת")).toBeInTheDocument();
  });

  it("shows a holiday chip with the full specific name when the day has holiday context", () => {
    render(<SelectedDayPanel dayMeta={meta({ holiday: holiday() })} events={[]} />);
    expect(screen.getByText("ראש השנה")).toBeInTheDocument();
    expect(screen.getByText("🍎")).toBeInTheDocument();
  });

  it("shows the holiday's kind-specific full wording (Chol HaMoed), never just the generic short label", () => {
    render(
      <SelectedDayPanel
        dayMeta={meta({ holiday: holiday({ label: "חול המועד סוכות", kind: "cholHamoed", shortLabel: "חוה״מ" }) })}
        events={[]}
      />,
    );
    expect(screen.getByText("חול המועד סוכות")).toBeInTheDocument();
  });

  it("shows a tentative badge for a tentative shift", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ certainty: "tentative" })]} />);
    expect(screen.getByText("משוער")).toBeInTheDocument();
  });

  it("shows a shadow/handover badge for a shadow shift", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ shadow: true })]} />);
    expect(screen.getByText("חפיפה / צל")).toBeInTheDocument();
  });

  it("preserves and shows ALL shifts when there are multiple on the same day, never collapsing to one", () => {
    const events = [
      shiftEvent({ period: "day", title: "טכנאי יום" }),
      shiftEvent({ period: "night", title: "טכנאי לילה" }),
    ];
    render(<SelectedDayPanel dayMeta={meta()} events={events} />);
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
  });

  it("shows role/period as a subtitle line for a shift", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ role: "technician", period: "day" })]} />);
    expect(screen.getByText("טכנאי · יום")).toBeInTheDocument();
  });

  it("shows the semantic shift emoji from the typed period field", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ period: "night" })]} />);
    expect(screen.getByText("🌙")).toBeInTheDocument();
  });

  describe("duties are shown in full detail", () => {
    it("shows the duty's title and family+slot subtitle", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[dutyEvent({ dutyFamily: "guard", slot: 1 })]} />);
      expect(screen.getByText("שומר 1")).toBeInTheDocument();
      expect(screen.getByText("שמירה 1")).toBeInTheDocument();
    });

    it("shows the duty's semantic emoji", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[dutyEvent({ dutyFamily: "guard" })]} />);
      expect(screen.getByText("🛡️")).toBeInTheDocument();
    });

    it("never shows a time row for a duty -- it isn't a timed shift", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[dutyEvent()]} />);
      expect(screen.queryByText("השעה טרם מוגדרת")).toBeNull();
    });

    it("a duty and a shift on the same day both render in full, never merged", () => {
      const events = [shiftEvent({ period: "day" }), dutyEvent()];
      render(<SelectedDayPanel dayMeta={meta()} events={events} />);
      expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
      expect(screen.getByText("שומר 1")).toBeInTheDocument();
    });
  });

  describe("absences are shown in full detail", () => {
    it("shows the absence's kind label, but only once -- title and subtitle read the same word here", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[absenceEvent({ absenceKind: "vacation", title: "חופש" })]} />);
      expect(screen.getAllByText("חופש")).toHaveLength(1);
    });

    it("distinguishes an 'after' absence from vacation", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[absenceEvent({ absenceKind: "after", title: "אפטר" })]} />);
      expect(screen.getAllByText("אפטר").length).toBeGreaterThan(0);
      expect(screen.queryByText("חופש")).toBeNull();
    });

    it("never shows a time row for an absence", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[absenceEvent()]} />);
      expect(screen.queryByText("השעה טרם מוגדרת")).toBeNull();
    });
  });

  describe("redundant title/subtitle text is never rendered twice (polish pass)", () => {
    it("renders 'חופש' exactly once when the absence title and its derived kind label are identical", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[absenceEvent({ absenceKind: "vacation", title: "חופש" })]} />);
      expect(screen.getAllByText("חופש")).toHaveLength(1);
    });

    it("renders 'אפטר' exactly once when the absence title and its derived kind label are identical", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[absenceEvent({ absenceKind: "after", title: "אפטר" })]} />);
      expect(screen.getAllByText("אפטר")).toHaveLength(1);
    });

    it("still shows a genuinely different subtitle -- shift role/period is never suppressed", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ title: "טכנאי יום", role: "technician", period: "day" })]} />);
      expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
      expect(screen.getByText("טכנאי · יום")).toBeInTheDocument();
    });

    it("still shows a genuinely different subtitle -- duty family/slot is never suppressed", () => {
      render(<SelectedDayPanel dayMeta={meta()} events={[dutyEvent({ title: "שומר 1", dutyFamily: "guard", slot: 1 })]} />);
      expect(screen.getByText("שומר 1")).toBeInTheDocument();
      expect(screen.getByText("שמירה 1")).toBeInTheDocument();
    });

    it("still shows the tentative/shadow badges and change note even when the subtitle itself is suppressed", () => {
      render(
        <SelectedDayPanel
          dayMeta={meta()}
          events={[
            absenceEvent({
              absenceKind: "vacation",
              title: "חופש",
              certainty: "tentative",
              shadow: true,
              changeNote: "עודכן אתמול",
            }),
          ]}
        />,
      );
      expect(screen.getAllByText("חופש")).toHaveLength(1);
      expect(screen.getByText("משוער")).toBeInTheDocument();
      expect(screen.getByText("חפיפה / צל")).toBeInTheDocument();
      expect(screen.getByText("עודכן אתמול")).toBeInTheDocument();
    });
  });

  it("shows a change note when the event carries one", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ changeNote: "הוחלף מלילה ליום" })]} />);
    expect(screen.getByText("הוחלף מלילה ליום")).toBeInTheDocument();
  });

  it("never shows a change-note line when there isn't one", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ changeNote: null })]} />);
    // No stray empty line for the change note beyond the subtitle content already asserted elsewhere.
    expect(screen.queryByText("null")).toBeNull();
  });
});
