import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { COMPLETE_FAIRNESS_DATA, fairnessDataCompleteness } from "@/lib/domain/fairnessFoundation";
import type { DutyFairnessPersonRowView, DutyFairnessReadModel } from "@/lib/readModels/dutyFairnessTypes";
import type { ShiftFairnessPersonRowView, ShiftFairnessReadModel } from "@/lib/readModels/shiftFairnessTypes";

const getRequestShiftFairness = vi.fn();
const getRequestDutyFairness = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});
const routerPush = vi.fn();

vi.mock("@/lib/readModels/getRequestShiftFairness", () => ({ getRequestShiftFairness }));
vi.mock("@/lib/readModels/getRequestDutyFairness", () => ({ getRequestDutyFairness }));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({ push: routerPush }) }));
vi.mock("@/components/ui/DataFreshnessStatus", () => ({
  DataFreshnessStatus: ({ fetchedAt }: { fetchedAt: string }) => <div data-testid="freshness">{fetchedAt}</div>,
}));

const { default: FairnessPage } = await import("./page");

function searchParams(params: Record<string, string> = {}) {
  return Promise.resolve(params);
}

async function renderFairnessPage(params: Record<string, string> = {}) {
  const element = await FairnessPage({ searchParams: searchParams(params) });
  return render(element as React.ReactElement);
}

beforeEach(() => {
  getRequestShiftFairness.mockReset();
  getRequestDutyFairness.mockReset();
  redirect.mockClear();
  routerPush.mockClear();
});

afterEach(() => {
  cleanup();
});

function shiftRow(overrides: Partial<ShiftFairnessPersonRowView> = {}): ShiftFairnessPersonRowView {
  return {
    personId: "p_tech",
    personName: "טל טכנאי",
    actualShifts: 4,
    target: 4.3,
    deviation: -0.3,
    status: "balanced",
    weekendActualShifts: 1,
    weekendTarget: 1.2,
    weekendDeviation: -0.2,
    weekendStatus: "balanced",
    dataCompleteness: COMPLETE_FAIRNESS_DATA,
    ...overrides,
  };
}

function shiftModel(overrides: Partial<ShiftFairnessReadModel> = {}): ShiftFairnessReadModel {
  return {
    fetchedAt: "2026-08-15T10:00:00.000Z",
    month: "2026-08",
    periodStartDate: "2026-08-01",
    periodEndDate: "2026-08-15",
    periodStatus: "current",
    groups: [
      { role: "supervisor", rows: [] },
      { role: "technician", rows: [shiftRow()] },
    ],
    ...overrides,
  };
}

function dutyRow(overrides: Partial<DutyFairnessPersonRowView> = {}): DutyFairnessPersonRowView {
  return {
    key: "p_tech-0",
    personId: "p_tech",
    sourceName: "נועה טכנאית",
    allocationLabel: "טכנאי",
    previousScore: 5,
    currentScore: 6,
    delta: 1,
    comparisonTarget: 8,
    gapToTarget: -2,
    normalizedLoad: 0.75,
    status: "below",
    weekendCount: 2,
    exemptions: [],
    dataCompleteness: COMPLETE_FAIRNESS_DATA,
    ...overrides,
  };
}

function dutyModel(overrides: Partial<DutyFairnessReadModel> = {}): DutyFairnessReadModel {
  return {
    fetchedAt: "2026-08-15T10:00:00.000Z",
    fairnessModelVersion: 1,
    period: { key: "h2", year: 2026, label: "7–12/2026", status: "current" },
    targets: { supervisorTarget: 4, technicianTarget: 8 },
    groups: [{ key: "technician", rows: [dutyRow()] }],
    totals: null,
    ...overrides,
  };
}

describe("/fairness — auth failure states", () => {
  it("unauthenticated redirects to /login", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "unauthenticated" });
    await expect(FairnessPage({ searchParams: searchParams() })).rejects.toThrow("REDIRECT:/login");
  });

  it.each(["missing_email", "unmapped", "ambiguous_identity"])("%s shows the generic access-denied screen", async (status) => {
    getRequestShiftFairness.mockResolvedValue({ status });
    await renderFairnessPage();
    expect(screen.getByText("אין לך הרשאה ל-מי-מה-מו")).toBeInTheDocument();
  });

  it("configuration_error shows the configuration error state, not raw exception text", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "configuration_error", message: "boom" });
    await renderFairnessPage();
    expect(screen.getByText("לא ניתן לחשב כרגע את שעות המשמרות")).toBeInTheDocument();
    expect(screen.queryByText("boom")).toBeNull();
  });

  it("a mapped normal (non-manager) user reaches the real page -- no manager requirement anywhere", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel(), person: { isManager: false } });
    await renderFairnessPage();
    expect(screen.getByRole("heading", { name: "טבלת צדק", level: 1 })).toBeInTheDocument();
  });
});

