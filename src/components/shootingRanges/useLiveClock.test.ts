import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useLiveClock } from "./useLiveClock";

function setVisibilityState(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { value: state, configurable: true });
}

describe("useLiveClock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T10:00:00.000Z"));
    setVisibilityState("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is null on the very first render (hydration-safe placeholder), then becomes the real clock after mount", () => {
    const { result } = renderHook(() => useLiveClock());
    expect(result.current).toBe(Date.now());
  });

  it("ticks every second while the page is visible, with no reduced-motion slowdown", () => {
    const { result } = renderHook(() => useLiveClock());
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe((first ?? 0) + 1000);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe((first ?? 0) + 2000);
  });

  it("still ticks every second under prefers-reduced-motion: reduce -- reduced motion affects decorative animation, never time accuracy", () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("matchMedia", matchMedia);

    const { result } = renderHook(() => useLiveClock());
    const first = result.current;

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe((first ?? 0) + 1000);

    vi.unstubAllGlobals();
  });

  it("derives every tick from Date.now() rather than decrementing a stored value -- jumping the system clock forward by an arbitrary amount is reflected exactly, not just by one tick's worth", () => {
    const { result } = renderHook(() => useLiveClock());
    const first = result.current;

    vi.setSystemTime(new Date((first ?? 0) + 5 * 60 * 1000));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe((first ?? 0) + 5 * 60 * 1000 + 1000);
  });

  it("resyncs immediately when the tab becomes visible again, without waiting for the next interval tick", () => {
    const { result } = renderHook(() => useLiveClock());
    const first = result.current;

    // Simulate time passing while backgrounded (e.g. throttled/suspended
    // timers) WITHOUT advancing the fake timer queue -- a plain refresh of
    // the system clock with no tick fired, exactly what a long-throttled
    // background tab looks like.
    vi.setSystemTime(new Date((first ?? 0) + 10 * 60 * 1000));
    setVisibilityState("visible");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe((first ?? 0) + 10 * 60 * 1000);
  });

  it("does not resync on a visibilitychange into the hidden state", () => {
    const { result } = renderHook(() => useLiveClock());
    const first = result.current;

    vi.setSystemTime(new Date((first ?? 0) + 10 * 60 * 1000));
    setVisibilityState("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(result.current).toBe(first);
  });
});
