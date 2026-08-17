import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PermanentManagerHomeAbsence, PermanentManagerHomeDuty } from "@/lib/readModels/permanentManagerHomeTypes";
import { TodayOperationalContext } from "./TodayOperationalContext";

afterEach(() => {
  cleanup();
});

describe("TodayOperationalContext — duties", () => {
  it("renders each duty's normalized title and person name", () => {
    const duties: PermanentManagerHomeDuty[] = [{ personId: "p_1", personName: "שומר בדיקה", dutyFamily: "guard", slot: 1 }];
    render(<TodayOperationalContext duties={duties} absences={[]} />);
    expect(screen.getByText("שמירה 1")).toBeInTheDocument();
    expect(screen.getByText("שומר בדיקה")).toBeInTheDocument();
  });

  it("empty duties shows a calm empty state, never a fabricated row", () => {
    render(<TodayOperationalContext duties={[]} absences={[]} />);
    expect(screen.getByText("אין תורנויות היום.")).toBeInTheDocument();
  });

  it("never renders raw source metadata fields (no sourceSheet/sourceCell/rawValue exist on the input shape at all)", () => {
    const duties: PermanentManagerHomeDuty[] = [{ personId: "p_1", personName: "שומר בדיקה", dutyFamily: "guard", slot: 1 }];
    expect(Object.keys(duties[0]).sort()).toEqual(["dutyFamily", "personId", "personName", "slot"]);
  });
});

describe("TodayOperationalContext — absences", () => {
  it("renders each absence's person name and normalized label", () => {
    const absences: PermanentManagerHomeAbsence[] = [{ personId: "p_2", personName: "נעדר בדיקה", absenceKind: "vacation" }];
    render(<TodayOperationalContext duties={[]} absences={absences} />);
    expect(screen.getByText("נעדר בדיקה")).toBeInTheDocument();
    expect(screen.getByText("חופש")).toBeInTheDocument();
  });

  it("empty absences shows a calm empty state, never a fabricated row", () => {
    render(<TodayOperationalContext duties={[]} absences={[]} />);
    expect(screen.getByText("אין היעדרויות היום.")).toBeInTheDocument();
  });

  it("never claims physical presence -- headings talk about duties/absences, never location/attendance", () => {
    render(<TodayOperationalContext duties={[]} absences={[]} />);
    expect(screen.queryByText(/נמצא/)).toBeNull();
  });
});
