import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { EMERGENCY_DESK_NAMES } from "@/lib/domain/emergencyDesks";
import type { EmergencyManagerOperationalOverview as OverviewModel } from "@/lib/readModels/buildEmergencyManagerOverview";
import type { EmergencyDeskSlot, EmergencyEveryoneShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { EmergencyManagerOperationalOverview } from "./EmergencyManagerOperationalOverview";

afterEach(() => {
  cleanup();
});

function desks(overrides: Partial<Record<string, Partial<EmergencyDeskSlot>>> = {}): EmergencyDeskSlot[] {
  return EMERGENCY_DESK_NAMES.map((desk) => ({ desk, personId: null, personName: null, ...overrides[desk] }));
}

function shiftEntry(overrides: Partial<EmergencyEveryoneShiftEntry> = {}): EmergencyEveryoneShiftEntry {
  return { date: "2026-08-27", period: "day", desks: desks(), ...overrides };
}

function overview(overrides: Partial<OverviewModel> = {}): OverviewModel {
  return { previous: null, current: null, next: null, ...overrides };
}

describe("EmergencyManagerOperationalOverview -- previous/current/next resolution rendering", () => {
  it("renders all three cards with their own distinguishing titles", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview({
          previous: shiftEntry({ date: "2026-08-26", period: "night" }),
          current: shiftEntry({ date: "2026-08-27", period: "day" }),
          next: shiftEntry({ date: "2026-08-27", period: "night" }),
        })}
        fullSchedule={[]}
      />,
    );

    expect(screen.getByText("משמרת קודמת")).toBeInTheDocument();
    expect(screen.getByText("משמרת נוכחית")).toBeInTheDocument();
    expect(screen.getByText("משמרת הבאה")).toBeInTheDocument();
  });

  it("shows each card's own date and day/night distinction", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview({
          current: shiftEntry({ date: "2026-08-27", period: "day" }),
          next: shiftEntry({ date: "2026-08-27", period: "night" }),
        })}
        fullSchedule={[]}
      />,
    );

    const current = screen.getByTestId("emergency-manager-shift-current");
    expect(within(current).getByText(/27 באוגוסט/)).toBeInTheDocument();
    expect(within(current).getByText(/יום/)).toBeInTheDocument();

    const next = screen.getByTestId("emergency-manager-shift-next");
    expect(within(next).getByText(/לילה/)).toBeInTheDocument();
  });
});

describe("EmergencyManagerOperationalOverview -- current shift emphasis/state", () => {
  it("current uses the strongest Panel emphasis (hero), distinguishable from previous (quieter/compact) and next (standard)", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview({
          previous: shiftEntry({ date: "2026-08-26" }),
          current: shiftEntry({ date: "2026-08-27" }),
          next: shiftEntry({ date: "2026-08-28" }),
        })}
        fullSchedule={[]}
      />,
    );

    const previous = screen.getByTestId("emergency-manager-shift-previous");
    const current = screen.getByTestId("emergency-manager-shift-current");
    const next = screen.getByTestId("emergency-manager-shift-next");

    expect(current.className).toContain("bg-surface-2"); // hero variant's own surface
    expect(previous.className).not.toContain("bg-surface-2");
    expect(next.className).not.toContain("bg-surface-2");
    expect(previous.className).toContain("opacity-80"); // visually quieter
    expect(current.className).not.toContain("opacity-80");
    expect(next.className).not.toContain("opacity-80");
    // All three carry visibly distinct treatments from one another.
    expect(current.className).not.toBe(previous.className);
    expect(current.className).not.toBe(next.className);
    expect(previous.className).not.toBe(next.className);
  });

  it("shows a calm empty state for the current slot when nothing is recorded at the exact current time, while previous/next still render normally", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview({ previous: shiftEntry({ date: "2026-08-26" }), current: null, next: shiftEntry({ date: "2026-08-27" }) })}
        fullSchedule={[]}
      />,
    );

    const current = screen.getByTestId("emergency-manager-shift-current");
    expect(within(current).getByText("אין נתוני שיבוץ למשמרת זו.")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-manager-shift-previous")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-manager-shift-next")).toBeInTheDocument();
  });

  it("shows the same calm empty state for previous/next when either is unavailable", () => {
    render(<EmergencyManagerOperationalOverview overview={overview({ current: shiftEntry() })} fullSchedule={[]} />);

    expect(within(screen.getByTestId("emergency-manager-shift-previous")).getByText("אין נתוני שיבוץ למשמרת זו.")).toBeInTheDocument();
    expect(within(screen.getByTestId("emergency-manager-shift-next")).getByText("אין נתוני שיבוץ למשמרת זו.")).toBeInTheDocument();
  });
});

