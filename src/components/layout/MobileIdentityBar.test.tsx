import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { MobileIdentityBar } from "./MobileIdentityBar";

afterEach(() => {
  cleanup();
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("MobileIdentityBar", () => {
  it("shows the name and a sign-out affordance", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} />);
    expect(screen.getByText("דני בדיקה")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("a non-manager sees no manager shortcut at all", () => {
    renderWithTheme(<MobileIdentityBar name="דני בדיקה" isManager={false} />);
    expect(screen.queryByRole("link", { name: "מבט מנהל" })).toBeNull();
  });

  it("a manager sees the manager shortcut, linking to /manager", () => {
    renderWithTheme(<MobileIdentityBar name="דני מנהל" isManager={true} />);
    const link = screen.getByRole("link", { name: "מבט מנהל" });
    expect(link).toHaveAttribute("href", "/manager");
  });

  it("shows the מנהל/ת marker for a manager", () => {
    renderWithTheme(<MobileIdentityBar name="דני מנהל" isManager={true} />);
    expect(screen.getByText("מנהל/ת")).toBeInTheDocument();
  });
});
