import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ManagerAdoptionSectionView } from "@/lib/presentation/managerAdoption";
import { ManagerAdoptionSection } from "./ManagerAdoptionSection";

afterEach(() => {
  cleanup();
});

function availableView(overrides: Partial<Extract<ManagerAdoptionSectionView, { kind: "available" }>> = {}): ManagerAdoptionSectionView {
  return {
    kind: "available",
    headline: "0 מתוך 0 כבר נכנסו למערכת",
    stats: [],
    notLoggedInGroup: { label: "טרם נכנסו למערכת", people: [] },
    notificationsOffGroup: { label: "נכנסו למערכת אך לא הפעילו התראות", people: [] },
    readyGroup: { label: "מוכנים לקבל התראות", people: [] },
    dataIssueGroup: { label: "בעיית נתונים בכ״א", people: [] },
    ...overrides,
  };
}

describe("ManagerAdoptionSection — three distinct states", () => {
  it("hidden: renders nothing (lookup skipped)", () => {
    const { container } = render(<ManagerAdoptionSection view={{ kind: "hidden" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("unavailable: renders nothing here -- the neutral notice lives in ManagerAdoptionSummary, never duplicated", () => {
    const { container } = render(<ManagerAdoptionSection view={{ kind: "unavailable" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("available with an empty roster: shows the calm empty state", () => {
    render(<ManagerAdoptionSection view={availableView()} />);
    expect(screen.getByText("אין אנשי צוות להצגה.")).toBeInTheDocument();
  });
});

describe("ManagerAdoptionSection — nudge groups (always visible, never behind a click)", () => {
  it("shows טרם נכנסו למערכת with names, not collapsed", () => {
    render(
      <ManagerAdoptionSection
        view={availableView({
          notLoggedInGroup: {
            label: "טרם נכנסו למערכת",
            people: [{ personId: "p1", personName: "דנה", avatarUrl: null, issueLabel: null }],
          },
        })}
      />,
    );
    expect(screen.getByText("טרם נכנסו למערכת")).toBeInTheDocument();
    expect(screen.getByText("דנה")).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("shows נכנסו אך לא הפעילו התראות with names, not collapsed", () => {
    render(
      <ManagerAdoptionSection
        view={availableView({
          notificationsOffGroup: {
            label: "נכנסו למערכת אך לא הפעילו התראות",
            people: [{ personId: "p2", personName: "עידו", avatarUrl: null, issueLabel: null }],
          },
        })}
      />,
    );
    expect(screen.getByText("נכנסו למערכת אך לא הפעילו התראות")).toBeInTheDocument();
    expect(screen.getByText("עידו")).toBeInTheDocument();
  });

  it("omits a nudge group entirely when it has zero people, rather than rendering an empty heading", () => {
    render(<ManagerAdoptionSection view={availableView()} />);
    expect(screen.queryByText("טרם נכנסו למערכת")).toBeNull();
    expect(screen.queryByText("נכנסו למערכת אך לא הפעילו התראות")).toBeNull();
  });
});

describe("ManagerAdoptionSection — quiet groups (collapsed by default)", () => {
  it("מוכנים לקבל התראות renders behind a <details> disclosure, not expanded noise", () => {
    render(
      <ManagerAdoptionSection
        view={availableView({
          readyGroup: {
            label: "מוכנים לקבל התראות",
            people: [{ personId: "p3", personName: "רון", avatarUrl: null, issueLabel: null }],
          },
        })}
      />,
    );
    const summary = screen.getByText("מוכנים לקבל התראות");
    expect(summary.closest("details")).not.toBeNull();
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("רון")).toBeInTheDocument();
  });

  it("בעיית נתונים בכ״א renders behind a disclosure too, with each person's specific issue label", () => {
    render(
      <ManagerAdoptionSection
        view={availableView({
          dataIssueGroup: {
            label: "בעיית נתונים בכ״א",
            people: [{ personId: "p4", personName: "מאיה", avatarUrl: null, issueLabel: "חסר מייל בכ״א" }],
          },
        })}
      />,
    );
    expect(screen.getByText("בעיית נתונים בכ״א")).toBeInTheDocument();
    expect(screen.getByText("מאיה")).toBeInTheDocument();
    expect(screen.getByText("חסר מייל בכ״א")).toBeInTheDocument();
  });
});

describe("ManagerAdoptionSection — privacy", () => {
  it("never renders a personId, raw status string, or other internal field", () => {
    const { container } = render(
      <ManagerAdoptionSection
        view={availableView({
          notLoggedInGroup: {
            label: "טרם נכנסו למערכת",
            people: [{ personId: "p-secret-id", personName: "דנה", avatarUrl: null, issueLabel: null }],
          },
        })}
      />,
    );
    expect(container.textContent).not.toContain("p-secret-id");
    expect(container.textContent).not.toMatch(/not_logged_in|logged_in|missing_email/);
  });
});
