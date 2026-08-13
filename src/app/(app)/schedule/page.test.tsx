import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { PersonalAssignmentView, PersonalEventView, PersonalScheduleReadModel } from "@/lib/readModels/types";

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

function assignmentEvent(overrides: Partial<PersonalAssignmentView> = {}): PersonalAssignmentView {
  return { ...shiftEvent(), temporalState: "current", ...overrides };
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

describe("SchedulePage — selected day resets on month change (regression)", () => {
  it("does not carry a stale selected day forward when the parent re-renders with a new month's props", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          shiftCalendarEvents: [
            shiftEvent({ date: "2026-08-20", title: "משמרת אוגוסט מיוחדת" }),
            shiftEvent({ date: "2026-09-01", title: "משמרת ספטמבר" }),
          ],
        }),
      ),
    );

    // Render August (default month, since localNow.date is 2026-08-12) using the
    // SAME parent composition the real app uses -- SchedulePage itself, which keys
    // <ScheduleCalendar key={monthParam} .../> by the displayed month.
    const augustElement = await SchedulePage({ searchParams: searchParams("2026-08") });
    const { rerender } = render(augustElement);

    // Select a day OTHER than August's default (today, the 12th).
    act(() => {
      screen.getByRole("button", { name: /20 באוגוסט/ }).click();
    });
    expect(screen.getByText("משמרת אוגוסט מיוחדת")).toBeInTheDocument();

    // Transition to September via a rerender on the SAME mounted tree -- this is
    // exactly the scenario a client-side Next.js navigation produces: new server
    // props arrive, but nothing forces a remount unless the composition keys the
    // client component by month.
    const septemberElement = await SchedulePage({ searchParams: searchParams("2026-09") });
    rerender(septemberElement);

    // September's own default-selected day (the 1st, since today isn't in this
    // month) must be shown -- never a leftover reference to August's selection.
    expect(screen.getByText("משמרת ספטמבר")).toBeInTheDocument();
    expect(screen.queryByText("משמרת אוגוסט מיוחדת")).toBeNull();
  });
});

describe("SchedulePage — active shift accent is event-date-aware, not tied to civil today", () => {
  it("a current same-day day shift: its own date gets the active accent", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          localNow: { date: "2026-08-12", minuteOfDay: 600 },
          shiftCalendarEvents: [shiftEvent({ date: "2026-08-12" })],
          currentAssignments: [assignmentEvent({ date: "2026-08-12" })],
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams("2026-08") });
    render(element);
    const cell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(cell.innerHTML).toMatch(/bg-primary/);
  });

  it("an overnight shift still current after midnight: the shift's OWN (previous) date gets the accent, not today's cell", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          // "Now" is 02:00 on the 13th, but the still-running overnight shift's Event date is the 12th.
          localNow: { date: "2026-08-13", minuteOfDay: 2 * 60 },
          shiftCalendarEvents: [shiftEvent({ date: "2026-08-12", period: "night" })],
          currentAssignments: [assignmentEvent({ date: "2026-08-12", period: "night" })],
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams("2026-08") });
    render(element);

    const shiftDateCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(shiftDateCell.innerHTML).toMatch(/bg-primary/);

    const todayCell = screen.getByRole("button", { name: /13 באוגוסט/ });
    expect(todayCell.innerHTML).toMatch(/ring-primary/);
    expect(todayCell.innerHTML).not.toMatch(/bg-primary/);
  });

  it("no current shift: no cell gets the active-shift accent", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ localNow: { date: "2026-08-12", minuteOfDay: 600 }, currentAssignments: [] })),
    );
    const element = await SchedulePage({ searchParams: searchParams("2026-08") });
    render(element);
    const todayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(todayCell.innerHTML).toMatch(/ring-primary/);
    expect(todayCell.innerHTML).not.toMatch(/bg-primary/);
  });

  it("a current DUTY (not a shift) never triggers the shift active-accent", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          localNow: { date: "2026-08-12", minuteOfDay: 600 },
          currentAssignments: [assignmentEvent({ date: "2026-08-12", category: "duty" })],
        }),
      ),
    );
    const element = await SchedulePage({ searchParams: searchParams("2026-08") });
    render(element);
    const todayCell = screen.getByRole("button", { name: /12 באוגוסט/ });
    expect(todayCell.innerHTML).not.toMatch(/bg-primary/);
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
