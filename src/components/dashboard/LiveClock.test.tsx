import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { LiveClock } from "./LiveClock";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("LiveClock", () => {
  it("renders HH:mm:ss with tabular numerals, in the Asia/Jerusalem timezone", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T20:21:37.000Z")); // 23:21:37 in Asia/Jerusalem (UTC+3, DST)

    const { container } = render(<LiveClock initialTime="00:00:00" />);
    const timeEl = container.querySelector("time");

    expect(timeEl?.textContent).toBe("23:21:37");
    expect(timeEl).toHaveClass("tabular-nums");
  });

  it("ticks forward with seconds precision every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));

    const { container } = render(<LiveClock initialTime="00:00:00" />);
    const timeEl = () => container.querySelector("time");

    const before = timeEl()?.textContent;
    expect(before).toMatch(/^\d{2}:\d{2}:\d{2}$/);

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    const after = timeEl()?.textContent;

    expect(after).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(after).not.toBe(before);
  });

  it("does not advance until a full second has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));

    const { container } = render(<LiveClock initialTime="00:00:00" />);
    const timeEl = () => container.querySelector("time");

    const before = timeEl()?.textContent;
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(timeEl()?.textContent).toBe(before);
  });
});
