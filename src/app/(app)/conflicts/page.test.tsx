import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PersonalIssue, PersonalScheduleReadModel } from "@/lib/readModels/types";

const getRequestPersonalSchedule = vi.fn();
vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

const { default: ConflictsPage } = await import("./page");

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  getRequestPersonalSchedule.mockReset();
});

function issue(overrides: Partial<PersonalIssue> = {}): PersonalIssue {
  return {
    reason: "shift_coverage_missing",
    severity: "critical",
    date: "2026-08-13",
    missingIntervals: null,
    metadata: null,
    targetEvent: null,
    ...overrides,
  };
}

function model(overrides: Partial<PersonalScheduleReadModel> = {}): PersonalScheduleReadModel {
  return {
    person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
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

function okResult(m: PersonalScheduleReadModel) {
  return { status: "ok" as const, model: m };
}

describe("ConflictsPage — configuration_error", () => {
  it("renders the configuration-error state instead of the conflicts screen", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: { id: "p_1", name: "דני בדיקה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
    });
    const element = await ConflictsPage();
    render(element);
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
    expect(screen.queryByText("התנגשויות ובדיקות")).toBeNull();
  });
});

describe("ConflictsPage — request scope", () => {
  it("uses getRequestPersonalSchedule, never a direct raw loader or a second Google request", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    await ConflictsPage();
    expect(getRequestPersonalSchedule).toHaveBeenCalledTimes(1);
  });
});

describe("ConflictsPage — empty state", () => {
  it("zero issues shows exactly one calm success empty state, no severity sections", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ issues: [] })));
    render(await ConflictsPage());
    expect(screen.getByText("הכול נראה תקין")).toBeInTheDocument();
    expect(screen.queryByText("דחוף")).toBeNull();
    expect(screen.queryByText("לבדיקה")).toBeNull();
    expect(screen.queryByText("לתשומת לב")).toBeNull();
  });
});

describe("ConflictsPage — severity grouping", () => {
  it("critical only: shows the critical section, no review/info sections, no redundant summary strip", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ issues: [issue({ severity: "critical" })] })));
    render(await ConflictsPage());
    expect(screen.getByText("דחוף")).toBeInTheDocument();
    expect(screen.queryByText("לבדיקה")).toBeNull();
    expect(screen.queryByText("1 דחוף")).toBeNull();
  });

  it("review only: no redundant summary strip either", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: [issue({ severity: "review", reason: "invalid_shift_time" })] })),
    );
    render(await ConflictsPage());
    expect(screen.getByText("לבדיקה")).toBeInTheDocument();
    expect(screen.queryByText("דחוף")).toBeNull();
    expect(screen.queryByText("1 לבדיקה")).toBeNull();
  });

  it("critical + review: both sections render, in critical-then-review order", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical", date: "2026-08-13" }),
            issue({ severity: "review", reason: "invalid_shift_time", date: "2026-08-13" }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const criticalIndex = headings.findIndex((h) => h?.includes("דחוף"));
    const reviewIndex = headings.findIndex((h) => h?.includes("לבדיקה"));
    expect(criticalIndex).toBeGreaterThanOrEqual(0);
    expect(reviewIndex).toBeGreaterThan(criticalIndex);
    expect(screen.getByText("1 דחוף · 1 לבדיקה")).toBeInTheDocument();
  });

  it("info is forward-compatible: renders its own section when present, without a machine enum leaking", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: [issue({ severity: "info", reason: "role_capability_mismatch" })] })),
    );
    render(await ConflictsPage());
    expect(screen.getByText("לתשומת לב")).toBeInTheDocument();
    expect(screen.queryByText(/^info$/)).toBeNull();
  });

  it("multiple issues at the same severity are all preserved, never collapsed", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical", reason: "shift_coverage_missing", date: "2026-08-13" }),
            issue({ severity: "critical", reason: "shift_coverage_partial", date: "2026-08-13" }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(container.querySelectorAll("li").length).toBe(2);
  });
});

