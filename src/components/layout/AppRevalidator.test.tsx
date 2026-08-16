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

/** A genuine BFCache-restore pageshow -- `event.persisted === true`. */
function firePersistedPageShow() {
  const event = new Event("pageshow");
  Object.defineProperty(event, "persisted", { value: true, configurable: true });
  window.dispatchEvent(event);
}

/** An ordinary (non-BFCache) pageshow, as fires on every normal navigation/first paint. */
function fireOrdinaryPageShow() {
  window.dispatchEvent(new Event("pageshow"));
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

describe("AppRevalidator — pageshow: BFCache only, never a generic resume signal", () => {
  it("an initial/non-persisted pageshow never triggers a refresh", () => {
    render(<AppRevalidator />);
    act(() => fireOrdinaryPageShow());
    expect(refresh).not.toHaveBeenCalled();
  });

  it("a persisted (genuine BFCache restore) pageshow does trigger a refresh", () => {
    render(<AppRevalidator />);
    act(() => firePersistedPageShow());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("ordinary window focus never triggers a refresh -- visibilitychange is the primary resume signal", () => {
    render(<AppRevalidator />);
    act(() => window.dispatchEvent(new Event("focus")));
    expect(refresh).not.toHaveBeenCalled();
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

  it("resumes periodic refreshing once a real visibilitychange to visible fires after a hidden interval tick", async () => {
    setVisibility("hidden");
    render(<AppRevalidator />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).not.toHaveBeenCalled();

    // A real resume always fires the event -- this is what re-arms the
    // periodic schedule (see AppRevalidator's own docstring).
    setVisibility("visible");
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("resume at 4m50s does not cause another periodic refresh 10s later (at the old mount-anchored 5m00s mark)", async () => {
    render(<AppRevalidator />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000 + 50_000); // 4:50
    });
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    // 10 more seconds lands exactly on the OLD mount-anchored 5:00 mark --
    // must not fire again there.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("periodic refresh eventually occurs ~5 minutes after the last automatic revalidation, not 5 minutes after mount", async () => {
    render(<AppRevalidator />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000 + 50_000); // 4:50
    });
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    // Advance the remaining ~5 minutes from THIS trigger (i.e. past the
    // rescheduled 9:50 mark), not just past the original 5:00 mount mark.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("AppRevalidator — deduplication / cooldown", () => {
  it("6. visibilitychange + a persisted pageshow firing together cause exactly one refresh", () => {
    render(<AppRevalidator />);
    act(() => {
      fireVisibilityChange();
      firePersistedPageShow();
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
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("allows a new automatic refresh once the cooldown window has fully elapsed", async () => {
    render(<AppRevalidator />);
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("the periodic timer does not overlap a refresh that just fired on resume right after mount", async () => {
    render(<AppRevalidator />);
    act(() => fireVisibilityChange());
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe("AppRevalidator — cleanup", () => {
  it("8. removes its event listeners and clears its periodic timer on unmount", async () => {
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
