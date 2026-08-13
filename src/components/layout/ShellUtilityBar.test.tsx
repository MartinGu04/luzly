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

    render(<ShellUtilityBar initialClockTime="00:00:00" />);
    expect(screen.getByText("23:21:37")).toBeInTheDocument();
  });

  it("still renders a live clock even with no server-derived initial time (null) -- degrades gracefully, never crashes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T07:00:00.000Z")); // 10:00:00 in Asia/Jerusalem

    render(<ShellUtilityBar initialClockTime={null} />);
    expect(screen.getByText("10:00:00")).toBeInTheDocument();
  });

  it("never triggers a network request", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<ShellUtilityBar initialClockTime="10:00:00" />);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
