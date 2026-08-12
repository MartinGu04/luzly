import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Person } from "@/lib/domain/types";

const resolveCurrentPerson = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/auth/resolveCurrentPerson", () => ({ resolveCurrentPerson }));
vi.mock("next/navigation", () => ({ redirect }));

const { default: ProtectedLayout } = await import("./layout");

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p_1",
    name: "דני בדיקה",
    email: "dani@example.invalid",
    isManager: false,
    isTechnician: true,
    isSupervisor: false,
    personnelType: null,
    ...overrides,
  };
}

beforeEach(() => {
  redirect.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("(app) layout — server-side auth gating", () => {
  it("redirects to /login for an unauthenticated visitor, without rendering children", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "unauthenticated" });

    await expect(
      ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> }),
    ).rejects.toThrow("REDIRECT:/login");
  });

  it("20. does not render protected content for an authenticated-but-unmapped user", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "unmapped", email: "stranger@example.invalid" });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    render(element);

    expect(screen.queryByText("SECRET_DASHBOARD_CONTENT")).toBeNull();
    expect(screen.getByText("אין לך הרשאה ל-Luzly")).toBeInTheDocument();
  });

  it("does not reveal personnel names/emails/workbook details on the unmapped-denial screen", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "unmapped", email: "stranger@example.invalid" });

    const element = await ProtectedLayout({ children: <div>x</div> });
    const { container } = render(element);

    expect(container.textContent).not.toContain("stranger@example.invalid");
    expect(container.textContent).not.toContain("@");
  });

  it("offers a sign-out affordance on the unmapped-denial screen", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "unmapped", email: "stranger@example.invalid" });

    const element = await ProtectedLayout({ children: <div>x</div> });
    render(element);

    expect(screen.getByRole("button", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("renders children and the resolved identity for a mapped user", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ok", person: person() });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    render(element);

    expect(screen.getByText("SECRET_DASHBOARD_CONTENT")).toBeInTheDocument();
    expect(screen.getAllByText("דני בדיקה").length).toBeGreaterThan(0);
  });

  it("6. a missing-email authenticated user is NOT redirected to /login (would loop)", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "missing_email" });

    await expect(
      ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> }),
    ).resolves.not.toThrow();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("7. a missing-email user never reaches AppShell/protected content -- same generic denial screen", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "missing_email" });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    render(element);

    expect(screen.queryByText("SECRET_DASHBOARD_CONTENT")).toBeNull();
    expect(screen.getByText("אין לך הרשאה ל-Luzly")).toBeInTheDocument();
  });

  it("an ambiguous-identity user is denied the same way, never redirected, never reaching AppShell", async () => {
    resolveCurrentPerson.mockResolvedValue({ status: "ambiguous_identity" });

    const element = await ProtectedLayout({ children: <div>SECRET_DASHBOARD_CONTENT</div> });
    render(element);

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.queryByText("SECRET_DASHBOARD_CONTENT")).toBeNull();
    expect(screen.getByText("אין לך הרשאה ל-Luzly")).toBeInTheDocument();
  });

  it("the denial screen text is identical for unmapped, missing_email, and ambiguous_identity", async () => {
    const denialStates = [
      { status: "unmapped", email: "stranger@example.invalid" },
      { status: "missing_email" },
      { status: "ambiguous_identity" },
    ];

    const renderedTexts: string[] = [];
    for (const state of denialStates) {
      resolveCurrentPerson.mockResolvedValue(state);
      const element = await ProtectedLayout({ children: <div>x</div> });
      const { container } = render(element);
      renderedTexts.push(container.textContent ?? "");
      cleanup();
    }

    expect(new Set(renderedTexts).size).toBe(1);
  });
});
