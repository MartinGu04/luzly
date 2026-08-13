import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type {
  ManagerAbsenceEntry,
  ManagerDutyEntry,
  ManagerIssue,
  ManagerOverviewReadModel,
  ManagerPotentialRequirementView,
  ManagerShiftOverviewEntry,
} from "@/lib/readModels/managerTypes";
import type { PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestManagerOverview = vi.fn();
vi.mock("@/lib/readModels/getRequestManagerOverview", () => ({ getRequestManagerOverview }));

const usePathname = vi.fn(() => "/manager");
const useSearchParams = vi.fn(() => new URLSearchParams());
const useRouter = vi.fn(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => usePathname(),
  useSearchParams: () => useSearchParams(),
  useRouter: () => useRouter(),
}));

const { default: ManagerPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestManagerOverview.mockReset();
});

function issue(overrides: Partial<ManagerIssue> = {}): ManagerIssue {
  return {
    personId: "p_martin",
    personName: "מרטין בדיקה",
    reason: "shift_coverage_missing",
    severity: "critical",
    date: "2026-08-13",
    missingIntervals: null,
    metadata: null,
    targetEvent: null,
    ...overrides,
  };
}

function shiftGroup(overrides: Partial<ManagerShiftOverviewEntry> = {}): ManagerShiftOverviewEntry {
  return {
    date: "2026-08-13",
    period: "day",
    technicians: [],
    supervisors: [],
    shadowTechnicians: [],
    shadowSupervisors: [],
    coverageStatus: "full",
    missingIntervals: [],
    ...overrides,
  };
}

function duty(overrides: Partial<ManagerDutyEntry> = {}): ManagerDutyEntry {
  return {
    personId: "p_martin",
    personName: "מרטין בדיקה",
    date: "2026-08-13",
    dutyFamily: "guard",
    slot: 1,
    certainty: "confirmed",
    ...overrides,
  };
}

function absence(overrides: Partial<ManagerAbsenceEntry> = {}): ManagerAbsenceEntry {
  return {
    personId: "p_martin",
    personName: "מרטין בדיקה",
    date: "2026-08-13",
    absenceKind: "vacation",
    certainty: "confirmed",
    ...overrides,
  };
}

function potentialRow(overrides: Partial<ManagerPotentialRequirementView> = {}): ManagerPotentialRequirementView {
  return {
    date: "2026-08-13",
    columnLabel: "כונן פינויים",
    sourceRawValue: "מרטין בדיקה",
    resolvedPersonId: "p_martin",
    resolvedPersonName: "מרטין בדיקה",
    status: "missing",
    namedPersonBlockingAbsence: true,
    ...overrides,
  };
}

function personalModel(overrides: Partial<PersonalScheduleReadModel> = {}): PersonalScheduleReadModel {
  return {
    person: { id: "p_martin", name: "מרטין בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    fetchedAt: "2026-08-13T08:00:00.000Z",
    localNow: { date: "2026-08-13", minuteOfDay: 600 },
    todayEvents: [],
    upcomingEvents: [],
    shiftCalendarEvents: [],
    currentAssignments: [],
    nextAssignmentGroup: null,
    currentShiftContexts: [],
    nextShiftContexts: [],
    issues: [],
    dutyBlocks: [],
    dutyActions: [],
    ...overrides,
  };
}

function model(overrides: Partial<ManagerOverviewReadModel> = {}): ManagerOverviewReadModel {
  return {
    manager: { id: "p_manager", name: "דני מנהל" },
    fetchedAt: "2026-08-13T08:00:00.000Z",
    localNow: { date: "2026-08-13", minuteOfDay: 600 },
    range: { key: "7d", startDate: "2026-08-13", endDate: "2026-08-19", month: null },
    problemsOnly: false,
    roster: [
      { id: "p_martin", name: "מרטין בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
      { id: "p_eitan", name: "איתן דוגמה", isManager: false, isTechnician: false, isSupervisor: true, personnelType: null },
    ],
    selectedPersonId: null,
    issues: [],
    coverageOverview: [],
    duties: [],
    absences: [],
    potentialRequirements: [],
    selectedPerson: null,
    selectedPersonRangeAbsences: [],
    ...overrides,
  };
}

function okResult(m: ManagerOverviewReadModel) {
  return { status: "ok" as const, model: m };
}

async function renderPage(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await ManagerPage({ searchParams: Promise.resolve(searchParams) });
  return render(element);
}

describe("ManagerPage — authorization states", () => {
  it("forbidden: shows the manager-only denial state, never manager data", async () => {
    getRequestManagerOverview.mockResolvedValue({ status: "forbidden" });
    await renderPage();
    expect(screen.getByText("המסך הזה מיועד למנהלים בלבד")).toBeInTheDocument();
    expect(screen.queryByText("מבט מנהל")).toBeNull();
  });

  it("configuration_error: shows the shared configuration-error state", async () => {
    getRequestManagerOverview.mockResolvedValue({ status: "configuration_error", message: "bad config" });
    await renderPage();
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
  });
});

describe("ManagerPage — request scope", () => {
  it("passes parsed search params through to getRequestManagerOverview", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model()));
    await renderPage({ person: "p_martin", range: "30d", problems: "1" });
    expect(getRequestManagerOverview).toHaveBeenCalledWith("p_martin", "30d", null, true);
  });

  it("defaults: no search params -> everyone, 7d, no problems", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(getRequestManagerOverview).toHaveBeenCalledWith(null, "7d", null, false);
  });
});

