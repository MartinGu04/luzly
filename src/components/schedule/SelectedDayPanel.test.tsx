import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalEventView } from "@/lib/readModels/types";
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

  it("shows the empty-day message when there are no shifts", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[]} />);
    expect(screen.getByText("אין לך משמרת ביום הזה 😌")).toBeInTheDocument();
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

  it("shows a holiday chip when the day has holiday context", () => {
    render(
      <SelectedDayPanel
        dayMeta={meta({ holiday: { emoji: "🍎", label: "ראש השנה" } })}
        events={[]}
      />,
    );
    expect(screen.getByText("ראש השנה")).toBeInTheDocument();
    expect(screen.getByText("🍎")).toBeInTheDocument();
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

  it("shows role/period as a subtitle line", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ role: "technician", period: "day" })]} />);
    expect(screen.getByText("טכנאי · יום")).toBeInTheDocument();
  });

  it("shows the semantic shift emoji from the typed period field", () => {
    render(<SelectedDayPanel dayMeta={meta()} events={[shiftEvent({ period: "night" })]} />);
    expect(screen.getByText("🌙")).toBeInTheDocument();
  });
});
