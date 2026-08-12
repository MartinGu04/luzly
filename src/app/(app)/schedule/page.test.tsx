import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalEventView, PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));

const { default: SchedulePage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
});

function shiftEvent(overrides: Partial<PersonalEventView> = {}): PersonalEventView {
  return {
    date: "2026-08-12",
    title: "טכנאי יום",
    rawValue: "טכנאי יום",
    category: "shift",
    certainty: "confirmed",
    role: "technician",
    period: "day",
    slot: null,
    shadow: false,
    startTimeOverride: null,
    endTimeOverride: null,
    dutyFamily: null,
    absenceKind: null,
    changeNote: null,
    timing: { status: "not_evaluable" },
    ...overrides,
  };
}

function model(overrides: Partial<PersonalScheduleReadModel> = {}): PersonalScheduleReadModel {
  return {
    person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
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

function okResult(m: PersonalScheduleReadModel) {
  return { status: "ok" as const, model: m };
}

function searchParams(month?: string) {
  return Promise.resolve(month ? { month } : {});
}

describe("SchedulePage — month resolution", () => {
  it("defaults to the month containing localNow.date when no month param is given", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("אוגוסט 2026")).toBeInTheDocument();
  });

  it("uses a valid explicit month param", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await SchedulePage({ searchParams: searchParams("2026-12") });
    render(element);
    expect(screen.getByText("דצמבר 2026")).toBeInTheDocument();
  });

  it("falls back safely to the current month for an invalid month param, never crashes", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await SchedulePage({ searchParams: searchParams("not-a-month") });
    render(element);
    expect(screen.getByText("אוגוסט 2026")).toBeInTheDocument();
  });

  it("falls back safely for an out-of-range month param", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await SchedulePage({ searchParams: searchParams("2026-13") });
    render(element);
    expect(screen.getByText("אוגוסט 2026")).toBeInTheDocument();
  });
});

describe("SchedulePage — configuration_error", () => {
  it("renders the configuration-error state instead of a calendar", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    });
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
    expect(screen.queryByText(/2026/)).toBeNull();
  });
});

describe("SchedulePage — content", () => {
  it("renders the month's shift events and the selected-day panel by default on today", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ shiftCalendarEvents: [shiftEvent({ date: "2026-08-12" })] })),
    );
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
  });

  it("does not render a shift from a different month", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ shiftCalendarEvents: [shiftEvent({ date: "2026-09-05", title: "טכנאי ספטמבר" })] })),
    );
    const element = await SchedulePage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText("טכנאי ספטמבר")).toBeNull();
  });

  it("never leaks raw workbook/identity keys or an email into the rendered output", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ shiftCalendarEvents: [shiftEvent({ date: "2026-08-12" })] })),
    );
    const element = await SchedulePage({ searchParams: searchParams() });
    const { container } = render(element);
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
  });

  it("renders only its own content -- the shell (sidebar) is the protected layout's job, not the page's", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await SchedulePage({ searchParams: searchParams() });
    const { container } = render(element);
    expect(container.querySelector("aside")).toBeNull();
  });
});
