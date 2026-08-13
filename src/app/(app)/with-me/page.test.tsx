import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalCounterpart, PersonalScheduleReadModel, PersonalShiftContext } from "@/lib/readModels/types";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));

const { default: WithMePage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
});

function counterpart(overrides: Partial<PersonalCounterpart> = {}): PersonalCounterpart {
  return {
    personId: "p_2",
    personName: "נועה דוגמה",
    role: "supervisor",
    certainty: "confirmed",
    shadow: false,
    period: "day",
    startTimeOverride: null,
    endTimeOverride: null,
    ...overrides,
  };
}

function shiftContext(overrides: Partial<PersonalShiftContext> = {}): PersonalShiftContext {
  return {
    date: "2026-08-12",
    period: "day",
    role: "technician",
    coverageStatus: "full",
    missingIntervals: [],
    primaryCounterparts: [],
    shadowCounterparts: [],
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

describe("WithMePage — configuration_error", () => {
  it("renders the configuration-error state instead of the team overview", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    });
    const element = await WithMePage();
    render(element);
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
    expect(screen.queryByText("מי איתי")).toBeNull();
  });
});

describe("WithMePage — screen state", () => {
  it("current only: shows 'איתך עכשיו' but not 'המשמרת הבאה'", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext()] })),
    );
    render(await WithMePage());
    expect(screen.getByText("איתך עכשיו")).toBeInTheDocument();
    expect(screen.queryByText("המשמרת הבאה")).toBeNull();
  });

  it("next only: shows 'המשמרת הבאה' as the main focus, not 'איתך עכשיו'", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ nextShiftContexts: [shiftContext({ date: "2026-08-13" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("המשמרת הבאה")).toBeInTheDocument();
    expect(screen.queryByText("איתך עכשיו")).toBeNull();
  });

  it("current + next: shows both sections, current never duplicated in the next list", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [shiftContext({ role: "technician" })],
          nextShiftContexts: [shiftContext({ date: "2026-08-13", role: "supervisor" })],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText("איתך עכשיו")).toBeInTheDocument();
    expect(screen.getByText("המשמרת הבאה")).toBeInTheDocument();
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש יום')).toBeInTheDocument();
  });

  it("neither: shows exactly one calm empty state, no duplicate panels", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    render(await WithMePage());
    expect(screen.getByText("אין כרגע משמרת עם צוות להצגה")).toBeInTheDocument();
    expect(screen.queryByText("איתך עכשיו")).toBeNull();
    expect(screen.queryByText("המשמרת הבאה")).toBeNull();
  });

  it("multiple current contexts are all rendered, never collapsed to one", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({ role: "technician", period: "day" }),
            shiftContext({ role: "supervisor", period: "day" }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש יום')).toBeInTheDocument();
  });

  it("multiple next contexts sharing the same date are all rendered, never assumed to be one", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          nextShiftContexts: [
            shiftContext({ date: "2026-08-13", role: "technician", period: "night" }),
            shiftContext({ date: "2026-08-13", role: "supervisor", period: "night" }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש לילה')).toBeInTheDocument();
  });
});

describe("WithMePage — shift title presentation", () => {
  it("technician day / night", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ role: "technician", period: "day" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("☀️")).toBeInTheDocument();
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
  });

  it("supervisor day / night", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ role: "supervisor", period: "night" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("🌙")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש לילה')).toBeInTheDocument();
  });

  it("unknown role/period stays honest, never invents a title", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ role: null, period: "unspecified" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("משמרת")).toBeInTheDocument();
  });
});

