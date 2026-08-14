import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { APP_NAME } from "@/lib/config/productName";
import { MobileIdentityBar } from "./MobileIdentityBar";

afterEach(() => {
  cleanup();
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("MobileIdentityBar", () => {
  it("shows the APP_NAME identity, not the user's name, permanently in the header", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.getByText(APP_NAME)).toBeInTheDocument();
    expect(screen.queryByText("דני בדיקה")).toBeNull();
  });

  it("the Avatar is the profile-menu trigger, with an accessible name mentioning the user", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.getByRole("button", { name: /דני בדיקה/ })).toHaveAttribute("aria-haspopup", "menu");
  });

  it("shows the future notification Bell affordance with no fake unread count", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    const bell = screen.getByRole("button", { name: /התראות/ });
    expect(bell).toBeDisabled();
    expect(bell.textContent).toBe("");
  });

  it("never renders a 3-button theme segmented control directly in the header", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.queryByRole("radiogroup", { name: "ערכת נושא" })).toBeNull();
  });

  it("never shows sign-out permanently in the closed header", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} avatarUrl={null} />);
    expect(screen.queryByRole("button", { name: "התנתקות" })).toBeNull();
  });
});
