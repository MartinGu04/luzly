import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { EventLiveProgress } from "./EventLiveProgress";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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

describe("EventLiveProgress — countdown mode, more than 24h away", () => {
  it("renders nothing", () => {
    const startInstant = new Date(NOW.getTime() + 25 * 60 * 60_000).toISOString();
    const { container } = render(
      <EventLiveProgress startInstant={startInstant} endInstant={null} mode="countdown" fetchedAt={NOW.toISOString()} />,
    );
    expect(container.firstChild).toBeNull();
  });
});

describe("EventLiveProgress — countdown mode, within 24h", () => {
  it("shows a countdown and a non-interactive progressbar at exactly 24h", () => {
    const startInstant = new Date(NOW.getTime() + 24 * 60 * 60_000).toISOString();
    render(<EventLiveProgress startInstant={startInstant} endInstant={null} mode="countdown" fetchedAt={NOW.toISOString()} />);
    expect(screen.getByText(/מתחיל בעוד/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(bar.tagName).not.toBe("INPUT");
  });

  it("shows ~50% progress at 12h before start", () => {
    const startInstant = new Date(NOW.getTime() + 12 * 60 * 60_000).toISOString();
    render(<EventLiveProgress startInstant={startInstant} endInstant={null} mode="countdown" fetchedAt={NOW.toISOString()} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("advances the countdown forward as wall-clock time passes, without a new server render", async () => {
    const startInstant = new Date(NOW.getTime() + 12 * 60 * 60_000).toISOString();
    render(<EventLiveProgress startInstant={startInstant} endInstant={null} mode="countdown" fetchedAt={NOW.toISOString()} />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000); // 1 hour passes
    });

    expect(Number(screen.getByRole("progressbar").getAttribute("aria-valuenow"))).toBeGreaterThan(50);
  });

  it("triggers exactly one router.refresh() once the start boundary is crossed", async () => {
    const startInstant = new Date(NOW.getTime() + 60_000).toISOString(); // starts in 1 minute
    render(<EventLiveProgress startInstant={startInstant} endInstant={null} mode="countdown" fetchedAt={NOW.toISOString()} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2 * 60_000);
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("EventLiveProgress — active mode", () => {
  it("shows remaining-time text and progress through the event", () => {
    const startInstant = new Date(NOW.getTime() - 4 * 60 * 60_000).toISOString();
    const endInstant = new Date(NOW.getTime() + 4 * 60 * 60_000).toISOString();
    render(<EventLiveProgress startInstant={startInstant} endInstant={endInstant} mode="active" fetchedAt={NOW.toISOString()} />);
    expect(screen.getByText(/נשארו/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
  });

  it("never renders a stale 100% once the event has already ended at load", async () => {
    const startInstant = new Date(NOW.getTime() - 8 * 60 * 60_000).toISOString();
    const endInstant = new Date(NOW.getTime() - 60_000).toISOString(); // ended a minute ago
    render(<EventLiveProgress startInstant={startInstant} endInstant={endInstant} mode="active" fetchedAt={NOW.toISOString()} />);

    // Rendered once at 100%/0 remaining while the boundary-crossed refresh fires -- never negative, never past 100.
    const bar = screen.getByRole("progressbar");
    expect(Number(bar.getAttribute("aria-valuenow"))).toBe(100);
    expect(screen.queryByText(/-/)).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
