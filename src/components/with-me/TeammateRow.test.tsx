import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalCounterpart } from "@/lib/readModels/types";
import { TeammateRow } from "./TeammateRow";

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

describe("TeammateRow", () => {
  it("shows the person's name and role", () => {
    render(<TeammateRow counterpart={counterpart()} />);
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש')).toBeInTheDocument();
  });

  it("never shows the personId visibly", () => {
    const { container } = render(<TeammateRow counterpart={counterpart({ personId: "p_secret_id" })} />);
    expect(container.textContent).not.toContain("p_secret_id");
  });

  it("shows the shadow/handover badge only when marked shadow", () => {
    const { rerender } = render(<TeammateRow counterpart={counterpart()} shadow />);
    expect(screen.getByText("חפיפה / צל")).toBeInTheDocument();
    rerender(<TeammateRow counterpart={counterpart()} shadow={false} />);
    expect(screen.queryByText("חפיפה / צל")).toBeNull();
  });

  it("shows a tentative badge for a tentative counterpart, never hiding them", () => {
    render(<TeammateRow counterpart={counterpart({ certainty: "tentative" })} />);
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
    expect(screen.getByText("משוער")).toBeInTheDocument();
  });

  it("never shows a tentative badge for a confirmed counterpart", () => {
    render(<TeammateRow counterpart={counterpart({ certainty: "confirmed" })} />);
    expect(screen.queryByText("משוער")).toBeNull();
  });

  it("never displays startTimeOverride/endTimeOverride hours", () => {
    const { container } = render(
      <TeammateRow counterpart={counterpart({ startTimeOverride: "08:00", endTimeOverride: "16:00" })} />,
    );
    expect(container.textContent).not.toContain("08:00");
    expect(container.textContent).not.toContain("16:00");
  });

  it("never leaks an email or other private colleague fields", () => {
    const { container } = render(<TeammateRow counterpart={counterpart()} />);
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("isManager");
    expect(container.textContent).not.toContain("personnelType");
  });
});