describe("ConflictsPage — summary strip presence", () => {
  it("critical only (even with multiple issues): no summary, the group heading already says '3 דחופים' worth of info", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical", reason: "shift_coverage_missing", date: "2026-08-13" }),
            issue({ severity: "critical", reason: "shift_coverage_partial", date: "2026-08-13" }),
            issue({ severity: "critical", reason: "invalid_shift_time", date: "2026-08-14" }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.queryByText("3 דחופים")).toBeNull();
    expect(screen.getByText("· 3")).toBeInTheDocument();
  });

  it("review only: no summary", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: [issue({ severity: "review", reason: "invalid_shift_time" })] })),
    );
    render(await ConflictsPage());
    expect(screen.queryByText("1 לבדיקה")).toBeNull();
  });

  it("info only: no summary", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: [issue({ severity: "info", reason: "role_capability_mismatch" })] })),
    );
    render(await ConflictsPage());
    expect(screen.queryByText("1 לתשומת לב")).toBeNull();
  });

  it("critical + review: summary present", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical" }),
            issue({ severity: "review", reason: "invalid_shift_time" }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("1 דחוף · 1 לבדיקה")).toBeInTheDocument();
  });

  it("review + info: summary present", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "review", reason: "invalid_shift_time" }),
            issue({ severity: "info", reason: "role_capability_mismatch" }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("1 לבדיקה · 1 לתשומת לב")).toBeInTheDocument();
  });

  it("all three severities: summary present", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical" }),
            issue({ severity: "review", reason: "invalid_shift_time" }),
            issue({ severity: "info", reason: "role_capability_mismatch" }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("1 דחוף · 1 לבדיקה · 1 לתשומת לב")).toBeInTheDocument();
  });
});

describe("ConflictsPage — critical visual treatment (Design Pass PR #20)", () => {
  it("critical present: the critical group gets the pulse marker", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [issue({ severity: "critical" }), issue({ severity: "review", reason: "invalid_shift_time" })],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(container.querySelector(".animate-pulse-dot")).not.toBeNull();
  });

  it("the summary strip is critical-styled when any issue is critical", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [issue({ severity: "critical" }), issue({ severity: "review", reason: "invalid_shift_time" })],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("1 דחוף · 1 לבדיקה").className).toMatch(/text-critical/);
  });

  it("no critical: neither the summary nor any group shows the critical pulse marker", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "review", reason: "invalid_shift_time" }),
            issue({ severity: "info", reason: "role_capability_mismatch" }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(container.querySelector(".animate-pulse-dot")).toBeNull();
    expect(screen.getByText("1 לבדיקה · 1 לתשומת לב").className).not.toMatch(/text-critical/);
  });
});

describe("ConflictsPage — ordering", () => {
  it("preserves the read model's deterministic chronological order within a severity group", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ severity: "critical", date: "2026-08-13", reason: "shift_coverage_missing" }),
            issue({ severity: "critical", date: "2026-08-15", reason: "invalid_shift_time" }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    const rows = container.querySelectorAll("li");
    expect(rows[0]?.textContent).toContain("היום");
    expect(rows[1]?.textContent).toContain("15 באוגוסט");
  });

  it("two distinct same-date issues sharing a reason both render as separate rows", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              severity: "critical",
              date: "2026-08-13",
              targetEvent: { date: "2026-08-13", category: "shift", title: "טכנאי יום", role: "technician", period: "day" },
            }),
            issue({
              severity: "critical",
              date: "2026-08-13",
              targetEvent: { date: "2026-08-13", category: "shift", title: "טכנאי לילה", role: "technician", period: "night" },
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText("טכנאי לילה")).toBeInTheDocument();
  });
});

describe("ConflictsPage — reason presentation", () => {
  it("every current IssueReason maps to friendly copy, never a raw machine string", async () => {
    const reasons: PersonalIssue["reason"][] = [
      "blocking_absence_with_assignment",
      "shift_coverage_missing",
      "shift_coverage_partial",
      "invalid_shift_time",
      "role_capability_mismatch",
    ];
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: reasons.map((reason) => issue({ reason, severity: "critical" })) })),
    );
    const { container } = render(await ConflictsPage());
    expect(screen.getByText("קיימת חפיפה בין היעדרות לשיבוץ שלך")).toBeInTheDocument();
    expect(screen.getByText("חסר כיסוי למשמרת שלך")).toBeInTheDocument();
    expect(screen.getByText("הכיסוי למשמרת שלך חלקי")).toBeInTheDocument();
    expect(screen.getByText("שעות המשמרת דורשות בדיקה")).toBeInTheDocument();
    expect(screen.getByText("השיבוץ שלך דורש בדיקת תפקיד")).toBeInTheDocument();
    for (const reason of reasons) {
      expect(container.textContent).not.toContain(reason);
    }
  });
});

describe("ConflictsPage — target presentation", () => {
  it("a shift target shows role + period with its semantic emoji", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              targetEvent: { date: "2026-08-13", category: "shift", title: "x", role: "supervisor", period: "night" },
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("🌙")).toBeInTheDocument();
    expect(screen.getByText('אחמ"ש לילה')).toBeInTheDocument();
  });

  it("a duty/other target shows its sanitized title honestly, no emoji invented", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "role_capability_mismatch",
              metadata: { requiredCapability: "isTechnician" },
              targetEvent: { date: "2026-08-13", category: "duty", title: "שמירה 2", role: null, period: "unspecified" },
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText("שמירה 2")).toBeInTheDocument();
  });

  it("a null targetEvent renders no target line, never an invented one", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: [issue({ targetEvent: null })] })),
    );
    const { container } = render(await ConflictsPage());
    expect(container.textContent).not.toMatch(/☀️|🌙|🌅/);
  });
});

