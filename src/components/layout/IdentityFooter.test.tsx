import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { IdentityFooter } from "./IdentityFooter";
import { APP_VERSION } from "@/lib/config/appVersion";
import packageJson from "../../../package.json";

afterEach(() => {
  cleanup();
});

describe("IdentityFooter", () => {
  it("shows the person's name", () => {
    render(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(screen.getByText("דני בדיקה")).toBeInTheDocument();
  });

  it("shows the manager indication only when isManager is true", () => {
    const { rerender } = render(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(screen.queryByText("מנהל/ת")).toBeNull();

    rerender(<IdentityFooter name="נועה מנהלת" isManager={true} />);
    expect(screen.getByText("מנהל/ת")).toBeInTheDocument();
  });

  it("renders a reachable sign-out button", () => {
    render(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(screen.getByRole("button", { name: "התנתקות" })).toBeInTheDocument();
  });

  it("never renders an email anywhere", () => {
    const { container } = render(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(container.textContent).not.toContain("@");
  });

  it("shows the app version, sourced from the real package.json version", () => {
    render(<IdentityFooter name="דני בדיקה" isManager={false} />);
    expect(APP_VERSION).toBe(packageJson.version);
    expect(screen.getByText(new RegExp(packageJson.version.replace(/\./g, "\\.")))).toBeInTheDocument();
  });
});
