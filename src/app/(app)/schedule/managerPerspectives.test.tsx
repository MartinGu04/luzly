import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ManagerAbsenceEntry, ManagerDutyEntry, ManagerShiftOverviewEntry } from "@/lib/readModels/managerTypes";
import type { ScheduleReadModel, ScheduleRosterOption } from "@/lib/readModels/scheduleTypes";
import type { PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestSchedule", () => ({ getRequestSchedule }));

const useRouterPush = vi.fn();
const useSearchParamsValue = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: useRouterPush, refresh: vi.fn() }),
  useSearchParams: () => useSearchParamsValue(),
}));

vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

const { default: SchedulePage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestSchedule.mockReset();
  useRouterPush.mockReset();
  useSearchParamsValue.mockReturnValue(new URLSearchParams());
});

function personalModel(overrides: Partial<PersonalScheduleReadModel> = {}): PersonalScheduleReadModel {
  return {
    person: { id: "p_martin", name: "מרטין גוסין", isManager: true, isTechnician: false, isSupervisor: false, personnelType: null },
    fetchedAt: "2026-08-12T08:00:00.000Z",
    localNow: { date: "2026-08-12", minuteOfDay: 600 },
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

function roster(): ScheduleRosterOption[] {
  return [
    { id: "p_daniel", name: "דניאל כהן", personnelType: null, isSupervisor: false, isTechnician: false },
    { id: "p_eitan", name: "איתן דוגמה", personnelType: null, isSupervisor: false, isTechnician: false },
  ];
}

function scheduleModel(overrides: Partial<ScheduleReadModel> = {}): ScheduleReadModel {
  return {
    fetchedAt: "2026-08-12T08:00:00.000Z",
    localNow: { date: "2026-08-12", minuteOfDay: 600 },
    manager: null,
    roster: [],
    perspective: "self",
    selectedPersonId: null,
    selectedPersonName: null,
    personal: personalModel(),
    everyone: null,
    ...overrides,
  };
}

function managerSelfModel(overrides: Partial<ScheduleReadModel> = {}): ScheduleReadModel {
  return scheduleModel({
    manager: { id: "p_martin", name: "מרטין גוסין" },
    roster: roster(),
    perspective: "self",
    personal: personalModel(),
    ...overrides,
  });
}

function okResult(model: ScheduleReadModel) {
  return { status: "ok" as const, model };
}

function searchParams(params: { month?: string; person?: string } = {}) {
  return Promise.resolve(params);
}

function staffingEntry(overrides: Partial<ManagerShiftOverviewEntry> = {}): ManagerShiftOverviewEntry {
  return {
    date: "2026-08-13",
    period: "day",
    technicians: [{ personId: "p_daniel", personName: "דניאל כהן", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }],
    supervisors: [{ personId: "p_eitan", personName: "איתן דוגמה", certainty: "confirmed", startTimeOverride: null, endTimeOverride: null }],
    shadowTechnicians: [],
    shadowSupervisors: [],
    coverageStatus: "full",
    missingIntervals: [],
    roleCoverage: {
      technician: { status: "full", missingIntervals: [] },
      supervisor: { status: "full", missingIntervals: [] },
    },
    ...overrides,
  };
}

describe("SchedulePage — normal user never sees manager UI (PR #24 §3)", () => {
  it("renders no perspective selector for a normal user", async () => {
    getRequestSchedule.mockResolvedValue(okResult(scheduleModel({ personal: personalModel({ person: { ...personalModel().person, isManager: false } }) })));
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText("מציג לוח עבור")).toBeNull();
  });

  it("a normal user requesting ?person=all still only receives model.manager === null (server-side floor, tested at the read-model layer; this asserts the page trusts and never overrides it)", async () => {
    getRequestSchedule.mockResolvedValue(okResult(scheduleModel()));
    const element = await SchedulePage({ searchParams: searchParams({ person: "all" }) });
    render(element);
    expect(screen.queryByText("מציג לוח עבור")).toBeNull();
    expect(screen.queryByText("כולם")).toBeNull();
  });
});

describe("SchedulePage — manager selector (PR #24 §4/§5)", () => {
  it("renders the selector for a manager, defaulting to 'אני — <name>'", async () => {
    getRequestSchedule.mockResolvedValue(okResult(managerSelfModel()));
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("מציג לוח עבור")).toBeInTheDocument();
    expect(screen.getByText("אני — מרטין גוסין")).toBeInTheDocument();
  });

  it("shows 'כולם' as the current selection in everyone perspective", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "all",
          personal: null,
          everyone: { staffing: [], duties: [], absences: [] },
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ person: "all" }) });
    render(element);
    expect(screen.getByText("כולם")).toBeInTheDocument();
  });

  it("shows the selected colleague's name as the current selection in person perspective", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "person",
          selectedPersonId: "p_daniel",
          selectedPersonName: "דניאל כהן",
          personal: personalModel({ person: { id: "p_daniel", name: "דניאל כהן", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null } }),
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ person: "p_daniel" }) });
    render(element);
    // "דניאל כהן" appears both as the selector's current value and as the trigger's accessible label.
    expect(screen.getAllByText("דניאל כהן").length).toBeGreaterThan(0);
  });
});

