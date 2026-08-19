import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { DutyFairnessPersonRowView } from "@/lib/readModels/dutyFairnessTypes";
import type { PersonalDutyAction, PersonalDutyBlock, PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestPersonalSchedule = vi.fn();
const getRequestDutyFairness = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("@/lib/readModels/getRequestDutyFairness", () => ({ getRequestDutyFairness }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

const { default: DutiesPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
  // Default: no reachable Duty Fairness data for this request -- the exact
  // same "show nothing extra" outcome as a genuinely absent exemption, so
  // every existing test (which never mocked this call) keeps working
  // unchanged and only the new exemption-specific tests below override it.
  getRequestDutyFairness.mockReset();
  getRequestDutyFairness.mockResolvedValue({ status: "unmapped" });
});

function dutyFairnessRow(overrides: Partial<DutyFairnessPersonRowView> = {}): DutyFairnessPersonRowView {
  return {
    key: "p_1-0",
    personId: "p_1",
    sourceName: "דני בדיקה",
    allocationLabel: "טכנאי",
    previousScore: null,
    currentScore: 5,
    delta: null,
    comparisonTarget: null,
    gapToTarget: null,
    normalizedLoad: null,
    status: null,
    weekendCount: null,
    completedDutyCount: null,
    exemptions: [],
    dataCompleteness: { status: "complete", reasons: [] },
    ...overrides,
  };
}

function dutyFairnessOkResult(rows: DutyFairnessPersonRowView[]) {
  return {
    status: "ok" as const,
    person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    model: {
      fetchedAt: "2026-08-12T08:00:00.000Z",
      fairnessModelVersion: 1,
      period: { key: "h2" as const, year: 2026, label: "7–12/2026", status: "current" as const },
      targets: { supervisorTarget: null, technicianTarget: null },
      groups: [{ key: "technician" as const, rows }],
      totals: null,
    },
  };
}

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
    calendarEvents: [],
    currentAssignments: [],
    nextAssignmentGroup: null,
    currentShiftContexts: [],
    nextShiftContexts: [],
    currentAdjacentShiftContexts: [],
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

describe("DutiesPage — no duplicate empty state", () => {
  it("regression: the upcoming view shows the hero empty state only ONCE when there is no focus and nothing upcoming, never a second redundant panel", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);

    expect(screen.getByText("אין לך תורנויות קרובות")).toBeInTheDocument();
    expect(screen.queryByText("אין תורנויות נוספות באופק הקרוב.")).toBeNull();
  });

  it("keeps the view toggle visible even when the redundant panel is suppressed, so history is still reachable", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);

    expect(screen.getByRole("link", { name: "קרובות" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "היסטוריה" })).toBeInTheDocument();
  });

  it("keeps the 'nothing else upcoming' panel when a focus duty EXISTS but there is nothing beyond it -- there it adds real information", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [dutyBlock({ dates: ["2026-08-12", "2026-08-13", "2026-08-14"] })], // active, the only block
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);

    expect(screen.getByText("בתורנות עכשיו")).toBeInTheDocument();
    expect(screen.getByText("אין תורנויות נוספות באופק הקרוב.")).toBeInTheDocument();
  });

  it("the history view still renders its own empty state, unaffected by the upcoming-view suppression", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    const element = await DutiesPage({ searchParams: searchParams("history") });
    render(element);

    expect(screen.getByText("אין לך תורנויות קרובות")).toBeInTheDocument();
    expect(screen.getByText("אין עדיין היסטוריית תורנויות.")).toBeInTheDocument();
  });

  it("the history view still renders its list even when the upcoming view would suppress the panel", async () => {
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

describe("DutiesPage — quiet-state recent-history preview (Design Pass PR #20)", () => {
  it("shows a bounded 'היסטוריה אחרונה' preview, using the EXISTING historyBlocks data, when there is no focus and nothing upcoming", async () => {
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

    expect(screen.getByText("אין לך תורנויות קרובות")).toBeInTheDocument();
    expect(screen.getByText("היסטוריה אחרונה")).toBeInTheDocument();
    expect(screen.getByText("שמירה 2")).toBeInTheDocument();
  });

  it("the preview is bounded to a small slice (5), never the full/differently-limited history tab list", async () => {
    const manyCompletedBlocks = Array.from({ length: 6 }, (_, i) =>
      dutyBlock({
        dutyFamily: "reserve",
        slot: i + 1,
        startDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
        endDate: `2026-07-${String(i + 1).padStart(2, "0")}`,
        dates: [`2026-07-${String(i + 1).padStart(2, "0")}`],
      }),
    );

    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: manyCompletedBlocks })));

    const upcomingElement = await DutiesPage({ searchParams: searchParams() });
    const { unmount } = render(upcomingElement);
    // Newest-first (per historyBlocks): slot 6 (2026-07-06) is among the most
    // recent 5, slot 1 (2026-07-01, the oldest) is bumped out of the preview.
    expect(screen.getByText("עתודה 6")).toBeInTheDocument();
    expect(screen.queryByText("עתודה 1")).toBeNull();
    unmount();

    const historyElement = await DutiesPage({ searchParams: searchParams("history") });
    render(historyElement);
    // The full history tab is unaffected -- every block still appears.
    expect(screen.getByText("עתודה 6")).toBeInTheDocument();
    expect(screen.getByText("עתודה 1")).toBeInTheDocument();
  });

  it("never introduces a new duty-derivation rule -- the preview is just historyBlocks() with a smaller limit, same active/upcoming semantics", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          dutyBlocks: [dutyBlock({ dates: ["2026-08-12", "2026-08-13", "2026-08-14"] })], // active today
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);

    // A focus duty exists, so the quiet-state preview must NOT appear --
    // the existing "nothing else upcoming" panel is shown instead (already
    // covered above), never a history preview alongside an active focus.
    expect(screen.getByText("בתורנות עכשיו")).toBeInTheDocument();
    expect(screen.queryByText("היסטוריה אחרונה")).toBeNull();
  });

  it("?view=history semantics are unaffected by the preview -- still reachable via the toggle link", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByRole("link", { name: "היסטוריה" })).toHaveAttribute("href", "/duties?view=history");
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
            dutyBlock({ dutyFamily: "reserve", slot: 3, startDate: "2026-08-20", endDate: "2026-08-20", dates: ["2026-08-20"] }),
          ],
        }),
      ),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText("שמירה 2")).toBeNull();
    expect(screen.getByText("עתודה 3")).toBeInTheDocument();
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

