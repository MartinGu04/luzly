import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { ManagerRosterSection } from "./ManagerRosterSection";
import type { ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";

afterEach(() => {
  cleanup();
});

function person(overrides: Partial<ManagerPersonSummary> = {}): ManagerPersonSummary {
  return {
    id: "p1",
    name: "בדיקה בדיקה",
    isManager: false,
    isTechnician: false,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

const CURRENT: ManagerHrefParams = { personId: null, range: "7d", month: null, problemsOnly: false };

describe("ManagerRosterSection", () => {
  it("shows an empty message for an empty roster", () => {
    render(<ManagerRosterSection roster={[]} current={CURRENT} />);
    expect(screen.getByText("אין אנשי צוות להצגה.")).toBeInTheDocument();
  });

  it("renders top-level groups קבע/סדיר/מילואים/לא מסווג with counts, only when non-empty", () => {
    const roster = [
      person({ id: "p1", name: "קבוע אחד", personnelType: "קבע" }),
      person({ id: "p2", name: "מילואימניק", personnelType: "מילואים" }),
      person({ id: "p3", name: "לא ידוע", personnelType: null }),
      person({ id: "p4", name: "סדיר טכנאי", personnelType: "חובה", isTechnician: true }),
    ];
    render(<ManagerRosterSection roster={roster} current={CURRENT} />);
    expect(screen.getByText(/קבע/)).toBeInTheDocument();
    expect(screen.getByText(/מילואים/)).toBeInTheDocument();
    expect(screen.getByText(/לא מסווג/)).toBeInTheDocument();
    expect(screen.getAllByText(/· 1/).length).toBeGreaterThan(0);
  });

  it("only סדיר subdivides into role subgroups; קבע/מילואים show people directly", () => {
    const roster = [
      person({ id: "p1", name: "קבוע אחד", personnelType: "קבע" }),
      person({ id: "p2", name: "אחמש סדיר", personnelType: "חובה", isSupervisor: true }),
    ];
    render(<ManagerRosterSection roster={roster} current={CURRENT} />);
    expect(screen.getByText(/אחמ״שים/)).toBeInTheDocument();
    expect(screen.getByText("קבוע אחד")).toBeInTheDocument();
  });

  it("a dual-role סדיר person (supervisor + technician) appears exactly once, under אחמ״שים", () => {
    const roster = [person({ id: "p1", name: "כפול תפקיד", personnelType: "חובה", isSupervisor: true, isTechnician: true })];
    render(<ManagerRosterSection roster={roster} current={CURRENT} />);
    expect(screen.getAllByText("כפול תפקיד")).toHaveLength(1);
    expect(screen.queryByText("טכנאים")).toBeNull();
  });

  it("shows capability badges reflecting real isSupervisor/isTechnician flags", () => {
    const roster = [person({ id: "p1", name: "אחמש", personnelType: "חובה", isSupervisor: true })];
    render(<ManagerRosterSection roster={roster} current={CURRENT} />);
    const link = screen.getByRole("link", { name: /אחמש/ });
    expect(within(link).getByText('אחמ"ש')).toBeInTheDocument();
  });

  it("never renders an empty subgroup or top-level group", () => {
    const roster = [person({ id: "p1", name: "קבוע בלבד", personnelType: "קבע" })];
    render(<ManagerRosterSection roster={roster} current={CURRENT} />);
    expect(screen.queryByText("סדיר")).toBeNull();
    expect(screen.queryByText("מילואים")).toBeNull();
    expect(screen.queryByText("אחרים")).toBeNull();
  });

  it("each drill-down link preserves the current range/problems URL state", () => {
    const roster = [person({ id: "p1", name: "בדיקה", personnelType: "קבע" })];
    render(
      <ManagerRosterSection
        roster={roster}
        current={{ personId: null, range: "30d", month: null, problemsOnly: true }}
      />,
    );
    const link = screen.getByRole("link", { name: /בדיקה/ });
    expect(link).toHaveAttribute("href", "/manager?person=p1&range=30d&problems=1");
  });

  it("every person appears exactly once across the whole roster, never duplicated across groups", () => {
    const roster = [
      person({ id: "p1", name: "רון קבוע", personnelType: "קבע" }),
      person({ id: "p2", name: "בר אחמש", personnelType: "חובה", isSupervisor: true }),
      person({ id: "p3", name: "גיל טכנאי", personnelType: "חובה", isTechnician: true }),
      person({ id: "p4", name: "דנה מילואים", personnelType: "מילואים" }),
    ];
    render(<ManagerRosterSection roster={roster} current={CURRENT} />);
    for (const p of roster) {
      expect(screen.getAllByText(p.name)).toHaveLength(1);
    }
  });
});
