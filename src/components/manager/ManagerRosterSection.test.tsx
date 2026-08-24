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

const CURRENT: ManagerHrefParams = { personId: null, range: "7d", month: null, category: "overview" };
const NO_AVATAR = { managerId: "not-in-this-roster", managerAvatarUrl: null, rosterAvatarByPersonId: new Map() };

describe("ManagerRosterSection", () => {
  it("shows an empty message for an empty roster", () => {
    render(<ManagerRosterSection roster={[]} current={CURRENT} {...NO_AVATAR} />);
    expect(screen.getByText("אין אנשי צוות להצגה.")).toBeInTheDocument();
  });

  it("renders top-level groups קבע/סדיר/מילואים/לא מסווג with counts, only when non-empty", () => {
    const roster = [
      person({ id: "p1", name: "קבוע אחד", personnelType: "קבע" }),
      person({ id: "p2", name: "מילואימניק", personnelType: "מילואים" }),
      person({ id: "p3", name: "לא ידוע", personnelType: null }),
      person({ id: "p4", name: "סדיר טכנאי", personnelType: "חובה", isTechnician: true }),
    ];
    render(<ManagerRosterSection roster={roster} current={CURRENT} {...NO_AVATAR} />);
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
    render(<ManagerRosterSection roster={roster} current={CURRENT} {...NO_AVATAR} />);
    expect(screen.getByText(/אחמ״שים/)).toBeInTheDocument();
    expect(screen.getByText("קבוע אחד")).toBeInTheDocument();
  });

  it("a dual-role סדיר person (supervisor + technician) appears exactly once, under אחמ״שים", () => {
    const roster = [person({ id: "p1", name: "כפול תפקיד", personnelType: "חובה", isSupervisor: true, isTechnician: true })];
    render(<ManagerRosterSection roster={roster} current={CURRENT} {...NO_AVATAR} />);
    expect(screen.getAllByText("כפול תפקיד")).toHaveLength(1);
    expect(screen.queryByText("טכנאים")).toBeNull();
  });

  it("shows capability badges reflecting real isSupervisor/isTechnician flags", () => {
    const roster = [person({ id: "p1", name: "אחמש", personnelType: "חובה", isSupervisor: true })];
    render(<ManagerRosterSection roster={roster} current={CURRENT} {...NO_AVATAR} />);
    const link = screen.getByRole("link", { name: /אחמש/ });
    expect(within(link).getByText('אחמ"ש')).toBeInTheDocument();
  });

  it("never renders an empty subgroup or top-level group", () => {
    const roster = [person({ id: "p1", name: "קבוע בלבד", personnelType: "קבע" })];
    render(<ManagerRosterSection roster={roster} current={CURRENT} {...NO_AVATAR} />);
    expect(screen.queryByText("סדיר")).toBeNull();
    expect(screen.queryByText("מילואים")).toBeNull();
    expect(screen.queryByText("אחרים")).toBeNull();
  });

  it("each drill-down link preserves the current range/category URL state", () => {
    const roster = [person({ id: "p1", name: "בדיקה", personnelType: "קבע" })];
    render(
      <ManagerRosterSection
        roster={roster}
        current={{ personId: null, range: "30d", month: null, category: "shifts" }}
        {...NO_AVATAR}
      />,
    );
    const link = screen.getByRole("link", { name: /בדיקה/ });
    expect(link).toHaveAttribute("href", "/manager?person=p1&range=30d&category=shifts");
  });

  it("shows a real photo only for the manager's own row, initials for everyone else", () => {
    const roster = [
      person({ id: "p1", name: "המנהל עצמו", personnelType: "קבע" }),
      person({ id: "p2", name: "עוד מישהו", personnelType: "קבע" }),
    ];
    const { container } = render(
      <ManagerRosterSection
        roster={roster}
        current={CURRENT}
        managerId="p1"
        managerAvatarUrl="https://example.invalid/photo.jpg"
        rosterAvatarByPersonId={new Map()}
      />,
    );
    const photos = container.querySelectorAll('img[data-testid="avatar-photo"]');
    expect(photos).toHaveLength(1);
    expect(photos[0].closest("a")).toHaveAttribute("href", expect.stringContaining("person=p1"));
  });

  it("no manager avatarUrl at all -- every row falls back to initials, never a broken image", () => {
    const roster = [person({ id: "p1", name: "המנהל עצמו", personnelType: "קבע" })];
    const { container } = render(
      <ManagerRosterSection
        roster={roster}
        current={CURRENT}
        managerId="p1"
        managerAvatarUrl={null}
        rosterAvatarByPersonId={new Map()}
      />,
    );
    expect(container.querySelectorAll('img[data-testid="avatar-photo"]')).toHaveLength(0);
  });

  it("shows a real photo for a non-manager roster member mapped to a Google account with a photo", () => {
    const roster = [
      person({ id: "p1", name: "מנהל", personnelType: "קבע" }),
      person({ id: "p2", name: "עובד עם תמונה", personnelType: "קבע" }),
    ];
    const { container } = render(
      <ManagerRosterSection
        roster={roster}
        current={CURRENT}
        managerId="p1"
        managerAvatarUrl={null}
        rosterAvatarByPersonId={new Map([["p2", "https://example.invalid/p2.jpg"]])}
      />,
    );
    const photos = container.querySelectorAll('img[data-testid="avatar-photo"]');
    expect(photos).toHaveLength(1);
    expect(photos[0].closest("a")).toHaveAttribute("href", expect.stringContaining("person=p2"));
  });

  it("a roster member with no entry in rosterAvatarByPersonId (unmapped/no account/no photo) falls back to initials", () => {
    const roster = [person({ id: "p1", name: "מנהל", personnelType: "קבע" }), person({ id: "p2", name: "ללא תמונה", personnelType: "קבע" })];
    const { container } = render(
      <ManagerRosterSection
        roster={roster}
        current={CURRENT}
        managerId="p1"
        managerAvatarUrl={null}
        rosterAvatarByPersonId={new Map([["p3", "https://example.invalid/someone-else.jpg"]])}
      />,
    );
    expect(container.querySelectorAll('img[data-testid="avatar-photo"]')).toHaveLength(0);
  });

  it("rosterAvatarByPersonId takes precedence over managerAvatarUrl for the manager's own row when both are present", () => {
    const roster = [person({ id: "p1", name: "מנהל", personnelType: "קבע" })];
    const { container } = render(
      <ManagerRosterSection
        roster={roster}
        current={CURRENT}
        managerId="p1"
        managerAvatarUrl="https://example.invalid/stale-manager-photo.jpg"
        rosterAvatarByPersonId={new Map([["p1", "https://example.invalid/fresh-lookup-photo.jpg"]])}
      />,
    );
    const photo = container.querySelector('img[data-testid="avatar-photo"]');
    expect(photo).toHaveAttribute("src", "https://example.invalid/fresh-lookup-photo.jpg");
  });

  it("falls back to managerAvatarUrl for the manager's own row when rosterAvatarByPersonId has no entry for them", () => {
    const roster = [person({ id: "p1", name: "מנהל", personnelType: "קבע" })];
    const { container } = render(
      <ManagerRosterSection
        roster={roster}
        current={CURRENT}
        managerId="p1"
        managerAvatarUrl="https://example.invalid/manager-photo.jpg"
        rosterAvatarByPersonId={new Map()}
      />,
    );
    const photo = container.querySelector('img[data-testid="avatar-photo"]');
    expect(photo).toHaveAttribute("src", "https://example.invalid/manager-photo.jpg");
  });

  it("every person appears exactly once across the whole roster, never duplicated across groups", () => {
    const roster = [
      person({ id: "p1", name: "רון קבוע", personnelType: "קבע" }),
      person({ id: "p2", name: "בר אחמש", personnelType: "חובה", isSupervisor: true }),
      person({ id: "p3", name: "גיל טכנאי", personnelType: "חובה", isTechnician: true }),
      person({ id: "p4", name: "דנה מילואים", personnelType: "מילואים" }),
    ];
    render(<ManagerRosterSection roster={roster} current={CURRENT} {...NO_AVATAR} />);
    for (const p of roster) {
      expect(screen.getAllByText(p.name)).toHaveLength(1);
    }
  });
});
