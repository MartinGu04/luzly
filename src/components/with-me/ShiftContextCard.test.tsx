import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalCounterpart } from "@/lib/readModels/types";
import { ShiftContextCard } from "./ShiftContextCard";
import type { ShiftContextView } from "./types";

afterEach(() => {
  cleanup();
});

function counterpart(overrides: Partial<PersonalCounterpart> = {}): PersonalCounterpart {
  return {
    personId: "p_2",
    personName: "נועה דוגמה",
    role: "supervisor",
    certainty: "confirmed",
    shadow: false,
    period: "day",
    startTimeOverride: null,
    endTimeOverride: null,
    ...overrides,
  };
}

function view(overrides: Partial<ShiftContextView> = {}): ShiftContextView {
  return {
    key: "current-2026-08-12-technician-day-0",
    emoji: "☀️",
    title: "טכנאי יום",
    dateLabel: "היום",
    hebrewCalendarLabel: null,
    coverageStatus: "full",
    missingIntervalLabels: [],
    primaryCounterparts: [],
    shadowCounterparts: [],
    emptyCounterpartMessage: "אין מידע על אנשים נוספים במשמרת הזו.",
    ...overrides,
  };
}

describe("ShiftContextCard", () => {
  it("shows the emoji, title, and date", () => {
    render(<ShiftContextCard view={view()} emphasized />);
    expect(screen.getByText("☀️")).toBeInTheDocument();
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText("היום")).toBeInTheDocument();
  });

  it("shows the Hebrew-calendar date only when provided", () => {
    const { rerender } = render(<ShiftContextCard view={view({ hebrewCalendarLabel: "כ״ט באב תשפ״ו" })} emphasized />);
    expect(screen.getByText(/כ״ט באב תשפ״ו/)).toBeInTheDocument();
    rerender(<ShiftContextCard view={view({ hebrewCalendarLabel: null })} emphasized />);
    expect(screen.queryByText(/תשפ״ו/)).toBeNull();
  });

  it("shows the coverage badge", () => {
    render(<ShiftContextCard view={view({ coverageStatus: "missing" })} emphasized />);
    expect(screen.getByText("אין כיסוי")).toBeInTheDocument();
  });

  it("shows a missing-coverage callout with formatted ranges when partial/missing and intervals exist", () => {
    render(
      <ShiftContextCard
        view={view({ coverageStatus: "partial", missingIntervalLabels: ["05:30–07:30"] })}
        emphasized
      />,
    );
    expect(screen.getByText("חסר כיסוי:")).toBeInTheDocument();
    expect(screen.getByText(/05:30–07:30/)).toBeInTheDocument();
  });

  it("joins multiple missing-interval ranges", () => {
    render(
      <ShiftContextCard
        view={view({ coverageStatus: "missing", missingIntervalLabels: ["05:30–07:30", "19:30–20:30"] })}
        emphasized
      />,
    );
    expect(screen.getByText(/05:30–07:30 · 19:30–20:30/)).toBeInTheDocument();
  });

  it("regression: wraps the missing-interval range in dir=\"ltr\" so RTL bidi never visually reverses '05:30–07:30' into '07:30-05:30'", () => {
    render(
      <ShiftContextCard
        view={view({ coverageStatus: "partial", missingIntervalLabels: ["05:30–07:30"] })}
        emphasized
      />,
    );
    const rangeText = screen.getByText(/05:30–07:30/);
    expect(rangeText).toHaveAttribute("dir", "ltr");
  });

  it("never shows the missing-coverage callout for full coverage", () => {
    render(<ShiftContextCard view={view({ coverageStatus: "full" })} emphasized />);
    expect(screen.queryByText("חסר כיסוי:")).toBeNull();
  });

  it("never shows the missing-coverage callout when there are no intervals, even if partial/missing", () => {
    render(<ShiftContextCard view={view({ coverageStatus: "missing", missingIntervalLabels: [] })} emphasized />);
    expect(screen.queryByText("חסר כיסוי:")).toBeNull();
  });

  it("shows multiple primary counterparts, all preserved", () => {
    render(
      <ShiftContextCard
        view={view({
          primaryCounterparts: [counterpart({ personId: "a", personName: "נועה דוגמה" }), counterpart({ personId: "b", personName: "משה כהן" })],
        })}
        emphasized
      />,
    );
    expect(screen.getByText("הצוות איתך")).toBeInTheDocument();
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
    expect(screen.getByText("משה כהן")).toBeInTheDocument();
  });

  it("shows shadow counterparts in a visually distinct section from primary", () => {
    render(
      <ShiftContextCard
        view={view({
          primaryCounterparts: [counterpart({ personId: "a", personName: "נועה דוגמה" })],
          shadowCounterparts: [counterpart({ personId: "b", personName: "משה כהן", shadow: true })],
        })}
        emphasized
      />,
    );
    expect(screen.getByText("הצוות איתך")).toBeInTheDocument();
    // "חפיפה / צל" appears twice by design: once as the section heading, once as the row badge.
    expect(screen.getAllByText("חפיפה / צל")).toHaveLength(2);
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
    expect(screen.getByText("משה כהן")).toBeInTheDocument();
  });

  it("shows the contextual empty-counterpart message only when both lists are empty", () => {
    render(<ShiftContextCard view={view({ emptyCounterpartMessage: "לא נמצא כיסוי לתפקיד המשלים במשמרת הזו." })} emphasized />);
    expect(screen.getByText("לא נמצא כיסוי לתפקיד המשלים במשמרת הזו.")).toBeInTheDocument();
  });

  it("never shows the empty-counterpart message when there IS a primary counterpart", () => {
    render(
      <ShiftContextCard
        view={view({
          primaryCounterparts: [counterpart()],
          emptyCounterpartMessage: "לא נמצא כיסוי לתפקיד המשלים במשמרת הזו.",
        })}
        emphasized
      />,
    );
    expect(screen.queryByText("לא נמצא כיסוי לתפקיד המשלים במשמרת הזו.")).toBeNull();
  });
});
