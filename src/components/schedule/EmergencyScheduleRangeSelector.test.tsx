import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmergencyScheduleRangeSelector } from "./EmergencyScheduleRangeSelector";

afterEach(() => {
  cleanup();
});

describe("EmergencyScheduleRangeSelector", () => {
  it("renders all four range options with the exact requested Hebrew labels", () => {
    render(<EmergencyScheduleRangeSelector basePath="/schedule" personId={null} currentRange="7d" />);
    expect(screen.getByRole("link", { name: "היום" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "מחר" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "7 ימים" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30 יום" })).toBeInTheDocument();
  });

  it("the default range (7 ימים) omits ?range= from its own link, matching a bare basePath", () => {
    render(<EmergencyScheduleRangeSelector basePath="/schedule" personId={null} currentRange="7d" />);
    expect(screen.getByRole("link", { name: "7 ימים" })).toHaveAttribute("href", "/schedule");
  });

  it("every non-default range carries its own ?range= value", () => {
    render(<EmergencyScheduleRangeSelector basePath="/schedule" personId={null} currentRange="7d" />);
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("href", "/schedule?range=today");
    expect(screen.getByRole("link", { name: "מחר" })).toHaveAttribute("href", "/schedule?range=tomorrow");
    expect(screen.getByRole("link", { name: "30 יום" })).toHaveAttribute("href", "/schedule?range=30d");
  });

  it("marks the currently active range with aria-current", () => {
    render(<EmergencyScheduleRangeSelector basePath="/schedule" personId={null} currentRange="today" />);
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "מחר" })).not.toHaveAttribute("aria-current");
  });

  it("the active tab carries a visible ring, matching ManagerRangeSelector's own contrast treatment", () => {
    render(<EmergencyScheduleRangeSelector basePath="/schedule" personId={null} currentRange="today" />);
    expect(screen.getByRole("link", { name: "היום" }).className).toContain("ring-1");
    expect(screen.getByRole("link", { name: "מחר" }).className).not.toContain("ring-1");
  });

  it("preserves the selected colleague (?person=) across every range link", () => {
    render(<EmergencyScheduleRangeSelector basePath="/schedule" personId="p_1" currentRange="7d" />);
    expect(screen.getByRole("link", { name: "30 יום" })).toHaveAttribute("href", "/schedule?person=p_1&range=30d");
    expect(screen.getByRole("link", { name: "7 ימים" })).toHaveAttribute("href", "/schedule?person=p_1");
  });

  it("works identically against the /manager base path", () => {
    render(<EmergencyScheduleRangeSelector basePath="/manager" personId={null} currentRange="today" />);
    expect(screen.getByRole("link", { name: "היום" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "30 יום" })).toHaveAttribute("href", "/manager?range=30d");
  });
});