describe("WithMePage — counterparts", () => {
  it("multiple primary counterparts are all preserved", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({
              primaryCounterparts: [
                counterpart({ personId: "a", personName: "נועה דוגמה" }),
                counterpart({ personId: "b", personName: "משה כהן" }),
              ],
            }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText("נועה דוגמה")).toBeInTheDocument();
    expect(screen.getByText("משה כהן")).toBeInTheDocument();
  });

  it("multiple shadow counterparts are all preserved and visually separated from primary", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({
              primaryCounterparts: [counterpart({ personId: "a", personName: "נועה דוגמה" })],
              shadowCounterparts: [
                counterpart({ personId: "b", personName: "משה כהן", shadow: true }),
                counterpart({ personId: "c", personName: "יעל לוי", shadow: true }),
              ],
            }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText("הצוות איתך")).toBeInTheDocument();
    expect(screen.getByText("משה כהן")).toBeInTheDocument();
    expect(screen.getByText("יעל לוי")).toBeInTheDocument();
  });

  it("shows a tentative badge for a tentative counterpart", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [shiftContext({ primaryCounterparts: [counterpart({ certainty: "tentative" })] })],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText("משוער")).toBeInTheDocument();
  });

  it("shows a contextual empty-counterpart state when coverage is missing and no one is returned", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ coverageStatus: "missing" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("לא נמצא כיסוי לתפקיד המשלים במשמרת הזו.")).toBeInTheDocument();
  });
});

describe("WithMePage — coverage", () => {
  it("full", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ coverageStatus: "full" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("הכיסוי מלא")).toBeInTheDocument();
  });

  it("partial", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ coverageStatus: "partial" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("הכיסוי חלקי")).toBeInTheDocument();
  });

  it("missing", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ coverageStatus: "missing" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("אין כיסוי")).toBeInTheDocument();
  });

  it("not_evaluable", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ coverageStatus: "not_evaluable" })] })),
    );
    render(await WithMePage());
    expect(screen.getByText("לא ניתן להעריך כיסוי")).toBeInTheDocument();
  });
});

describe("WithMePage — missing intervals", () => {
  it("shows a normal daytime missing interval", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({ coverageStatus: "partial", missingIntervals: [{ startMinute: 330, endMinute: 450 }] }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText(/05:30–07:30/)).toBeInTheDocument();
  });

  it("converts an overnight interval past 1440 minutes correctly", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({ coverageStatus: "missing", missingIntervals: [{ startMinute: 1170, endMinute: 1530 }] }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText(/19:30–01:30/)).toBeInTheDocument();
  });

  it("formats an interval crossing midnight", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({ coverageStatus: "partial", missingIntervals: [{ startMinute: 1410, endMinute: 1470 }] }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText(/23:30–00:30/)).toBeInTheDocument();
  });

  it("preserves the order of multiple gaps", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({
              coverageStatus: "partial",
              missingIntervals: [
                { startMinute: 1170, endMinute: 1230 },
                { startMinute: 330, endMinute: 450 },
              ],
            }),
          ],
        }),
      ),
    );
    render(await WithMePage());
    expect(screen.getByText(/19:30–20:30 · 05:30–07:30/)).toBeInTheDocument();
  });

  it("never shows a missing-coverage callout when there are no intervals", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ currentShiftContexts: [shiftContext({ coverageStatus: "full", missingIntervals: [] })] })),
    );
    render(await WithMePage());
    expect(screen.queryByText("חסר כיסוי:")).toBeNull();
  });
});

describe("WithMePage — privacy", () => {
  it("never leaks email, capability flags, personnelType, or workbook keys", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          currentShiftContexts: [
            shiftContext({
              primaryCounterparts: [counterpart()],
              shadowCounterparts: [counterpart({ personId: "p_3", personName: "משה כהן", shadow: true })],
            }),
          ],
        }),
      ),
    );
    const { container } = render(await WithMePage());
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("isManager");
    expect(container.textContent).not.toContain("isTechnician");
    expect(container.textContent).not.toContain("isSupervisor");
    expect(container.textContent).not.toContain("personnelType");
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
  });

  it("renders only its own content -- the shell (sidebar) is the protected layout's job, not the page's", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const { container } = render(await WithMePage());
    expect(container.querySelector("aside")).toBeNull();
  });
});
