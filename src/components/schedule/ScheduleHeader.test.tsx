import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScheduleHeader } from "./ScheduleHeader";

afterEach(() => {
  cleanup();
});

describe("ScheduleHeader", () => {
  it("shows the page title and the month label", () => {
    render(<ScheduleHeader monthLabel="אוגוסט 2026" monthRangeSubtitle="אב–אלול תשפ״ו" />);
    expect(screen.getByRole("heading", { name: "הלוח שלי" })).toBeInTheDocument();
    expect(screen.getByText("אוגוסט 2026")).toBeInTheDocument();
    expect(screen.getByText("אב–אלול תשפ״ו")).toBeInTheDocument();
  });

  it("omits the Hebrew-calendar subtitle when not cleanly derivable", () => {
    render(<ScheduleHeader monthLabel="ספטמבר 2026" monthRangeSubtitle={null} />);
    expect(screen.getByText("ספטמבר 2026")).toBeInTheDocument();
    expect(screen.queryByText("–")).toBeNull();
  });

  it("keeps the page title as the strongest line", () => {
    render(<ScheduleHeader monthLabel="אוגוסט 2026" monthRangeSubtitle={null} />);
    const heading = screen.getByRole("heading", { name: "הלוח שלי" });
    expect(heading.tagName).toBe("H1");
  });
});
