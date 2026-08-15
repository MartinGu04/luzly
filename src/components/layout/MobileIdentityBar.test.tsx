import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { APP_NAME } from "@/lib/config/productName";
import { MobileIdentityBar } from "./MobileIdentityBar";

afterEach(() => {
  cleanup();
});

async function renderWithTheme(ui: ReactElement) {
  const result = render(<ThemeProvider>{ui}</ThemeProvider>);
  // Flushes NotificationBell's async on-mount capability/status check
  // (jsdom has no real Notification/serviceWorker, so it settles into
  // "unsupported" quickly) -- avoids an act() warning from that state
  // update landing after this render call returns.
  await act(async () => {});
  return result;
}

describe("MobileIdentityBar", () => {
  it("shows the APP_NAME identity, not the user's name, permanently in the header", async () => {
    await renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.queryByText("דני בדיקה")).toBeNull();
  });

  it("the Avatar is the profile-menu trigger, with an accessible name mentioning the user", async () => {
    await renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.getByRole("button", { name: /דני בדיקה/ })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("shows a real, enabled notification Bell control (PR #29) -- no longer the disabled 'בקרוב' placeholder", async () => {
    await renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const bell = screen.getByRole("button", { name: "התראות" });
    expect(bell).not.toBeDisabled();
  });

  it("opens a notification popover when the Bell is clicked", async () => {
    await renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    fireEvent.click(screen.getByRole("button", { name: "התראות" }));
    expect(screen.getByRole("dialog", { name: "הגדרות התראות" })).toBeInTheDocument();
  });

  it("never renders a 3-button theme segmented control directly in the header", async () => {
    await renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.queryByRole("radiogroup", { name: "ערכת נושא" })).toBeNull();
  });

  it("never shows sign-out permanently in the closed header", async () => {
    await renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.queryByRole("button", { name: "התנתקות" })).toBeNull();
  });

  it("PR #23: shows the מי-מה-מו brand symbol next to the wordmark, and never the retired 'Luzly' name", async () => {
    const { container } = await renderWithTheme(
      <MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />,
    );
    expect(container.querySelector('img[src*="symbol.png"]')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/luzly/i);
  });
});
