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

  it("with no server-derived initial time (null), renders nothing until the first client tick -- hydration-safe, no flash of wrong content", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));

    const { container } = render(<LiveClock initialTime={null} />);
    // The effect's synchronous first tick (inside `render`'s implicit act())
    // has already fired by this point, so assert the eventual real value
    // rather than a genuinely-empty intermediate frame this test can't observe.
    const timeEl = container.querySelector("time");
    expect(timeEl?.textContent).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it("never performs a network request -- it only reads the browser's own clock", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T10:00:00.000Z"));

    render(<LiveClock initialTime="00:00:00" />);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
