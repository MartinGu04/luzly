import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerProblemsToggle } from "./ManagerProblemsToggle";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";

afterEach(() => {
  cleanup();
});

const BASE: ManagerHrefParams = { personId: null, range: "7d", month: null, problemsOnly: false };

describe("ManagerProblemsToggle", () => {
  it("off: shows 'הצג רק בעיות' and links to turn it on", () => {
    render(<ManagerProblemsToggle current={BASE} />);
    const link = screen.getByRole("link", { name: "הצג רק בעיות" });
    expect(link).toHaveAttribute("href", "/manager?problems=1");
    expect(link).toHaveAttribute("aria-pressed", "false");
  });

  it("on: shows 'כל המידע' and links to turn it off", () => {
    render(<ManagerProblemsToggle current={{ ...BASE, problemsOnly: true }} />);
    const link = screen.getByRole("link", { name: "כל המידע" });
    expect(link).toHaveAttribute("href", "/manager");
    expect(link).toHaveAttribute("aria-pressed", "true");
  });
});
