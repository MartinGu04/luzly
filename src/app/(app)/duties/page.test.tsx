import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalDutyAction, PersonalDutyBlock, PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));

const { default: DutiesPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
});

function dutyBlock(overrides: Partial<PersonalDutyBlock> = {}): PersonalDutyBlock {
  return {
    dutyFamily: "guard",
    slot: 2,
    startDate: "2026-08-12",
    endDate: "2026-08-14",
    dates: ["2026-08-12", "2026-08-13", "2026-08-14"],
    certainty: "confirmed",
    dayCount: 3,
    weekendCompleteness: "not_applicable",
    ...overrides,
  };
}

function dutyAction(overrides: Partial<PersonalDutyAction> = {}): PersonalDutyAction {
  return {
    type: "duty_check_in",
    date: "2026-08-12",
    localTime: "13:00",
    dutyFamily: "guard",
    slot: 2,
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

function searchParams(view?: string) {
  return Promise.resolve(view ? { view } : {});
}

describe("DutiesPage — configuration_error", () => {
  it("renders the configuration-error state instead of the duty overview", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    });
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
    expect(screen.queryByText("תורנויות")).toBeNull();
  });
});

describe("DutiesPage — view param", () => {
  it("defaults to the upcoming view", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByRole("link", { name: "קרובות" })).toHaveAttribute("aria-current", "page");
  });

  it("switches to the history view via ?view=history", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await DutiesPage({ searchParams: searchParams("history") });
    render(element);
    expect(screen.getByRole("link", { name: "היסטוריה" })).toHaveAttribute("aria-current", "page");
  });

  it("falls back safely to upcoming for an invalid view param", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await DutiesPage({ searchParams: searchParams("../../etc/passwd") });
    render(element);
    expect(screen.getByRole("link", { name: "קרובות" })).toHaveAttribute("aria-current", "page");
  });
});

describe("DutiesPage — focus section", () => {
  it("shows the active-duty focus when a block is active today", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ dutyBlocks: [dutyBlock({ dates: ["2026-08-11", "2026-08-12", "2026-08-13"] })] })),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("בתורנות עכשיו")).toBeInTheDocument();
    expect(screen.getByText("שמירה 2")).toBeInTheDocument();
  });

  it("shows the next-duty focus when nothing is active today", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [dutyBlock({ startDate: "2026-08-20", endDate: "2026-08-20", dates: ["2026-08-20"] })],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("התורנות הבאה")).toBeInTheDocument();
  });

  it("shows the calm empty state when there are no duties at all", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("אין לך תורנויות קרובות")).toBeInTheDocument();
  });

  it("shows a pending today check-in on the active focus block", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          localNow: { date: "2026-08-12", minuteOfDay: 10 * 60 },
          dutyBlocks: [dutyBlock({ dates: ["2026-08-12", "2026-08-13", "2026-08-14"] })],
          dutyActions: [dutyAction({ date: "2026-08-12", localTime: "13:00" })],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText(/היום · 13:00/)).toBeInTheDocument();
  });

  it("does not show an already-passed today check-in as pending", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          localNow: { date: "2026-08-12", minuteOfDay: 13 * 60 + 1 },
          dutyBlocks: [dutyBlock({ dates: ["2026-08-12", "2026-08-13", "2026-08-14"] })],
          dutyActions: [dutyAction({ date: "2026-08-12", localTime: "13:00" })],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText(/היום · 13:00/)).toBeNull();
  });
});

describe("DutiesPage — upcoming/history lists", () => {
  it("the remaining upcoming list excludes the focus block, never repeating it", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [
            dutyBlock({ dutyFamily: "guard", slot: 1, dates: ["2026-08-12"], startDate: "2026-08-12", endDate: "2026-08-12" }),
            dutyBlock({ dutyFamily: "reserve", slot: 3, startDate: "2026-08-20", endDate: "2026-08-20", dates: ["2026-08-20"] }),
          ],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    // The active block appears once (in focus); the future block appears in the list.
    expect(screen.getAllByText("שמירה 1")).toHaveLength(1);
    expect(screen.getByText("עתודה 3")).toBeInTheDocument();
  });

  it("a completed block is excluded from the upcoming view", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [
            dutyBlock({ startDate: "2026-08-01", endDate: "2026-08-02", dates: ["2026-08-01", "2026-08-02"] }),
          ],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("אין תורנויות נוספות באופק הקרוב.")).toBeInTheDocument();
  });

  it("a completed block appears in the history view", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [
            dutyBlock({ startDate: "2026-08-01", endDate: "2026-08-02", dates: ["2026-08-01", "2026-08-02"] }),
          ],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams("history") });
    render(element);
    expect(screen.getByText("שמירה 2")).toBeInTheDocument();
    expect(screen.getByText("היסטוריה אחרונה")).toBeInTheDocument();
  });
});

describe("DutiesPage — multiple/overlapping duties", () => {
  it("two duties active on the same date are both shown, never collapsed", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [
            dutyBlock({ dutyFamily: "guard", slot: 1, dates: ["2026-08-12"], startDate: "2026-08-12", endDate: "2026-08-12" }),
            dutyBlock({ dutyFamily: "full_kitchen", slot: null, dates: ["2026-08-12"], startDate: "2026-08-12", endDate: "2026-08-12" }),
          ],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("שמירה 1")).toBeInTheDocument();
    expect(screen.getByText("מטבח מלא")).toBeInTheDocument();
  });
});

describe("DutiesPage — security", () => {
  it("never leaks an email or raw workbook keys into the rendered output", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ dutyBlocks: [dutyBlock()], dutyActions: [dutyAction()] })),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    const { container } = render(element);
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
    expect(container.textContent).not.toContain("personId");
  });

  it("renders only its own content -- the shell (sidebar) is the protected layout's job, not the page's", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const element = await DutiesPage({ searchParams: searchParams() });
    const { container } = render(element);
    expect(container.querySelector("aside")).toBeNull();
  });
});
