import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { LocalNow } from "@/lib/domain/localNow";
import type { PersonalDutyAction, PersonalEventView } from "@/lib/readModels/types";
import { TodayTimeline } from "./TodayTimeline";

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
    timing: {
      status: "resolved",
      startLocalTime: "07:30",
      endLocalTime: "19:30",
      durationMinutes: 720,
      elapsedMinutesAtLoad: 150,
      remainingMinutesAtLoad: 570,
      progressPercentAtLoad: 21,
      minutesUntilStartAtLoad: 0,
    },
    ...overrides,
  };
}

function dutyEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return shiftEvent({
    category: "duty",
    role: null,
    period: "unspecified",
    dutyFamily: "guard",
    title: "שומר 1",
    rawValue: "שומר 1",
    timing: { status: "not_evaluable" },
    ...overrides,
  });
}

function dutyAction(overrides: Partial<PersonalDutyAction> = {}): PersonalDutyAction {
  return { type: "duty_check_in", date: "2026-08-12", localTime: "13:00", dutyFamily: "guard", slot: 1, ...overrides };
}

function localNow(overrides: Partial<LocalNow> = {}): LocalNow {
  return { date: "2026-08-12", minuteOfDay: 10 * 60, ...overrides };
}

describe("TodayTimeline", () => {
  it("29. includes todayEvents", () => {
    render(<TodayTimeline todayEvents={[shiftEvent()]} todayDutyActions={[]} localNow={localNow()} />);
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
  });

  it("30. a today duty action displays its 13:00 check-in", () => {
    render(<TodayTimeline todayEvents={[]} todayDutyActions={[dutyAction()]} localNow={localNow()} />);
    expect(screen.getByText("בדיקת תורנות")).toBeInTheDocument();
    expect(screen.getByText("13:00")).toBeInTheDocument();
    expect(screen.getByText("שמירה")).toBeInTheDocument();
  });

  it("31. an event without a known hour is shown in the no-time section, without an invented time", () => {
    render(<TodayTimeline todayEvents={[dutyEvent()]} todayDutyActions={[]} localNow={localNow()} />);
    expect(screen.getByText("ללא שעה")).toBeInTheDocument();
    expect(screen.getByText("שומר 1")).toBeInTheDocument();
  });

  it("shows the resolved time range for a timed shift", () => {
    render(<TodayTimeline todayEvents={[shiftEvent()]} todayDutyActions={[]} localNow={localNow()} />);
    expect(screen.getByText(/07:30/)).toBeInTheDocument();
    expect(screen.getByText(/19:30/)).toBeInTheDocument();
  });

  it("renders a polished empty state when there is nothing today", () => {
    render(<TodayTimeline todayEvents={[]} todayDutyActions={[]} localNow={localNow()} />);
    expect(screen.getByText("אין פריטים מתוזמנים היום.")).toBeInTheDocument();
  });

  it("marks a finished item as past and an unstarted duty action as future", () => {
    const { container } = render(
      <TodayTimeline
        todayEvents={[shiftEvent({ timing: { status: "resolved", startLocalTime: "07:30", endLocalTime: "09:00", durationMinutes: 90, elapsedMinutesAtLoad: 90, remainingMinutesAtLoad: 0, progressPercentAtLoad: 100, minutesUntilStartAtLoad: 0 } })]}
        todayDutyActions={[dutyAction({ localTime: "13:00" })]}
        localNow={localNow({ minuteOfDay: 10 * 60 })}
      />,
    );
    // The finished shift row should be visually de-emphasized.
    const items = container.querySelectorAll("li");
    expect(items[0].querySelector(".opacity-55")).not.toBeNull();
  });

  it("shows a semantic emoji anchor for a known day shift", () => {
    const { container } = render(
      <TodayTimeline todayEvents={[shiftEvent()]} todayDutyActions={[]} localNow={localNow()} />,
    );
    expect(container.textContent).toContain("☀️");
  });

  it("shows a semantic emoji anchor for a duty check-in action, from its typed dutyFamily", () => {
    const { container } = render(
      <TodayTimeline todayEvents={[]} todayDutyActions={[dutyAction({ dutyFamily: "guard" })]} localNow={localNow()} />,
    );
    expect(container.textContent).toContain("🛡️");
  });

  it("shows no emoji for a non-timed event with no known semantic mapping", () => {
    const { container } = render(
      <TodayTimeline
        todayEvents={[dutyEvent({ dutyFamily: "rasar", title: "רס״ר" })]}
        todayDutyActions={[]}
        localNow={localNow()}
      />,
    );
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
  });
});
