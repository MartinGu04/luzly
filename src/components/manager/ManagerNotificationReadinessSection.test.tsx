import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { NotificationReadinessSummaryView } from "@/lib/presentation/notificationReadiness";
import { ManagerNotificationReadinessSection } from "./ManagerNotificationReadinessSection";

afterEach(() => {
  cleanup();
});

function readiness(overrides: Partial<NotificationReadinessSummaryView> = {}): NotificationReadinessSummaryView {
  return {
    summary: "2 אנשים עדיין לא יכולים לקבל התראות אישיות",
    groups: [
      { status: "missing_email", label: "חסר מייל בכ״א", personNames: ["דנה"] },
      { status: "no_push_subscription", label: "אין מכשיר רשום להתראות", personNames: ["עידו"] },
    ],
    ...overrides,
  };
}

describe("ManagerNotificationReadinessSection", () => {
  it("renders nothing when readiness is null (everyone ready, or lookup skipped/failed)", () => {
    const { container } = render(<ManagerNotificationReadinessSection readiness={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the compact summary sentence and the הצג פרטים disclosure trigger", () => {
    render(<ManagerNotificationReadinessSection readiness={readiness()} />);
    expect(screen.getByText("2 אנשים עדיין לא יכולים לקבל התראות אישיות")).toBeInTheDocument();
    expect(screen.getByText("הצג פרטים")).toBeInTheDocument();
  });

  it("group labels/names are present in the DOM (collapsed <details> content is still queryable)", () => {
    render(<ManagerNotificationReadinessSection readiness={readiness()} />);
    expect(screen.getByText("חסר מייל בכ״א")).toBeInTheDocument();
    expect(screen.getByText("דנה")).toBeInTheDocument();
    expect(screen.getByText("אין מכשיר רשום להתראות")).toBeInTheDocument();
    expect(screen.getByText("עידו")).toBeInTheDocument();
  });

  it("never renders a personId, raw status string, or other internal field", () => {
    const { container } = render(
      <ManagerNotificationReadinessSection
        readiness={readiness({ groups: [{ status: "no_push_subscription", label: "אין מכשיר רשום להתראות", personNames: ["מאיה"] }] })}
      />,
    );
    expect(container.textContent).not.toContain("no_push_subscription");
  });
});
