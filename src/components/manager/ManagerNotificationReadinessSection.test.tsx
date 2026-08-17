import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { NotificationReadinessSectionView } from "@/lib/presentation/notificationReadiness";
import { ManagerNotificationReadinessSection } from "./ManagerNotificationReadinessSection";

afterEach(() => {
  cleanup();
});

function blockersView(): NotificationReadinessSectionView {
  return {
    kind: "blockers",
    summary: "2 אנשים עדיין לא יכולים לקבל התראות אישיות",
    groups: [
      { status: "missing_email", label: "חסר מייל בכ״א", personNames: ["דנה"] },
      { status: "no_push_subscription", label: "אין מכשיר רשום להתראות", personNames: ["עידו"] },
    ],
  };
}

describe("ManagerNotificationReadinessSection — three distinct states", () => {
  it("hidden: renders nothing (lookup skipped, or everyone ready)", () => {
    const { container } = render(<ManagerNotificationReadinessSection readiness={{ kind: "hidden" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("unavailable: renders the small neutral status line, distinct from hidden", () => {
    render(<ManagerNotificationReadinessSection readiness={{ kind: "unavailable" }} />);
    expect(screen.getByText("לא ניתן לבדוק כרגע את מצב ההתראות")).toBeInTheDocument();
  });

  it("unavailable: never mentions blockers/details, never shows a raw error or technical detail", () => {
    const { container } = render(<ManagerNotificationReadinessSection readiness={{ kind: "unavailable" }} />);
    expect(screen.queryByText("הצג פרטים")).toBeNull();
    expect(container.textContent).not.toMatch(/error|Error|Supabase|exception/);
  });

  it("blockers: shows the compact summary and the הצג פרטים disclosure trigger", () => {
    render(<ManagerNotificationReadinessSection readiness={blockersView()} />);
    expect(screen.getByText("2 אנשים עדיין לא יכולים לקבל התראות אישיות")).toBeInTheDocument();
    expect(screen.getByText("הצג פרטים")).toBeInTheDocument();
  });
});

describe("ManagerNotificationReadinessSection — blockers content", () => {
  it("group labels/names are present in the DOM (collapsed <details> content is still queryable)", () => {
    render(<ManagerNotificationReadinessSection readiness={blockersView()} />);
    expect(screen.getByText("חסר מייל בכ״א")).toBeInTheDocument();
    expect(screen.getByText("דנה")).toBeInTheDocument();
    expect(screen.getByText("אין מכשיר רשום להתראות")).toBeInTheDocument();
    expect(screen.getByText("עידו")).toBeInTheDocument();
  });

  it("never renders a personId, raw status string, or other internal field", () => {
    const { container } = render(
      <ManagerNotificationReadinessSection
        readiness={{
          kind: "blockers",
          summary: "אדם אחד עדיין לא יכול לקבל התראות אישיות",
          groups: [{ status: "no_push_subscription", label: "אין מכשיר רשום להתראות", personNames: ["מאיה"] }],
        }}
      />,
    );
    expect(container.textContent).not.toContain("no_push_subscription");
  });
});
