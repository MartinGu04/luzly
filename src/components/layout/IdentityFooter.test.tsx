import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { IdentityFooter } from "./IdentityFooter";
import { APP_VERSION } from "@/lib/config/appVersion";
import packageJson from "../../../package.json";

afterEach(() => {
  cleanup();
});

function renderWithTheme(ui: ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe("IdentityFooter", () => {
  it("shows the person's name", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(screen.getByText("דני בדיקה")).toBeInTheDocument();
  });

  it("shows the manager indication only when isManager is true", () => {
    const { rerender } = render(
      <ThemeProvider>
        <IdentityFooter name="דני בדיקה" isManager={false} />
      </ThemeProvider>,
    );
    expect(screen.queryByText("מנהל/ת")).toBeNull();

    rerender(
      <ThemeProvider>
        <IdentityFooter name="נועה מנהלת" isManager={true} />
      </ThemeProvider>,
    );
    expect(screen.getByText("מנהל/ת")).toBeInTheDocument();
  });

  it("renders a reachable sign-out button", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(screen.getByRole("button", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("never renders an email anywhere", () => {
    const { container } = renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(container.textContent).not.toContain("@");
  });

  it("shows the app version, sourced from the real package.json version", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(APP_VERSION).toBe(packageJson.version);
    expect(screen.getByText(new RegExp(packageJson.version.replace(/\./g, "\\.")))).toBeInTheDocument();
  });

  it("renders the theme control (sidebar/mobile-nav refinement pass -- moved here from the top of the rail)", () => {
    renderWithTheme(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(screen.getByRole("radiogroup", { name: "ערכת נושא" })).toBeInTheDocument();
  });
});