describe("DutiesPage — duty exemption (reuses the existing Duty Fairness exemption data, no new flag)", () => {
  it("shows the person's exemption badge when their current-period Duty Fairness row carries one", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    getRequestDutyFairness.mockResolvedValue(
      dutyFairnessOkResult([dutyFairnessRow({ exemptions: [{ raw: "שמירות", affectedDutyFamilies: ["guard"] }] })]),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("🚫 שמירות")).toBeInTheDocument();
  });

  it("shows multiple exemption badges when more than one is recorded", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    getRequestDutyFairness.mockResolvedValue(
      dutyFairnessOkResult([
        dutyFairnessRow({
          exemptions: [
            { raw: "שמירות", affectedDutyFamilies: ["guard"] },
            { raw: "מטבח", affectedDutyFamilies: ["daily_kitchen", "full_kitchen", "weekend_kitchen"] },
          ],
        }),
      ]),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("🚫 שמירות")).toBeInTheDocument();
    expect(screen.getByText("🚫 מטבח")).toBeInTheDocument();
  });

  it("shows nothing extra when the person's row has no exemption", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    getRequestDutyFairness.mockResolvedValue(dutyFairnessOkResult([dutyFairnessRow({ exemptions: [] })]));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText(/🚫/)).toBeNull();
  });

  it("never shows another person's exemption -- matched strictly by personId", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    getRequestDutyFairness.mockResolvedValue(
      dutyFairnessOkResult([
        dutyFairnessRow({
          personId: "p_someone_else",
          exemptions: [{ raw: "שמירות", affectedDutyFamilies: ["guard"] }],
        }),
      ]),
    );
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.queryByText(/🚫/)).toBeNull();
  });

  it("degrades quietly (no exemption badge, no crash) when the Duty Fairness table isn't reachable", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ dutyBlocks: [] })));
    getRequestDutyFairness.mockResolvedValue({ status: "unauthenticated" });
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByText("תורנויות")).toBeInTheDocument();
    expect(screen.queryByText(/🚫/)).toBeNull();
  });
});

describe("DutiesPage — data freshness uses PersonalScheduleReadModel.fetchedAt (PR #17 §10/§19)", () => {
  it("the freshness status receives this page's own model.fetchedAt", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ fetchedAt: "2026-08-13T10:45:00.000Z" })));
    const element = await DutiesPage({ searchParams: searchParams() });
    render(element);
    expect(screen.getByTestId("freshness")).toHaveTextContent("2026-08-13T10:45:00.000Z");
  });
});
