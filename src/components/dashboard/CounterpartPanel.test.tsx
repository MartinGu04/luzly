import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalCounterpart, PersonalShiftContext } from "@/lib/readModels/types";
import { CounterpartPanel } from "./CounterpartPanel";

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

function context(overrides: Partial<PersonalShiftContext> = {}): PersonalShiftContext {
  return {
    date: "2026-08-12",
    period: "day",
    role: "technician",
    coverageStatus: "full",
    missingIntervals: [],
    primaryCounterparts: [],
    shadowCounterparts: [],
    ...overrides,
  };
}

describe("CounterpartPanel", () => {
  it("21. primary counterparts render", () => {
    render(<CounterpartPanel context={context({ primaryCounterparts: [counterpart()] })} />);
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
  });

  it("22. shadow counterparts render distinctly from primary counterparts", () => {
    render(
      <CounterpartPanel
        context={context({
          primaryCounterparts: [counterpart({ personName: "נועה דוגמה" })],
          shadowCounterparts: [counterpart({ personId: "p_3", personName: "משה כהן", shadow: true })],
        })}
      />,
    );
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
    expect(screen.getByText("משה כהן")).toBeInTheDocument();
    expect(screen.getByText("חפיפה / צל")).toBeInTheDocument();
  });

  it("23. missing coverage renders a clear critical context", () => {
    const { container } = render(<CounterpartPanel context={context({ coverageStatus: "missing" })} />);
    expect(screen.getByText("אין כיסוי")).toBeInTheDocument();
    expect(container.querySelector(".text-critical")).not.toBeNull();
  });

  it("24. full coverage renders a quiet, calm success context", () => {
    const { container } = render(<CounterpartPanel context={context({ coverageStatus: "full" })} />);
    expect(screen.getByText("הכיסוי מלא")).toBeInTheDocument();
    expect(container.querySelector(".text-success")).not.toBeNull();
    expect(container.querySelector(".animate-issue-pulse")).toBeNull();
  });

  it("partial coverage renders a noticeable amber context", () => {
    const { container } = render(<CounterpartPanel context={context({ coverageStatus: "partial" })} />);
    expect(screen.getByText("הכיסוי חלקי")).toBeInTheDocument();
    expect(container.querySelector(".text-warning")).not.toBeNull();
  });

  it("not_evaluable coverage renders neutral copy, not an alarm", () => {
    const { container } = render(<CounterpartPanel context={context({ coverageStatus: "not_evaluable" })} />);
    expect(screen.getByText("לא ניתן להעריך כיסוי")).toBeInTheDocument();
    expect(container.querySelector(".text-critical")).toBeNull();
    expect(container.querySelector(".text-warning")).toBeNull();
  });

  it("25. no colleague private fields (email/manager/capability) ever appear in rendered output", () => {
    const { container } = render(
      <CounterpartPanel context={context({ primaryCounterparts: [counterpart()] })} />,
    );
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("isManager");
    expect(container.textContent).not.toContain("isSupervisor");
    expect(container.textContent).not.toContain("isTechnician");
    expect(container.textContent).not.toContain("personnelType");
  });

  it("shows a calm message when there are no counterparts at all", () => {
    render(<CounterpartPanel context={context()} />);
    expect(screen.getByText("אין מידע על אנשים נוספים במשמרת זו.")).toBeInTheDocument();
  });
});