describe("/fairness — C. mode params", () => {
  it("default (no ?mode=) resolves to Shift mode", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    await renderFairnessPage();
    expect(getRequestShiftFairness).toHaveBeenCalled();
    expect(getRequestDutyFairness).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "משמרות" })).toHaveAttribute("aria-selected", "true");
  });

  it("?mode=duties resolves to Duty mode, calling ONLY the duty loader", async () => {
    getRequestDutyFairness.mockResolvedValue({ status: "ok", model: dutyModel() });
    await renderFairnessPage({ mode: "duties" });
    expect(getRequestDutyFairness).toHaveBeenCalled();
    expect(getRequestShiftFairness).not.toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "תורנויות" })).toHaveAttribute("aria-selected", "true");
  });

  it("an invalid ?mode= falls back to the safe default (shifts)", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    await renderFairnessPage({ mode: "combined" });
    expect(getRequestShiftFairness).toHaveBeenCalled();
    expect(getRequestDutyFairness).not.toHaveBeenCalled();
  });

  it("an H1/H2-only ?period= never leaks into Shift mode's own loader call", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    await renderFairnessPage({ period: "h1" });
    expect(getRequestShiftFairness).toHaveBeenCalledWith(null);
  });
});

describe("/fairness — F. Shift cards", () => {
  it("a fully modelable row renders real actual/target/deviation numbers and status", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    const { container } = await renderFairnessPage();
    expect(screen.getByText("טל טכנאי")).toBeInTheDocument();
    expect(container.textContent).toContain("בוצעו 4");
    expect(container.textContent).toContain("יעד 4.3");
    expect(screen.getByText("מאוזן")).toBeInTheDocument();
  });

  it("an unmodelable target never renders 0/מאוזן -- shows the honest unavailable note, actual work stays visible", async () => {
    getRequestShiftFairness.mockResolvedValue({
      status: "ok",
      model: shiftModel({
        groups: [
          { role: "supervisor", rows: [] },
          {
            role: "technician",
            rows: [
              shiftRow({
                target: null,
                deviation: null,
                status: null,
                weekendTarget: null,
                weekendDeviation: null,
                weekendStatus: null,
                dataCompleteness: fairnessDataCompleteness(["shift_target_unmodelable_evidence_only"]),
              }),
            ],
          },
        ],
      }),
    });
    await renderFairnessPage();
    expect(screen.getByText(/בוצעו/).textContent).toContain("4");
    expect(screen.getByText("לא ניתן לחשב יעד מלא לתקופה זו", { exact: false })).toBeInTheDocument();
    expect(screen.queryByText("מאוזן")).toBeNull();
    expect(screen.queryByText(/יעד 0/)).toBeNull();
  });

  it("an empty group is omitted entirely -- never an empty אחמ״שים section", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    await renderFairnessPage();
    expect(screen.queryByText(/אחמ״שים/)).toBeNull();
    expect(screen.getByText(/טכנאים/)).toBeInTheDocument();
  });
});

