import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import type { PersonalProfile } from "@/lib/readModels/types";

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

const getRequestPersonalSchedule = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/readModels/getRequestPersonalSchedule", () => ({ getRequestPersonalSchedule }));
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/" }));

const { default: ProtectedLayout } = await import("./layout");

function profile(overrides: Partial<PersonalProfile> = {}): PersonalProfile {
  return {
    id: "p_1",
    name: "דני בדיקה",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

function okResult(person: PersonalProfile) {
  return {
    status: "ok" as const,
    model: {
      person,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      localNow: { date: "2026-08-12", minuteOfDay: 600 },
      todayEvents: [],
      upcomingEvents: [],
      currentAssignments: [],
      nextAssignmentGroup: null,
      currentShiftContexts: [],
      nextShiftContexts: [],
      issues: [],
      dutyBlocks: [],
      dutyActions: [],
    },
  };
}

beforeEach(() => {
  redirect.mockClear();
  getRequestPersonalSchedule.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("(app) layout — server-side auth gating", () => {
  it("redirects to /login for an unauthenticated visitor, without rendering children", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unauthenticated" });

    await expect(
      ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("20. does not render protected content for an authenticated-but-unmapped user", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unmapped" });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    renderWithTheme(element);

    expect(screen.queryByText("SECRET_DASHBOARD_CONTENT")).toBeNull();
    expect(screen.getByText("אין לך הרשאה ל-Luzly")).toBeInTheDocument();
  });

  it("does not reveal personnel names/emails/workbook details on the unmapped-denial screen", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unmapped" });

    const element = await ProtectedLayout({ children: <div>x</div> });
    const { container } = renderWithTheme(element);

    expect(container.textContent).not.toContain("stranger@example.invalid");
    expect(container.textContent).not.toContain("@");
  });

  it("offers a sign-out affordance on the unmapped-denial screen", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "unmapped" });

    const element = await ProtectedLayout({ children: <div>x</div> });
    renderWithTheme(element);

    expect(screen.getByRole("button", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("renders children and the resolved identity for a mapped user", async () => {
    getRequestPersonalSchedule.mockResolvedValue(okResult(profile()));

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    renderWithTheme(element);

    expect(screen.getByText("SECRET_DASHBOARD_CONTENT")).toBeInTheDocument();
    expect(screen.getAllByText("דני בדיקה").length).toBeGreaterThan(0);
  });

  it("6. a missing-email authenticated user is NOT redirected to /login (would loop)", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "missing_email" });

    await expect(
      ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> }),
    ).resolves.not.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("7. a missing-email user never reaches AppShell/protected content -- same generic denial screen", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "missing_email" });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    renderWithTheme(element);

    expect(screen.queryByText("SECRET_DASHBOARD_CONTENT")).toBeNull();
    expect(screen.getByText("אין לך הרשאה ל-Luzly")).toBeInTheDocument();
  });

  it("an ambiguous-identity user is denied the same way, never redirected, never reaching AppShell", async () => {
    getRequestPersonalSchedule.mockResolvedValue({ status: "ambiguous_identity" });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    renderWithTheme(element);

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByText("SECRET_DASHBOARD_CONTENT")).toBeNull();
    expect(screen.getByText("אין לך הרשאה ל-Luzly")).toBeInTheDocument();
  });

  it("the denial screen text is identical for unmapped, missing_email, and ambiguous_identity", async () => {
    const denialStates = [
      { status: "unmapped" },
      { status: "missing_email" },
      { status: "ambiguous_identity" },
    ];

    const renderedTexts: string[] = [];
    for (const state of denialStates) {
      getRequestPersonalSchedule.mockResolvedValue(state);
      const element = await ProtectedLayout({ children: <div>x</div> });
      const { container } = renderWithTheme(element);
      renderedTexts.push(container.textContent ?? "");
      cleanup();
    }

    expect(new Set(renderedTexts).size).toBe(1);
  });

  it("a configuration_error still renders the app shell with the resolved identity (authorized, just a broken schedule config)", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: "Missing shift start time configuration.",
      person: profile({ name: "נועה דוגמה" }),
    });

    const element = await ProtectedLayout({ children: <div>DASHBOARD_CONTENT_AREA</div> });
    renderWithTheme(element);

    expect(screen.getByText("DASHBOARD_CONTENT_AREA")).toBeInTheDocument();
    expect(screen.getAllByText("נועה דוגמה").length).toBeGreaterThan(0);
  });

  it("never renders the raw configuration_error message text", async () => {
    getRequestPersonalSchedule.mockResolvedValue({
      status: "configuration_error",
      message: 'Missing shift start time configuration ("תחילת משמרת יום").',
      person: profile(),
    });

    const element = await ProtectedLayout({ children: <div>x</div> });
    const { container } = renderWithTheme(element);

    expect(container.textContent).not.toContain("תחילת משמרת יום");
    expect(container.textContent).not.toContain("Missing shift start time");
  });
});
