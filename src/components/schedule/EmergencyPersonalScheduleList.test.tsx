import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { LocalNow } from "@/lib/domain/localNow";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { EmergencyPersonalScheduleList } from "./EmergencyPersonalScheduleList";

const TODAY_DATE = "2026-08-26";
const TODAY: LocalNow = { date: TODAY_DATE, minuteOfDay: 600 };

afterEach(() => {
  cleanup();
});

function shift(overrides: Partial<EmergencyPersonalShiftEntry> = {}): EmergencyPersonalShiftEntry {
  return {
    date: "2026-08-26",
    period: "day",
    ownDesks: ["הוגוורט"],
    roster: [],
    ...overrides,
  };
}

describe("EmergencyPersonalScheduleList -- empty states", () => {
  it("shows an empty state with the colleague's name when person perspective has no shifts at all", () => {
    render(<EmergencyPersonalScheduleList shifts={[]} emptyStateName="עמית בדיקה" range="7d" localNow={TODAY} />);
    expect(screen.getByText(/עמית בדיקה/)).toBeInTheDocument();
  });

  it("shows a generic empty state for self with no name", () => {
    render(<EmergencyPersonalScheduleList shifts={[]} emptyStateName={null} range="7d" localNow={TODAY} />);
    expect(screen.getByText("אין משמרות חירום ידועות.")).toBeInTheDocument();
  });

  it("a multi-day range (7d/30d) with zero matches shows a calm empty note, never a wall of empty cards", () => {
    render(
      <EmergencyPersonalScheduleList shifts={[shift({ date: "2026-02-10" })]} emptyStateName={null} range="7d" localNow={TODAY} />,
    );
    expect(screen.getByText("אין משמרות חירום בטווח שנבחר.")).toBeInTheDocument();
    expect(screen.queryByTestId("emergency-agenda-current")).not.toBeInTheDocument();
    expect(screen.getByTestId("emergency-agenda-history")).toBeInTheDocument();
  });

  it("a single-day range (today/tomorrow) with nothing recorded still renders ONE card anchored on that date, with a calm 'no shift' state -- never a blank page", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: "2026-09-01" })]} emptyStateName={null} range="today" localNow={TODAY} />);

    const cards = screen.getAllByTestId("emergency-day-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText(/26 באוגוסט/)).toBeInTheDocument();
    expect(within(cards[0]).getAllByText("אין משמרת")).toHaveLength(2); // both day and night columns
  });
});

describe("EmergencyPersonalScheduleList -- own desks and roster ('מי איתי')", () => {
  it("renders own desk(s) and the roster of others sharing that date+period", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ ownDesks: ["הוגוורט", "תיעוד"], roster: [{ personId: "p2", personName: "ליה", desk: "ק'" }] })]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    expect(screen.getByText(/הוגוורט, תיעוד/)).toBeInTheDocument();
    expect(screen.getByText(/ליה/)).toBeInTheDocument();
    expect(screen.getByText(/ק'/)).toBeInTheDocument();
  });

  it("never renders a shift for a date+period the viewed person has no desk in, even if it's a known recorded shift for others", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: TODAY_DATE, ownDesks: [], roster: [{ personId: "p2", personName: "אחר לגמרי", desk: "ק'" }] })]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    expect(screen.queryByText(/אחר לגמרי/)).not.toBeInTheDocument();
    expect(screen.getAllByText("אין משמרת")).toHaveLength(2);
  });
});

describe("EmergencyPersonalScheduleList -- default selection is 7 ימים (verified through the range prop)", () => {
  it("a shift 6 days out is included, one 8 days out is excluded, when range='7d'", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-09-01" }), shift({ date: "2026-09-03" })]}
        emptyStateName={null}
        range="7d"
        localNow={TODAY}
      />,
    );

    expect(screen.getByText(/1 בספטמבר/)).toBeInTheDocument();
    expect(screen.queryByText(/3 בספטמבר/)).not.toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- today filtering", () => {
  it("range='today' shows only today's card, excluding any other date", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: TODAY_DATE }), shift({ date: "2026-08-27" })]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    const cards = screen.getAllByTestId("emergency-day-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText(/26 באוגוסט/)).toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- tomorrow filtering", () => {
  it("range='tomorrow' shows only tomorrow's card, excluding today and later dates", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: TODAY_DATE }), shift({ date: "2026-08-27" }), shift({ date: "2026-08-28" })]}
        emptyStateName={null}
        range="tomorrow"
        localNow={TODAY}
      />,
    );

    const cards = screen.getAllByTestId("emergency-day-card");
    expect(cards).toHaveLength(1);
    expect(within(cards[0]).getByText(/27 באוגוסט/)).toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- 7-day filtering", () => {
  it("range='7d' includes today through day+6 and excludes day+7", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-08-26" }), shift({ date: "2026-09-01" }), shift({ date: "2026-09-02" })]}
        emptyStateName={null}
        range="7d"
        localNow={TODAY}
      />,
    );

    expect(screen.getAllByTestId("emergency-day-card")).toHaveLength(2);
    expect(screen.queryByText(/2 בספטמבר/)).not.toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- 30-day filtering", () => {
  it("range='30d' includes today through day+29 and excludes day+30", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-08-26" }), shift({ date: "2026-09-24" }), shift({ date: "2026-09-25" })]}
        emptyStateName={null}
        range="30d"
        localNow={TODAY}
      />,
    );

    expect(screen.getAllByTestId("emergency-day-card")).toHaveLength(2);
    expect(screen.queryByText(/25 בספטמבר/)).not.toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- chronological/calendar placement", () => {
  it("day-cards appear in the DOM in chronological ascending order, regardless of input order", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-09-01" }), shift({ date: "2026-08-27" }), shift({ date: "2026-08-30" })]}
        emptyStateName={null}
        range="30d"
        localNow={TODAY}
      />,
    );

    const cards = screen.getAllByTestId("emergency-day-card");
    const dateTexts = cards.map((card) => card.textContent ?? "");
    expect(dateTexts[0]).toMatch(/27 באוגוסט/);
    expect(dateTexts[1]).toMatch(/30 באוגוסט/);
    expect(dateTexts[2]).toMatch(/1 בספטמבר/);
  });
});