describe("/fairness — G. Duty cards", () => {
  it("exact statuses are represented correctly", async () => {
    getRequestDutyFairness.mockResolvedValue({ status: "ok", model: dutyModel() });
    await renderFairnessPage({ mode: "duties" });
    expect(screen.getByText("מתחת ליעד")).toBeInTheDocument();
  });

  it("null target -> no fake status, real score still visible", async () => {
    getRequestDutyFairness.mockResolvedValue({
      status: "ok",
      model: dutyModel({
        groups: [{ key: "other", rows: [dutyRow({ allocationLabel: "הסמכה", comparisonTarget: null, gapToTarget: null, status: null })] }],
      }),
    });
    await renderFairnessPage({ mode: "duties" });
    expect(screen.getByText("לא ניתן לחשב יעד מלא")).toBeInTheDocument();
    expect(screen.getByText(/ניקוד/).textContent).toContain("6");
  });

  it("exemptions are visible without hover", async () => {
    getRequestDutyFairness.mockResolvedValue({
      status: "ok",
      model: dutyModel({
        groups: [{ key: "technician", rows: [dutyRow({ exemptions: [{ raw: "מטבח", affectedDutyFamilies: ["daily_kitchen"] }] })] }],
      }),
    });
    await renderFairnessPage({ mode: "duties" });
    expect(screen.getByText("🚫 מטבח")).toBeInTheDocument();
  });

  it("weekend count is preserved", async () => {
    getRequestDutyFairness.mockResolvedValue({ status: "ok", model: dutyModel() });
    await renderFairnessPage({ mode: "duties" });
    expect(screen.getByText(/סופ"שים/).textContent).toContain("2");
  });

  it('a ר"צ row appears in the supervisor section with a null target/status', async () => {
    getRequestDutyFairness.mockResolvedValue({
      status: "ok",
      model: dutyModel({
        groups: [
          {
            key: "supervisor",
            rows: [dutyRow({ personId: "p_ratz", sourceName: "רוני רצ", allocationLabel: 'ר"צ', comparisonTarget: null, gapToTarget: null, status: null })],
          },
        ],
      }),
    });
    await renderFairnessPage({ mode: "duties" });
    expect(screen.getByText(/אחמ״שים/)).toBeInTheDocument();
    expect(screen.getByText("רוני רצ")).toBeInTheDocument();
    expect(screen.getByText("לא ניתן לחשב יעד מלא")).toBeInTheDocument();
  });
});

describe("/fairness — H. person detail", () => {
  it("a valid ?person= for a real loaded row opens the detail overlay with the right name", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    await renderFairnessPage({ person: "p_tech" });
    expect(screen.getByRole("dialog", { name: "טל טכנאי" })).toBeInTheDocument();
  });

  it("an invalid/unknown ?person= is ignored safely -- no overlay, no crash", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel() });
    await renderFairnessPage({ person: "p_does_not_exist" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("cannot select a person absent from the loaded result merely by editing the URL", async () => {
    getRequestDutyFairness.mockResolvedValue({ status: "ok", model: dutyModel() });
    // "p_tech" only exists in the SHIFT fixture, not this duty one.
    await renderFairnessPage({ mode: "duties", person: "p_nonexistent_in_duty_model" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the detail overlay's close control preserves mode/month (a real, href-bearing link back to /fairness)", async () => {
    getRequestShiftFairness.mockResolvedValue({ status: "ok", model: shiftModel({ month: "2026-06" }) });
    await renderFairnessPage({ month: "2026-06", person: "p_tech" });
    const closeLink = screen.getByRole("link", { name: "סגירה" });
    expect(closeLink).toHaveAttribute("href", "/fairness?month=2026-06");
  });

  it("duty mode's close control preserves the period", async () => {
    getRequestDutyFairness.mockResolvedValue({ status: "ok", model: dutyModel({ period: { key: "h1", year: 2026, label: "1–6/2026", status: "closed" } }) });
    await renderFairnessPage({ mode: "duties", period: "h1", person: "p_tech" });
    const closeLink = screen.getByRole("link", { name: "סגירה" });
    expect(closeLink).toHaveAttribute("href", "/fairness?mode=duties&period=h1");
  });
});

describe("/fairness — I. privacy", () => {
  it("no email, sourceSheet, sourceCell, or raw workbook markers ever reach rendered output", async () => {
    getRequestShiftFairness.mockResolvedValue({
      status: "ok",
      model: shiftModel({
        groups: [
          { role: "supervisor", rows: [] },
          { role: "technician", rows: [shiftRow({ personName: "טל טכנאי" })] },
        ],
      }),
    });
    const { container } = await renderFairnessPage({ person: "p_tech" });
    expect(container.innerHTML).not.toContain("@");
    expect(container.innerHTML).not.toContain("sourceSheet");
    expect(container.innerHTML).not.toContain("sourceCell");
  });
});

describe("/fairness — empty states", () => {
  it("no Fairness rows at all -> a calm empty message, not a crash/blank page", async () => {
    getRequestShiftFairness.mockResolvedValue({
      status: "ok",
      model: shiftModel({ groups: [{ role: "supervisor", rows: [] }, { role: "technician", rows: [] }] }),
    });
    await renderFairnessPage();
    expect(screen.getByText("אין נתוני משמרות זמינים לתקופה שנבחרה.")).toBeInTheDocument();
  });
});