describe("ConflictsPage — coverage", () => {
  it("a missing interval is shown", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({ reason: "shift_coverage_missing", missingIntervals: [{ startMinute: 330, endMinute: 450 }] }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText(/05:30–07:30/)).toBeInTheDocument();
  });

  it("a partial interval is shown", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "shift_coverage_partial",
              missingIntervals: [{ startMinute: 60, endMinute: 120 }],
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText(/01:00–02:00/)).toBeInTheDocument();
  });

  it("multiple intervals preserve domain order", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "shift_coverage_partial",
              missingIntervals: [
                { startMinute: 1170, endMinute: 1230 },
                { startMinute: 330, endMinute: 450 },
              ],
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText(/19:30–20:30 · 05:30–07:30/)).toBeInTheDocument();
  });

  it("formats an overnight interval past 1440 minutes correctly", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "shift_coverage_missing",
              missingIntervals: [{ startMinute: 1170, endMinute: 1530 }],
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText(/19:30–01:30/)).toBeInTheDocument();
  });

  it("no interval never fabricates a missing-coverage callout", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(model({ issues: [issue({ reason: "shift_coverage_missing", missingIntervals: [] })] })),
    );
    render(await ConflictsPage());
    expect(screen.queryByText("חסר כיסוי:")).toBeNull();
  });
});

describe("ConflictsPage — blocking absence", () => {
  it("shows the target assignment and explanation, never a guessed absence kind", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "blocking_absence_with_assignment",
              targetEvent: { date: "2026-08-13", category: "shift", title: "x", role: "technician", period: "day" },
            }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(screen.getByText("☀️")).toBeInTheDocument();
    expect(screen.getByText("טכנאי יום")).toBeInTheDocument();
    expect(screen.getByText(/היעדרות חוסמת/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/vacation|abroad|medical|day_off/);
  });
});

describe("ConflictsPage — invalid shift time", () => {
  it("shows the target shift and explanation, no repaired/fabricated time", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "invalid_shift_time",
              severity: "review",
              targetEvent: { date: "2026-08-13", category: "shift", title: "x", role: "technician", period: "unspecified" },
            }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(screen.getAllByText(/שעות המשמרת/).length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/\d{2}:\d{2}–\d{2}:\d{2}/);
  });
});

describe("ConflictsPage — role capability mismatch", () => {
  it("isSupervisor maps to אחמ\"ש", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "role_capability_mismatch",
              severity: "review",
              metadata: { requiredCapability: "isSupervisor" },
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText(/אחמ"ש/)).toBeInTheDocument();
  });

  it("isTechnician maps to טכנאי", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "role_capability_mismatch",
              severity: "review",
              metadata: { requiredCapability: "isTechnician" },
            }),
          ],
        }),
      ),
    );
    render(await ConflictsPage());
    expect(screen.getByText(/טכנאי/)).toBeInTheDocument();
  });

  it("never displays the internal metadata enum string", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "role_capability_mismatch",
              severity: "review",
              metadata: { requiredCapability: "isSupervisor" },
            }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(container.textContent).not.toContain("isSupervisor");
    expect(container.textContent).not.toContain("requiredCapability");
  });
});

describe("ConflictsPage — privacy", () => {
  it("never leaks sourceSheet/sourceCell, email, or unrelated identity fields", async () => {
    getRequestPersonalSchedule.mockResolvedValue(
      okResult(
        model({
          issues: [
            issue({
              reason: "shift_coverage_missing",
              missingIntervals: [{ startMinute: 330, endMinute: 450 }],
              targetEvent: { date: "2026-08-13", category: "shift", title: "x", role: "technician", period: "day" },
            }),
          ],
        }),
      ),
    );
    const { container } = render(await ConflictsPage());
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("sourceCell");
    expect(container.textContent).not.toContain("@");
    expect(container.textContent).not.toContain("personId");
  });

  it("renders only its own content -- the shell (sidebar) is the protected layout's job, not the page's", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model()));
    const { container } = render(await ConflictsPage());
    expect(container.querySelector("aside")).toBeNull();
  });
});

describe("ConflictsPage — data freshness uses PersonalScheduleReadModel.fetchedAt (PR #17 §10/§19)", () => {
  it("the freshness status receives this page's own model.fetchedAt", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(model({ fetchedAt: "2026-08-13T10:45:00.000Z" })));
    render(await ConflictsPage());
    expect(screen.getByTestId("freshness")).toHaveTextContent("2026-08-13T10:45:00.000Z");
  });
});
