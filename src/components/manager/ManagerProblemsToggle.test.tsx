import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerProblemsToggle } from "./ManagerProblemsToggle";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";

afterEach(() => {
  cleanup();
});

const BASE: ManagerHrefParams = { personId: null, range: "7d", month: null, problemsOnly: false };

describe("ManagerProblemsToggle", () => {
  it("off: shows the strong outlined 'הצג רק בעיות' attention treatment and links to turn it on", () => {
    render(<ManagerProblemsToggle current={BASE} />);
    const link = screen.getByRole("link", { name: "הצג רק בעיות" });
    expect(link).toHaveAttribute("href", "/manager?problems=1");
    expect(link).toHaveAttribute("aria-pressed", "false");
  });

  it("on: shows the filled critical 'מציג רק בעיות' treatment with an obvious 'כל המידע' way back, links to turn it off", () => {
    render(<ManagerProblemsToggle current={{ ...BASE, problemsOnly: true }} />);
    expect(screen.getByText("מציג רק בעיות")).toBeInTheDocument();
    const link = screen.getByText("כל המידע").closest("a");
    expect(link).toHaveAttribute("href", "/manager");
    expect(link).toHaveAttribute("aria-pressed", "true");
  });

  it("preserves other params (range/person/month) when turning problems-only on", () => {
    render(
      <ManagerProblemsToggle current={{ personId: "p1", range: "month", month: "2026-08", problemsOnly: false }} />,
    );
    const link = screen.getByRole("link", { name: "הצג רק בעיות" });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("person=p1");
    expect(href).toContain("range=month");
    expect(href).toContain("month=2026-08");
    expect(href).toContain("problems=1");
  });
});
