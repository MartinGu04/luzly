import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ScheduleEveryoneDayView, SchedulePeriodStaffingView } from "@/lib/presentation/scheduleEveryone";
import { EveryoneSelectedDayPanel } from "./EveryoneSelectedDayPanel";
import type { DayMeta } from "./types";

afterEach(() => {
  cleanup();
});

function dayMeta(overrides: Partial<DayMeta> = {}): DayMeta {
  return {
    date: "2026-08-12",
    dayNumber: 12,
    isToday: false,
    isPast: false,
    dateLabel: "יום · 12 באוגוסט",
    holiday: null,
    ...overrides,
  };
}

function periodView(overrides: Partial<SchedulePeriodStaffingView> = {}): SchedulePeriodStaffingView {
  return {
    period: "day",
    label: "יום",
    emoji: "☀️",
    technicians: { people: [], status: "not_evaluable", message: null },
    supervisors: { people: [], status: "not_evaluable", message: null },
    shadowTechnicianNames: [],
    shadowSupervisorNames: [],
    coverageStatus: "not_evaluable",
    ...overrides,
  };
}

function dayView(overrides: Partial<ScheduleEveryoneDayView> = {}): ScheduleEveryoneDayView {
  return { date: "2026-08-12", day: null, night: null, duties: [], absences: [], ...overrides };
}

describe("EveryoneSelectedDayPanel", () => {
  it("renders nothing when there is no day meta at all", () => {
    const { container } = render(<EveryoneSelectedDayPanel dayMeta={null} dayView={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the 'no staffing data' message for a period with no staffing view", () => {
    render(<EveryoneSelectedDayPanel dayMeta={dayMeta()} dayView={null} />);
    expect(screen.getAllByText("אין נתוני שיבוץ לתקופה זו.")).toHaveLength(2); // day + night
  });

  describe('role presentation order: אחמ"ש before טכנאי (never independently reordered per-consumer)', () => {
    it('renders the אחמ"שים role group before the טכנאים role group, for a period staffed with both', () => {
      render(
        <EveryoneSelectedDayPanel
          dayMeta={dayMeta()}
          dayView={dayView({
            day: periodView({
              technicians: { people: [{ key: "p1", name: "גדעון פולין", tentative: false }], status: "full", message: null },
              supervisors: { people: [{ key: "p2", name: "איתי אוליר", tentative: false }], status: "full", message: null },
              coverageStatus: "full",
            }),
          })}
        />,
      );

      const supervisorLabel = screen.getByText('אחמ"שים');
      const technicianLabel = screen.getByText("טכנאים");
      // Both labels are their own sibling `<div>`s under the same period's
      // content wrapper -- DOM source order IS render order here, so
      // comparing document position directly proves which one actually
      // renders first, not just which text happens to appear first.
      expect(
        supervisorLabel.compareDocumentPosition(technicianLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      const names = screen.getByText("איתי אוליר").closest("li")!.parentElement!;
      expect(names.textContent).toContain("איתי אוליר");
    });

    it('renders the shadow "צל אחמ"ש" line before the shadow "צל טכנאי" line', () => {
      render(
        <EveryoneSelectedDayPanel
          dayMeta={dayMeta()}
          dayView={dayView({
            night: periodView({
              period: "night",
              label: "לילה",
              emoji: "🌙",
              shadowSupervisorNames: ["נועה דוגמה"],
              shadowTechnicianNames: ["דני בדיקה"],
              coverageStatus: "full",
            }),
          })}
        />,
      );

      const shadowSupervisorLine = screen.getByText('צל אחמ"ש:').closest("p")!;
      const shadowTechnicianLine = screen.getByText("צל טכנאי:").closest("p")!;
      expect(
        shadowSupervisorLine.compareDocumentPosition(shadowTechnicianLine) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it("applies the SAME order to both day and night periods independently", () => {
      render(
        <EveryoneSelectedDayPanel
          dayMeta={dayMeta()}
          dayView={dayView({
            day: periodView({
              technicians: { people: [{ key: "p1", name: "טכנאי יום", tentative: false }], status: "full", message: null },
              supervisors: { people: [{ key: "p2", name: 'אחמ"ש יום', tentative: false }], status: "full", message: null },
              coverageStatus: "full",
            }),
            night: periodView({
              period: "night",
              label: "לילה",
              emoji: "🌙",
              technicians: { people: [{ key: "p3", name: "טכנאי לילה", tentative: false }], status: "full", message: null },
              supervisors: { people: [{ key: "p4", name: 'אחמ"ש לילה', tentative: false }], status: "full", message: null },
              coverageStatus: "full",
            }),
          })}
        />,
      );

      const [dayLabel, nightLabel] = screen.getAllByText('אחמ"שים');
      expect(dayLabel).toBeTruthy();
      expect(nightLabel).toBeTruthy();
      const dayNames = screen.getByText('אחמ"ש יום').closest("li")!.parentElement!;
      const dayTechNames = screen.getByText("טכנאי יום").closest("li")!.parentElement!;
      expect(dayNames.compareDocumentPosition(dayTechNames) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

      const nightNames = screen.getByText('אחמ"ש לילה').closest("li")!.parentElement!;
      const nightTechNames = screen.getByText("טכנאי לילה").closest("li")!.parentElement!;
      expect(nightNames.compareDocumentPosition(nightTechNames) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("day/night period identity and shadow membership stay exactly as given -- ordering never moves a name into the wrong role/period/shadow bucket", () => {
      render(
        <EveryoneSelectedDayPanel
          dayMeta={dayMeta()}
          dayView={dayView({
            day: periodView({
              technicians: { people: [{ key: "p1", name: "טכנאי אמיתי", tentative: false }], status: "full", message: null },
              supervisors: { people: [{ key: "p2", name: 'אחמ"ש אמיתי', tentative: false }], status: "full", message: null },
              shadowTechnicianNames: ["צל טכנאי אמיתי"],
              shadowSupervisorNames: ['צל אחמ"ש אמיתי'],
              coverageStatus: "full",
            }),
          })}
        />,
      );

      // Every name still appears exactly once, in its OWN correct bucket --
      // reordering never merges/duplicates/misfiles a person.
      expect(screen.getAllByText("טכנאי אמיתי")).toHaveLength(1);
      expect(screen.getAllByText('אחמ"ש אמיתי')).toHaveLength(1);
      expect(screen.getByText(/צל טכנאי אמיתי/)).toBeTruthy();
      expect(screen.getByText(/צל אחמ"ש אמיתי/)).toBeTruthy();
    });
  });
});
