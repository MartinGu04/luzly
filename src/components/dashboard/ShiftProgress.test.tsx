import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { AssignmentTiming } from "@/lib/domain/assignmentTiming";
import { ShiftProgress } from "./ShiftProgress";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

type ResolvedTiming = Extract<AssignmentTiming, { status: "resolved" }>;

function resolvedTiming(overrides: Partial<ResolvedTiming> = {}): ResolvedTiming {
  return {
    status: "resolved",
    startLocalTime: "07:30",
    endLocalTime: "19:30",
    durationMinutes: 720,
    elapsedMinutesAtLoad: 0,
    remainingMinutesAtLoad: 720,
    progressPercentAtLoad: 0,
    minutesUntilStartAtLoad: 0,
    ...overrides,
  };
}

const NOW = new Date("2026-08-16T10:00:00.000Z");

beforeEach(() => {
  refresh.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ShiftProgress — current mode, resolvable timing", () => {
  it("1. renders remaining-time text and an accessible progressbar for an active shift", () => {
    render(<ShiftProgress timing={resolvedTiming()} fetchedAt={NOW.toISOString()} mode="current" />);
    expect(screen.getByText(/נשארו/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("exposes proper ARIA progressbar semantics", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 360, progressPercentAtLoad: 50 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar).toHaveAttribute("aria-valuenow", "50");
    expect(bar).toHaveAttribute("aria-label");
  });

  it("shows a non-dominant percentage alongside the remaining-time text", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 360, progressPercentAtLoad: 50 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    expect(screen.getByText("50%")).toBeInTheDocument();
  });
});

describe("ShiftProgress — 3. progress at the beginning, middle, and near end", () => {
  it("at the very start: 0% progress, full duration remaining", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 0, progressPercentAtLoad: 0 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
    expect(screen.getByText(/12 שעות/)).toBeInTheDocument();
  });

  it("in the middle: 50% progress, half the duration remaining", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 360, progressPercentAtLoad: 50 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByText(/6 שעות/)).toBeInTheDocument();
  });

  it("near the end: high progress, only minutes remaining", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 710, progressPercentAtLoad: 99 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "99");
    expect(screen.getByText(/10 דקות/)).toBeInTheDocument();
  });
});

describe("ShiftProgress — 4. clamps safely at shift boundaries", () => {
  it("never exceeds 100% once elapsed time (server + client ticking) reaches the full duration", async () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 715, durationMinutes: 720, progressPercentAtLoad: 99 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000); // 10 more minutes tick client-side
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.queryByText(/-/)).toBeNull();
  });

  it("never shows negative remaining time once the shift is over", async () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 720, durationMinutes: 720, progressPercentAtLoad: 100 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(screen.queryByText(/-/)).toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
  });

  it("triggers exactly one router.refresh() when the shift-end boundary is crossed, never repeatedly", async () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 719, durationMinutes: 720, progressPercentAtLoad: 99 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000); // crosses the boundary
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000); // stays past the boundary
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("ShiftProgress — 5. overnight shift progress", () => {
  it("computes progress correctly for a shift whose display times wrap past midnight (19:30 -> 07:30)", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({
          startLocalTime: "19:30",
          endLocalTime: "07:30",
          durationMinutes: 720,
          elapsedMinutesAtLoad: 240, // 4h into the night shift, now after midnight
          progressPercentAtLoad: 33,
        })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByText(/8 שעות/)).toBeInTheDocument();
  });
});

describe("ShiftProgress — live client-side ticking", () => {
  it("advances remaining time forward as wall-clock time passes, without waiting for a new server render", async () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ elapsedMinutesAtLoad: 0, durationMinutes: 720, progressPercentAtLoad: 0 })}
        fetchedAt={NOW.toISOString()}
        mode="current"
      />,
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000); // 1 hour passes
    });

    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
  });
});

describe("ShiftProgress — upcoming mode (no progress rendered for a future shift)", () => {
  it("2. shows only the starts-in countdown, never a progress bar", () => {
    render(
      <ShiftProgress
        timing={resolvedTiming({ minutesUntilStartAtLoad: 30 })}
        fetchedAt={NOW.toISOString()}
        mode="upcoming"
      />,
    );
    expect(screen.getByText(/מתחיל בעוד/)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders nothing once the upcoming shift's start has already passed at load", () => {
    const { container } = render(
      <ShiftProgress
        timing={resolvedTiming({ minutesUntilStartAtLoad: 0 })}
        fetchedAt={NOW.toISOString()}
        mode="upcoming"
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