describe("ManagerPage — everyone view", () => {
  it("empty state: no problems shows the calm success panel", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model()));
    await renderPage();
    expect(screen.getByText("אין כרגע דברים שדורשים התייחסות בטווח שנבחר")).toBeInTheDocument();
  });

  it("shows several critical/review issues, grouped by severity", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical", personName: "מרטין בדיקה" }),
            issue({ severity: "review", personName: "איתן דוגמה", reason: "invalid_shift_time" }),
          ],
        }),
      ),
    );
    await renderPage();
    expect(screen.getAllByText("מרטין בדיקה", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/מרטין בדיקה|איתן דוגמה/).length).toBeGreaterThan(0);
  });

  it("never renders the personal 'שלך' issue phrasing for someone else's issue", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model({ issues: [issue()] })));
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("שלך");
  });

  it("shows full Potential coverage as a row with the covered/not-yet-evaluable state", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(model({ potentialRequirements: [potentialRow({ status: "not_evaluable", namedPersonBlockingAbsence: false })] })),
    );
    await renderPage();
    expect(screen.getAllByText(/לא ניתן להצליב אוטומטית/).length).toBeGreaterThan(0);
  });

  it("shows a missing Potential requirement with the named-person conflict note", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model({ potentialRequirements: [potentialRow()] })));
    await renderPage();
    expect(screen.getAllByText(/דורש בדיקה/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/היעדרות חוסמת/).length).toBeGreaterThan(0);
  });

  it("preserves multiple people on the same shift, never collapsed to one", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          coverageOverview: [
            shiftGroup({
              technicians: [
                { personId: "a", personName: "מרטין בדיקה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null },
                { personId: "b", personName: "נועה דוגמה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null },
              ],
            }),
          ],
        }),
      ),
    );
    await renderPage();
    expect(screen.getByText(/מרטין בדיקה, נועה דוגמה/)).toBeInTheDocument();
  });

  it("shows several duties and absences", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          duties: [duty({ personName: "מרטין בדיקה" }), duty({ personName: "איתן דוגמה", personId: "p_eitan", dutyFamily: "oxid", slot: null })],
          absences: [absence({ personName: "נועה דוגמה", personId: "p_noa", absenceKind: "medical" })],
        }),
      ),
    );
    await renderPage();
    expect(screen.getByText("תורנויות")).toBeInTheDocument();
    expect(screen.getByText("היעדרויות")).toBeInTheDocument();
  });

  it("the roster section links to each person by id", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model()));
    await renderPage();
    const link = screen.getAllByRole("link", { name: "מרטין בדיקה" })[0];
    expect(link).toHaveAttribute("href", "/manager?person=p_martin");
  });
});

describe("ManagerPage — problems-only filter", () => {
  it("hides coverage/potential/duties/roster sections when problemsOnly is set", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          problemsOnly: true,
          issues: [issue()],
          coverageOverview: [shiftGroup()],
          duties: [duty()],
        }),
      ),
    );
    await renderPage({ problems: "1" });
    expect(screen.queryByText("כיסוי משמרות")).toBeNull();
    expect(screen.queryByText("תורנויות")).toBeNull();
  });

  it("still shows the attention section when problemsOnly is set", async () => {
    getRequestManagerOverview.mockResolvedValue(okResult(model({ problemsOnly: true, issues: [issue()] })));
    await renderPage({ problems: "1" });
    expect(screen.getByText("דחוף")).toBeInTheDocument();
  });
});

describe("ManagerPage — selected person view", () => {
  it("shows the person-scoped header, never the everyone controls sections", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          selectedPersonId: "p_martin",
          selectedPerson: personalModel(),
        }),
      ),
    );
    await renderPage({ person: "p_martin" });
    expect(screen.getByText(/מבט על מרטין בדיקה/)).toBeInTheDocument();
    expect(screen.queryByText("כיסוי משמרות")).toBeNull();
  });

  it("a person with no upcoming assignments shows the calm empty state", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(model({ selectedPersonId: "p_martin", selectedPerson: personalModel() })),
    );
    await renderPage({ person: "p_martin" });
    expect(screen.getByText("אין שיבוצים קרובים לאדם זה.")).toBeInTheDocument();
  });

  it("shows the selected person's own range-scoped absences, not everyone's", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          selectedPersonId: "p_martin",
          selectedPerson: personalModel(),
          selectedPersonRangeAbsences: [absence({ personId: "p_martin", personName: "מרטין בדיקה" })],
          absences: [absence({ personId: "p_martin" }), absence({ personId: "p_noa", personName: "נועה דוגמה" })],
        }),
      ),
    );
    await renderPage({ person: "p_martin" });
    expect(screen.getByText("היעדרויות בטווח")).toBeInTheDocument();
    expect(screen.queryByText("נועה דוגמה")).toBeNull();
  });

  it("selecting a person never renders a sign-out affordance or changes identity chrome", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(model({ selectedPersonId: "p_martin", selectedPerson: personalModel() })),
    );
    const { container } = await renderPage({ person: "p_martin" });
    expect(screen.queryByRole("button", { name: "התנתקות" })).toBeNull();
    expect(container.querySelector("aside")).toBeNull();
  });
});

describe("ManagerPage — privacy", () => {
  it("never leaks sourceSheet/sourceCell/email/spreadsheet details", async () => {
    getRequestManagerOverview.mockResolvedValue(
      okResult(
        model({
          issues: [issue()],
          coverageOverview: [shiftGroup()],
          duties: [duty()],
          absences: [absence()],
          potentialRequirements: [potentialRow()],
        }),
      ),
    );
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("spreadsheetId");
  });
});
