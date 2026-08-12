import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Header } from "./Header";

afterEach(() => {
  cleanup();
});

describe("Header — date line", () => {
  it("shows the Gregorian weekday/date and the Hebrew calendar date together", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-08-12", minuteOfDay: 10 * 60 }} />);
    expect(screen.getByText("יום רביעי · 12 באוגוסט · כ״ט באב תשפ״ו")).toBeInTheDocument();
  });

  it("keeps the greeting as the visually dominant line, date/holiday as secondary text", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-08-12", minuteOfDay: 10 * 60 }} />);
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.className).toMatch(/font-bold/);
    const dateLine = screen.getByText("יום רביעי · 12 באוגוסט · כ״ט באב תשפ״ו");
    expect(dateLine.className).toMatch(/text-muted/);
  });
});

describe("Header — holiday context", () => {
  it("shows no holiday chip on an ordinary day", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-08-12", minuteOfDay: 10 * 60 }} />);
    expect(screen.queryByText("🍎")).toBeNull();
  });

  it("shows an Erev-holiday chip distinct from the holiday itself", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-09-11", minuteOfDay: 10 * 60 }} />);
    expect(screen.getByText("ערב ראש השנה")).toBeInTheDocument();
  });

  it("shows the holiday chip on the holiday's own date", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-09-12", minuteOfDay: 10 * 60 }} />);
    expect(screen.getByText("ראש השנה")).toBeInTheDocument();
    expect(screen.getByText("🍎")).toBeInTheDocument();
  });

  it("never shows more than one holiday chip", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-12-08", minuteOfDay: 10 * 60 }} />);
    expect(screen.getAllByText("🕎")).toHaveLength(1);
  });

  it("places the holiday chip on its own line, above the date line, never inline with it", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-09-11", minuteOfDay: 10 * 60 }} />);
    const chip = screen.getByText("ערב ראש השנה").closest("span");
    const dateLine = screen.getByText("יום שישי · 11 בספטמבר · כ״ט באלול תשפ״ו");

    // The chip is not inside the date paragraph, and it precedes it in the DOM.
    expect(dateLine.contains(chip)).toBe(false);
    expect(chip?.compareDocumentPosition(dateLine)).toBeTruthy();
    const position = chip!.compareDocumentPosition(dateLine);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moves the date line directly under the greeting with no extra gap when there is no holiday", () => {
    render(<Header personName="דני בדיקה" localNow={{ date: "2026-08-12", minuteOfDay: 10 * 60 }} />);
    const dateLine = screen.getByText("יום רביעי · 12 באוגוסט · כ״ט באב תשפ״ו");
    expect(dateLine.className).toMatch(/mt-1\.5/);
  });
});
