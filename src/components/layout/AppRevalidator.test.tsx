import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { AppRevalidator } from "./AppRevalidator";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    value: state,
    writable: true,
    configurable: true,
  });
}

function fireVisibilityChange() {
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  refresh.mockReset();
  setVisibility("visible");
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AppRevalidator — initial mount", () => {
  it("1. never refreshes immediately on mount, even though the tab is visible", () => {
    render(<AppRevalidator />);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("renders nothing", () => {
    const { container } = render(<AppRevalidator />);
    expect(container.firstChild).toBeNull();
  });
});

describe("AppRevalidator — return from background", () => {
  it("2. revalidates when the document returns to visible", () => {
    render(<AppRevalidator />);
    setVisibility("visible");
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("3. remaining hidden triggers no refresh", () => {
    render(<AppRevalidator />);
    setVisibility("hidden");
    act(() => fireVisibilityChange());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a hidden->visible transition after a real background stint refreshes exactly once", () => {
    render(<AppRevalidator />);
    setVisibility("hidden");
    act(() => fireVisibilityChange());
    expect(refresh).not.toHaveBeenCalled();

    setVisibility("visible");
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("AppRevalidator — periodic refresh while visible", () => {
  it("4. refreshes after the configured visible interval elapses", async () => {
    render(<AppRevalidator />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("5. periodic refresh pauses while hidden -- no refresh fires even once the interval elapses", async () => {
    setVisibility("hidden");
    render(<AppRevalidator />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("resumes periodic refreshing once visible again after a hidden interval tick", async () => {
    setVisibility("hidden");
    render(<AppRevalidator />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).not.toHaveBeenCalled();

    setVisibility("visible");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("AppRevalidator — deduplication / cooldown", () => {
  it("6. visibilitychange + focus + pageshow firing together cause exactly one refresh", () => {
    render(<AppRevalidator />);
    act(() => {
      fireVisibilityChange();
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("pageshow"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("7. a second automatic trigger within the cooldown window does not start another refresh", async () => {
    render(<AppRevalidator />);
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    // Still well inside the cooldown window.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("allows a new automatic refresh once the cooldown window has fully elapsed", async () => {
    render(<AppRevalidator />);
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("the periodic interval does not overlap a refresh that just fired on resume", async () => {
    render(<AppRevalidator />);
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    // The 5-minute interval elapses well outside the cooldown window, so it fires normally.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("AppRevalidator — cleanup", () => {
  it("8. removes its event listeners and clears its interval on unmount", async () => {
    const addSpy = vi.spyOn(document, "addEventListener");
    const removeSpy = vi.spyOn(document, "removeEventListener");
    const { unmount } = render(<AppRevalidator />);
    expect(addSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    unmount();
    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));

    // No further refresh should ever fire post-unmount, even past the interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
    });
    act(() => fireVisibilityChange());
    expect(refresh).not.toHaveBeenCalled();

    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});

describe("AppRevalidator — never fetches directly", () => {
  it("10. never performs a direct fetch/XHR call itself, across every trigger path", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response());
    render(<AppRevalidator />);
    act(() => fireVisibilityChange());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