describe("EmergencyManagerOperationalOverview -- all desks and assigned people are shown", () => {
  it("the current card shows every one of the ten canonical desks, staffed and unstaffed", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview({
          current: shiftEntry({ desks: desks({ [EMERGENCY_DESK_NAMES[0]]: { personId: "p1", personName: "מרטין" } }) }),
        })}
        fullSchedule={[]}
      />,
    );

    const current = screen.getByTestId("emergency-manager-shift-current");
    for (const desk of EMERGENCY_DESK_NAMES) {
      expect(within(current).getByText(desk)).toBeInTheDocument();
    }
    expect(within(current).getByText("מרטין")).toBeInTheDocument();
    expect(within(current).getAllByText("לא מאויש")).toHaveLength(EMERGENCY_DESK_NAMES.length - 1);
  });
});

describe("EmergencyManagerOperationalOverview -- unresolved people remain visible", () => {
  it("an unresolved assignment's raw name still shows in the current card, never dropped or shown as unstaffed", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview({
          current: shiftEntry({ desks: desks({ [EMERGENCY_DESK_NAMES[0]]: { personId: null, personName: "שם לא מזוהה" } }) }),
        })}
        fullSchedule={[]}
      />,
    );

    expect(within(screen.getByTestId("emergency-manager-shift-current")).getByText("שם לא מזוהה")).toBeInTheDocument();
  });
});

describe("EmergencyManagerOperationalOverview -- historical shifts never dominate the default view", () => {
  it("the full historical schedule is hidden behind a collapsed <details> secondary section, never shown open by default", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview()}
        fullSchedule={[shiftEntry({ date: "2026-02-10" }), shiftEntry({ date: "2026-08-27" })]}
      />,
    );

    const fullSection = screen.getByTestId("emergency-manager-full-schedule");
    expect(fullSection).not.toHaveAttribute("open");
    expect(within(fullSection).getByText(/לכל סידור החירום/)).toBeInTheDocument();
  });

  it("the historical data is still fully reachable inside the disclosure, never dropped", () => {
    render(
      <EmergencyManagerOperationalOverview
        overview={overview()}
        fullSchedule={[shiftEntry({ date: "2026-02-10" })]}
      />,
    );

    expect(within(screen.getByTestId("emergency-manager-full-schedule")).getByText(/פברואר/)).toBeInTheDocument();
  });

  it("the secondary section never renders at all when there is no historical data", () => {
    render(<EmergencyManagerOperationalOverview overview={overview()} fullSchedule={[]} />);
    expect(screen.queryByTestId("emergency-manager-full-schedule")).not.toBeInTheDocument();
  });

  it("the previous/current/next cards appear before the historical section in DOM order -- the operational triad is the FIRST thing shown", () => {
    const { container } = render(
      <EmergencyManagerOperationalOverview overview={overview({ current: shiftEntry() })} fullSchedule={[shiftEntry({ date: "2026-02-10" })]} />,
    );

    const triad = screen.getByTestId("emergency-manager-shift-current");
    const history = screen.getByTestId("emergency-manager-full-schedule");
    // compareDocumentPosition: DOCUMENT_POSITION_FOLLOWING (4) means `history` comes after `triad`.
    expect(triad.compareDocumentPosition(history) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).toBeInTheDocument();
  });
});
