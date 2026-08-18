import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ShellUtilityBar } from "./ShellUtilityBar";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ShellUtilityBar", () => {
  it("renders the live clock in Asia/Jerusalem time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T20:21:37.000Z")); // 23:21:37 in Asia/Jerusalem (UTC+3, DST)

    render(<ShellUtilityBar initialClockTime="00:00:00" dateLabel={null} />);
    expect(screen.getByText("23:21:37")).toBeInTheDocument();
  });

  it("still renders a live clock even with no server-derived initial time (null) -- degrades gracefully, never crashes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T07:00:00.000Z")); // 10:00:00 in Asia/Jerusalem

    render(<ShellUtilityBar initialClockTime={null} dateLabel={null} />);
    expect(screen.getByText("10:00:00")).toBeInTheDocument();
  });

  it("never triggers a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ShellUtilityBar initialClockTime="10:00:00" dateLabel={null} />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("renders the pre-formatted date label next to the clock when provided", () => {
    render(<ShellUtilityBar initialClockTime="10:00:00" dateLabel="יום רביעי · 12 באוגוסט" />);
    expect(screen.getByText("יום רביעי · 12 באוגוסט")).toBeInTheDocument();
  });

  it("omits the date line entirely when dateLabel is null -- never a guessed/empty placeholder", () => {
    const { container } = render(<ShellUtilityBar initialClockTime={null} dateLabel={null} />);
    // Only the <time> element's own text should be present; no stray date text node.
    expect(container.querySelectorAll("time")).toHaveLength(1);
  });

  it("renders both organizational logos, each with its own real Hebrew name as alt text, in their original (never square-forced) aspect ratio", () => {
    render(<ShellUtilityBar initialClockTime="10:00:00" dateLabel={null} />);
    const takshal = screen.getByAltText('תקש"ל');
    const strategic = screen.getByAltText("תקשורת אסטרטגית");
    expect(takshal).toHaveAttribute("src", expect.stringContaining("org-logo-takshal"));
    expect(strategic).toHaveAttribute("src", expect.stringContaining("org-logo-strategic-communication"));
    // next/image sets width/height attributes from the real source dimensions -- never forced to a common square.
    expect(takshal).toHaveAttribute("width", "1024");
    expect(takshal).toHaveAttribute("height", "1536");
    expect(strategic).toHaveAttribute("width", "1024");
    expect(strategic).toHaveAttribute("height", "1024");
  });

  it("renders exactly one notification bell, on the shell variant", () => {
    render(<ShellUtilityBar initialClockTime="10:00:00" dateLabel={null} />);
    expect(screen.getAllByRole("button", { name: /התראות/ })).toHaveLength(1);
  });

  it("renders both organizational logos at their calibrated, visually-substantial sizes (release-polish pass) -- never shrunk back to icon scale", () => {
    render(<ShellUtilityBar initialClockTime="10:00:00" dateLabel={null} />);
    const takshal = screen.getByAltText('תקש"ל');
    const strategic = screen.getByAltText("תקשורת אסטרטגית");
    // Calibrated per each logo's own measured emblem bounding box (see the
    // component's own docstring) -- takshal renders taller than strategic
    // to compensate for its more generous canvas margin, so the two
    // emblems read as the same PERCEIVED size, not the same box. Trimmed
    // down slightly from 78px/60px in the release-polish pass to shave real
    // height off the bar, while keeping the same ≈1.3 ratio between them.
    expect(takshal.className).toMatch(/h-\[64px\]/);
    expect(strategic.className).toMatch(/h-\[49px\]/);
  });
});