describe("EmergencyPersonalScheduleList -- grouping multiple desks in the same date+period", () => {
  it("multiple desks for the same person/date/period render together in ONE period column, not split across several", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: TODAY_DATE, period: "day", ownDesks: ["הוגוורט", "תיעוד", "ק'"] })]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    const dayColumn = screen.getByTestId("emergency-period-column-day");
    expect(within(dayColumn).getByText(/הוגוורט, תיעוד, ק'/)).toBeInTheDocument();
    expect(screen.getAllByTestId(/emergency-period-column-/)).toHaveLength(2); // day + night, never a 3rd for the extra desk
  });

  it("day and night on the same date render as two separate columns within the SAME date card", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[
          shift({ date: TODAY_DATE, period: "day", ownDesks: ["הוגוורט"] }),
          shift({ date: TODAY_DATE, period: "night", ownDesks: ["ק'"] }),
        ]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    expect(screen.getAllByTestId("emergency-day-card")).toHaveLength(1);
    expect(within(screen.getByTestId("emergency-period-column-day")).getByText(/הוגוורט/)).toBeInTheDocument();
    expect(within(screen.getByTestId("emergency-period-column-night")).getByText(/ק'/)).toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- day/night presentation", () => {
  it("shows a clear יום indication for a day shift", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ period: "day" })]} emptyStateName={null} range="today" localNow={TODAY} />);
    expect(within(screen.getByTestId("emergency-period-column-day")).getByText(/יום/)).toBeInTheDocument();
  });

  it("shows a clear לילה indication for a night shift", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ period: "night" })]} emptyStateName={null} range="today" localNow={TODAY} />);
    expect(within(screen.getByTestId("emergency-period-column-night")).getByText(/לילה/)).toBeInTheDocument();
  });

  it("day and night columns carry different soft background classes when populated", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: TODAY_DATE, period: "day" }), shift({ date: TODAY_DATE, period: "night" })]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    const dayColumn = screen.getByTestId("emergency-period-column-day");
    const nightColumn = screen.getByTestId("emergency-period-column-night");
    expect(dayColumn.className).not.toBe(nightColumn.className);
  });
});

describe("EmergencyPersonalScheduleList -- today is visually obvious", () => {
  it("marks today's card with a distinct 'היום' badge", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: TODAY_DATE })]} emptyStateName={null} range="today" localNow={TODAY} />);
    expect(screen.getByText("היום")).toBeInTheDocument();
  });

  it("does not show a 'היום' badge on a non-today date", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: "2026-08-30" })]} emptyStateName={null} range="30d" localNow={TODAY} />);
    expect(screen.queryByText("היום")).not.toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- old history never becomes the default focus", () => {
  it("a date far in the past (e.g. February) is NOT rendered in the always-visible current grid", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-02-10" }), shift({ date: "2026-08-27" })]}
        emptyStateName={null}
        range="30d"
        localNow={TODAY}
      />,
    );

    const current = screen.getByTestId("emergency-agenda-current");
    expect(within(current).queryByText(/פברואר/)).not.toBeInTheDocument();
  });

  it("the past date is still reachable via the collapsed history disclosure -- never dropped entirely, regardless of the selected range", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-02-10" }), shift({ date: "2026-08-27" })]}
        emptyStateName={null}
        range="today"
        localNow={TODAY}
      />,
    );

    const history = screen.getByTestId("emergency-agenda-history");
    expect(within(history).getByText(/פברואר/)).toBeInTheDocument();
    expect(history).not.toHaveAttribute("open");
  });

  it("no history disclosure renders at all when every shift is upcoming/current", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: "2026-08-27" })]} emptyStateName={null} range="7d" localNow={TODAY} />);
    expect(screen.queryByTestId("emergency-agenda-history")).not.toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- responsive card grid (mirrors ManagerCoverageSection's own mobile/desktop behavior)", () => {
  it("the current-range grid never forces a fixed multi-column layout -- single column by default, widening only from sm: up", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: TODAY_DATE })]} emptyStateName={null} range="7d" localNow={TODAY} />);

    const grid = screen.getByTestId("emergency-agenda-current");
    expect(grid.className).toContain("grid-cols-1");
    expect(grid.className).toContain("sm:grid-cols-2");
  });
});
