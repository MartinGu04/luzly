import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { EmergencyEveryoneShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";
import { PermanentManagerEmergencyHome } from "./PermanentManagerEmergencyHome";

vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

afterEach(() => {
  cleanup();
});

function everyoneShift(overrides: Partial<EmergencyEveryoneShiftEntry> = {}): EmergencyEveryoneShiftEntry {
  return {
    date: "2026-08-26",
    period: "day",
    desks: [{ desk: "הוגוורט", personId: "p_1", personName: "דני בדיקה" }],
    ...overrides,
  };
}

describe("PermanentManagerEmergencyHome", () => {
  it("renders the personal greeting header and the department-wide desk staffing list", () => {
    render(
      <PermanentManagerEmergencyHome
        personName="דני מנהל"
        localNow={{ date: "2026-08-26", minuteOfDay: 600 }}
        fetchedAt="2026-08-26T14:05:00.000Z"
        everyoneShifts={[everyoneShift()]}
        diagnosticsCount={0}
      />,
    );

    expect(screen.getByTestId("permanent-manager-emergency-home")).toBeInTheDocument();
    expect(screen.getByTestId("emergency-everyone-schedule-list")).toBeInTheDocument();
    expect(screen.getByText("דני בדיקה")).toBeInTheDocument();
    expect(screen.getByTestId("freshness")).toHaveTextContent("2026-08-26T14:05:00.000Z");
  });

  it("shows the diagnostics note only when there are diagnostics", () => {
    const { rerender } = render(
      <PermanentManagerEmergencyHome
        personName="דני מנהל"
        localNow={{ date: "2026-08-26", minuteOfDay: 600 }}
        fetchedAt="2026-08-26T14:05:00.000Z"
        everyoneShifts={[]}
        diagnosticsCount={0}
      />,
    );
    expect(screen.queryByText(/בעיות בנתוני סידור החירום/)).toBeNull();

    rerender(
      <PermanentManagerEmergencyHome
        personName="דני מנהל"
        localNow={{ date: "2026-08-26", minuteOfDay: 600 }}
        fetchedAt="2026-08-26T14:05:00.000Z"
        everyoneShifts={[]}
        diagnosticsCount={3}
      />,
    );
    expect(screen.getByText(/3 בעיות בנתוני סידור החירום/)).toBeInTheDocument();
  });

  it("shows the empty state when there are no recorded desk shifts at all", () => {
    render(
      <PermanentManagerEmergencyHome
        personName="דני מנהל"
        localNow={{ date: "2026-08-26", minuteOfDay: 600 }}
        fetchedAt="2026-08-26T14:05:00.000Z"
        everyoneShifts={[]}
        diagnosticsCount={0}
      />,
    );
    expect(screen.getByText("אין נתוני שיבוץ חירום לתקופה זו.")).toBeInTheDocument();
  });
});
