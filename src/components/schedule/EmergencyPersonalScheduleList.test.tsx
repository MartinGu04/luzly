import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { EmergencyPersonalScheduleList } from "./EmergencyPersonalScheduleList";

const TODAY = "2026-08-26";

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
    render(<EmergencyPersonalScheduleList shifts={[]} emptyStateName="עמית בדיקה" todayDate={TODAY} />);
    expect(screen.getByText(/עמית בדיקה/)).toBeInTheDocument();
  });

  it("shows a generic empty state for self with no name", () => {
    render(<EmergencyPersonalScheduleList shifts={[]} emptyStateName={null} todayDate={TODAY} />);
    expect(screen.getByText("אין משמרות חירום ידועות.")).toBeInTheDocument();
  });

  it("shows a calm 'no upcoming shifts' note (not a blank agenda) when every known shift is in the past, while still surfacing the history disclosure", () => {
    render(
      <EmergencyPersonalScheduleList shifts={[shift({ date: "2026-02-10" })]} emptyStateName={null} todayDate={TODAY} />,
    );
    expect(screen.getByText("אין משמרות חירום קרובות.")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-agenda-history")).toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- own desks and roster", () => {
  it("renders own desk(s) and the roster of others", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ ownDesks: ["הוגוורט", "תיעוד"], roster: [{ personId: "p2", personName: "ליה", desk: "ק'" }] })]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    expect(screen.getByText(/הוגוורט, תיעוד/)).toBeInTheDocument();
    expect(screen.getByText(/ליה/)).toBeInTheDocument();
    expect(screen.getByText(/ק'/)).toBeInTheDocument();
  });

  it("never renders a row for a date+period the viewed person has no desk in, even if it's a known recorded shift for others", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[
          shift({ date: "2026-08-27", ownDesks: [], roster: [{ personId: "p2", personName: "אחר לגמרי", desk: "ק'" }] }),
        ]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    expect(screen.queryByText(/אחר לגמרי/)).not.toBeInTheDocument();
    expect(screen.getByText("אין משמרות חירום קרובות.")).toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- chronological upcoming agenda ordering", () => {
  it("renders date headings in chronological ascending order, regardless of input order", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-09-01" }), shift({ date: "2026-08-27" }), shift({ date: "2026-08-30" })]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    const upcoming = screen.getByTestId("emergency-agenda-upcoming");
    const rows = within(upcoming).getAllByTestId("emergency-shift-row");
    expect(rows).toHaveLength(3);
    // Date headings must appear in the DOM in chronological (ascending)
    // document order, regardless of the input array's own order.
    const text = upcoming.textContent ?? "";
    expect(text.indexOf("27 באוגוסט")).toBeLessThan(text.indexOf("30 באוגוסט"));
    expect(text.indexOf("30 באוגוסט")).toBeLessThan(text.indexOf("1 בספטמבר"));
  });
});

describe("EmergencyPersonalScheduleList -- old history never becomes the default/upcoming focus", () => {
  it("a date far in the past (e.g. February) is NOT rendered in the always-visible upcoming agenda", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-02-10" }), shift({ date: "2026-08-27" })]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    const upcoming = screen.getByTestId("emergency-agenda-upcoming");
    expect(within(upcoming).queryByText(/פברואר/)).not.toBeInTheDocument();
  });

  it("the past date is still reachable via the collapsed history disclosure -- never dropped entirely", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-02-10" }), shift({ date: "2026-08-27" })]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    const history = screen.getByTestId("emergency-agenda-history");
    expect(within(history).getByText(/פברואר/)).toBeInTheDocument();
    // Collapsed by default -- <details> with no `open` attribute.
    expect(history).not.toHaveAttribute("open");
  });

  it("no history disclosure renders at all when every shift is upcoming/current", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: "2026-08-27" })]} emptyStateName={null} todayDate={TODAY} />);
    expect(screen.queryByTestId("emergency-agenda-history")).not.toBeInTheDocument();
  });
});

describe("EmergencyPersonalScheduleList -- grouping multiple desks in the same date+period", () => {
  it("multiple desks for the same person/date/period render together in ONE compact row, not split across several", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[shift({ date: "2026-08-27", period: "day", ownDesks: ["הוגוורט", "תיעוד", "ק'"] })]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    const rows = screen.getAllByTestId("emergency-shift-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("הוגוורט, תיעוד, ק'");
  });

  it("day and night on the same date render as two separate rows under the SAME date heading", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[
          shift({ date: "2026-08-27", period: "day", ownDesks: ["הוגוורט"] }),
          shift({ date: "2026-08-27", period: "night", ownDesks: ["ק'"] }),
        ]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    const upcoming = screen.getByTestId("emergency-agenda-upcoming");
    // Exactly one date heading for 2026-08-27, even though there are two rows.
    expect(within(upcoming).getAllByText(/27 באוגוסט/)).toHaveLength(1);
    expect(within(upcoming).getAllByTestId("emergency-shift-row")).toHaveLength(2);
  });
});

describe("EmergencyPersonalScheduleList -- day/night presentation", () => {
  it("shows a clear יום indication for a day shift", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ period: "day" })]} emptyStateName={null} todayDate={TODAY} />);
    expect(screen.getByTestId("emergency-shift-period")).toHaveTextContent("יום");
  });

  it("shows a clear לילה indication for a night shift", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ period: "night" })]} emptyStateName={null} todayDate={TODAY} />);
    expect(screen.getByTestId("emergency-shift-period")).toHaveTextContent("לילה");
  });

  it("day and night rows are visually distinguishable via different soft background classes", () => {
    render(
      <EmergencyPersonalScheduleList
        shifts={[
          shift({ date: "2026-08-27", period: "day" }),
          shift({ date: "2026-08-28", period: "night" }),
        ]}
        emptyStateName={null}
        todayDate={TODAY}
      />,
    );

    const [dayRow, nightRow] = screen.getAllByTestId("emergency-shift-row");
    expect(dayRow.className).not.toBe(nightRow.className);
  });
});

describe("EmergencyPersonalScheduleList -- today is visually obvious", () => {
  it("marks today's date heading with a distinct 'היום' badge", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: TODAY })]} emptyStateName={null} todayDate={TODAY} />);
    expect(screen.getByText("היום")).toBeInTheDocument();
  });

  it("does not show a 'היום' badge on a non-today date", () => {
    render(<EmergencyPersonalScheduleList shifts={[shift({ date: "2026-08-30" })]} emptyStateName={null} todayDate={TODAY} />);
    expect(screen.queryByText("היום")).not.toBeInTheDocument();
  });
});
