import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ManagerAdoptionSectionView } from "@/lib/presentation/managerAdoption";
import { ManagerAdoptionSummary } from "./ManagerAdoptionSummary";

afterEach(() => {
  cleanup();
});

function availableView(overrides: Partial<Extract<ManagerAdoptionSectionView, { kind: "available" }>> = {}): ManagerAdoptionSectionView {
  return {
    kind: "available",
    headline: "3 מתוך 4 כבר נכנסו למערכת",
    stats: [
      { label: "סה״כ אנשי צוות", value: 4 },
      { label: "נכנסו למערכת", value: 3 },
      { label: "טרם נכנסו", value: 1 },
      { label: "מוכנים לקבל התראות", value: 2 },
      { label: "נכנסו, התראות לא פעילות", value: 1 },
      { label: "בעיית נתונים בכ״א", value: 0 },
    ],
    notLoggedInGroup: { label: "טרם נכנסו למערכת", people: [] },
    notificationsOffGroup: { label: "נכנסו למערכת אך לא הפעילו התראות", people: [] },
    readyGroup: { label: "מוכנים לקבל התראות", people: [] },
    dataIssueGroup: { label: "בעיית נתונים בכ״א", people: [] },
    ...overrides,
  };
}

describe("ManagerAdoptionSummary — three distinct states", () => {
  it("hidden: renders nothing", () => {
    const { container } = render(<ManagerAdoptionSummary view={{ kind: "hidden" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("unavailable: renders the small neutral status line, distinct from hidden", () => {
    render(<ManagerAdoptionSummary view={{ kind: "unavailable" }} />);
    expect(screen.getByText("לא ניתן לבדוק כרגע את מצב ההתחברויות וההתראות")).toBeInTheDocument();
  });

  it("available: renders even when every count is calm (unlike the old inline aside, this category never hides on an all-ready roster)", () => {
    render(<ManagerAdoptionSummary view={availableView({ headline: "4 מתוך 4 כבר נכנסו למערכת" })} />);
    expect(screen.getByText("4 מתוך 4 כבר נכנסו למערכת")).toBeInTheDocument();
  });
});

describe("ManagerAdoptionSummary — stats", () => {
  it("renders the headline and every stat label/value", () => {
    render(<ManagerAdoptionSummary view={availableView()} />);
    expect(screen.getByText("3 מתוך 4 כבר נכנסו למערכת")).toBeInTheDocument();
    expect(screen.getByText("סה״כ אנשי צוות")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("טרם נכנסו")).toBeInTheDocument();
    expect(screen.getByText("בעיית נתונים בכ״א")).toBeInTheDocument();
  });

  it("never renders a raw status string or internal field", () => {
    const { container } = render(<ManagerAdoptionSummary view={availableView()} />);
    expect(container.textContent).not.toMatch(/logged_in|not_enabled|ready|missing_email/);
  });
});
