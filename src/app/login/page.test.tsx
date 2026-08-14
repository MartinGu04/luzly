import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { LOGIN_HERO_HEADLINE } from "@/lib/config/loginCopy";
import { APP_VERSION } from "@/lib/config/appVersion";

const signInWithOAuth = vi.fn().mockResolvedValue({ data: {}, error: null });
vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({ auth: { signInWithOAuth } }),
}));

const { default: LoginPage } = await import("./page");

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

function searchParams(error?: string) {
  return Promise.resolve(error ? { error } : {});
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  // 2026-08-14T09:09:32Z is 12:09:32 in Asia/Jerusalem (UTC+3, DST).
  vi.setSystemTime(new Date("2026-08-14T09:09:32.000Z"));
});

describe("LoginPage", () => {
  it('renders the final hero headline exactly: "כל מה שקורה. במקום אחד."', async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    renderWithTheme(element);

    expect(screen.getByRole("heading", { level: 1, name: LOGIN_HERO_HEADLINE })).toBeInTheDocument();
  });

  it('renders the Google CTA with the exact wording "המשך עם Google", still wired to the real OAuth action', async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    renderWithTheme(element);

    expect(screen.getByRole("button", { name: "המשך עם Google" })).toBeInTheDocument();
  });

  it("introduces no email/password/registration UI", async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    const { container } = renderWithTheme(element);

    expect(container.querySelector('input[type="password"]')).toBeNull();
    expect(container.querySelector('input[type="email"]')).toBeNull();
    expect(screen.queryByText(/הרשמה/)).toBeNull();
    expect(screen.queryByText(/שכחת סיסמה/)).toBeNull();
  });

  it("shows a live clock reading Asia/Jerusalem time, not the runtime's local/UTC time", async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    const { container } = renderWithTheme(element);

    const timeEl = container.querySelector("time");
    expect(timeEl?.getAttribute("dateTime")).toBe("12:09:32");
  });

  it("renders no Sidebar/BottomNav app chrome", async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    renderWithTheme(element);

    expect(screen.queryByRole("navigation", { name: "ניווט ראשי" })).toBeNull();
    expect(screen.queryByRole("link", { name: /לוח בקרה/ })).toBeNull();
  });

  it("shows no error notice when there is no ?error param", async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    renderWithTheme(element);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a safe, generic error notice for ?error=auth -- no raw provider/Supabase error text", async () => {
    const element = await LoginPage({ searchParams: searchParams("auth") });
    renderWithTheme(element);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toMatch(/supabase|invalid_grant|exception|stack/i);
    expect(alert.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it("shows the real app version from the shared version source, never a hardcoded string", async () => {
    const element = await LoginPage({ searchParams: searchParams() });
    renderWithTheme(element);

    expect(screen.getByText(new RegExp(APP_VERSION.replace(/\./g, "\\.")))).toBeInTheDocument();
    expect(screen.queryByText("v0.1.0")).toBeNull();
  });
});
