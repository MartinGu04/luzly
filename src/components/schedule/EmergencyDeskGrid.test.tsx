import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EMERGENCY_DESK_NAMES } from "@/lib/domain/emergencyDesks";
import type { EmergencyDeskSlot } from "@/lib/readModels/emergencyScheduleTypes";
import { EmergencyDeskGrid } from "./EmergencyDeskGrid";

afterEach(() => {
  cleanup();
});

function desks(overrides: Partial<Record<string, Partial<EmergencyDeskSlot>>> = {}): EmergencyDeskSlot[] {
  return EMERGENCY_DESK_NAMES.map((desk) => ({ desk, personId: null, personName: null, ...overrides[desk] }));
}

describe("EmergencyDeskGrid", () => {
  it("renders all ten canonical desks", () => {
    render(<EmergencyDeskGrid desks={desks()} />);
    for (const desk of EMERGENCY_DESK_NAMES) {
      expect(screen.getByText(desk)).toBeInTheDocument();
    }
  });

  it("shows the assigned person's name for a staffed desk", () => {
    render(<EmergencyDeskGrid desks={desks({ [EMERGENCY_DESK_NAMES[0]]: { personId: "p1", personName: "מרטין" } })} />);
    expect(screen.getByText("מרטין")).toBeInTheDocument();
  });

  it("shows 'לא מאויש' for a genuinely blank desk, never a fabricated coverage gap message", () => {
    render(<EmergencyDeskGrid desks={desks()} />);
    expect(screen.getAllByText("לא מאויש")).toHaveLength(EMERGENCY_DESK_NAMES.length);
  });

  it("keeps an UNRESOLVED assignment's raw name visible -- never dropped, never shown as unstaffed", () => {
    render(
      <EmergencyDeskGrid
        desks={desks({ [EMERGENCY_DESK_NAMES[0]]: { personId: null, personName: "שם לא מזוהה" } })}
      />,
    );
    expect(screen.getByText("שם לא מזוהה")).toBeInTheDocument();
    expect(screen.getAllByText("לא מאויש")).toHaveLength(EMERGENCY_DESK_NAMES.length - 1);
  });
});