describe("SchedulePage — everyone mode renders team staffing (PR #24 §14/§15)", () => {
  it("renders the everyone calendar with day/night staffing", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "all",
          personal: null,
          everyone: { staffing: [staffingEntry()], duties: [], absences: [] },
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ month: "2026-08", person: "all" }) });
    render(element);
    const cell = screen.getByRole("button", { name: /13 באוגוסט/ });
    expect(cell.textContent).toContain("דניאל כהן");
  });
});

describe("SchedulePage — selected-person empty month (PR #24 §12)", () => {
  it("shows the calm contextual note and still renders the calendar", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "person",
          selectedPersonId: "p_daniel",
          selectedPersonName: "דניאל כהן",
          personal: personalModel({
            person: { id: "p_daniel", name: "דניאל כהן", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
            shiftCalendarEvents: [],
          }),
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ person: "p_daniel" }) });
    render(element);
    expect(screen.getByText("אין לדניאל כהן משמרות בתקופה הזו")).toBeInTheDocument();
    // The calendar grid itself is still present (dates render as buttons).
    expect(screen.getAllByRole("button").length).toBeGreaterThan(20);
  });

  it("does not show the empty note in self mode even with zero shifts", async () => {
    getRequestSchedule.mockResolvedValue(okResult(managerSelfModel({ personal: personalModel({ shiftCalendarEvents: [] }) })));
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText(/משמרות בתקופה הזו/)).toBeNull();
  });
});

describe("SchedulePage — MonthNav preserves the selected perspective (PR #24 §29)", () => {
  it("preserves person=all across month navigation", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "all",
          personal: null,
          everyone: { staffing: [], duties: [], absences: [] },
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ month: "2026-08", person: "all" }) });
    render(element);
    const nextLink = screen.getByRole("link", { name: "חודש הבא" });
    expect(nextLink.getAttribute("href")).toBe("/schedule?month=2026-09&person=all");
    const todayLink = screen.getByRole("link", { name: "היום" });
    expect(todayLink.getAttribute("href")).toBe("/schedule?person=all");
  });

  it("preserves a selected person across month navigation", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "person",
          selectedPersonId: "p_daniel",
          selectedPersonName: "דניאל כהן",
          personal: personalModel({ person: { id: "p_daniel", name: "דניאל כהן", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null } }),
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ month: "2026-08", person: "p_daniel" }) });
    render(element);
    const prevLink = screen.getByRole("link", { name: "חודש קודם" });
    expect(prevLink.getAttribute("href")).toBe("/schedule?month=2026-07&person=p_daniel");
  });

  it("self mode never writes a person param onto MonthNav hrefs", async () => {
    getRequestSchedule.mockResolvedValue(okResult(managerSelfModel()));
    const element = await SchedulePage({ searchParams: searchParams({ month: "2026-08" }) });
    render(element);
    const nextLink = screen.getByRole("link", { name: "חודש הבא" });
    expect(nextLink.getAttribute("href")).toBe("/schedule?month=2026-09");
  });
});

describe("SchedulePage — privacy regression (PR #24 §37)", () => {
  it("never renders a colleague email or raw workbook keys, even in everyone mode", async () => {
    getRequestSchedule.mockResolvedValue(
      okResult(
        managerSelfModel({
          perspective: "all",
          personal: null,
          everyone: {
            staffing: [staffingEntry()],
            duties: [{ personId: "p_daniel", personName: "דניאל כהן", date: "2026-08-13", dutyFamily: "guard", slot: 1, certainty: "confirmed" } satisfies ManagerDutyEntry],
            absences: [{ personId: "p_eitan", personName: "איתן דוגמה", date: "2026-08-13", absenceKind: "vacation", certainty: "confirmed" } satisfies ManagerAbsenceEntry],
          },
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams({ month: "2026-08", person: "all" }) });
    const { container } = render(element);
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
  });
});
