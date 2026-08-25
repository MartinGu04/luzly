import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QualificationLiveCard, type QualificationLiveCardProps } from "./QualificationLiveCard";

function props(overrides: Partial<QualificationLiveCardProps> = {}): QualificationLiveCardProps {
  return {
    status: "valid",
    baselineDateLabel: "01/03/2026",
    expiryDateLabel: "01/09/2026",
    startInstantIso: "2026-03-01T00:00:00.000Z",
    expiryInstantIso: "2026-09-01T00:00:00.000Z",
    initialDaysRemaining: 5,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QualificationLiveCard", () => {
  it("shows the seconds figure ticking upward every second without a page reload -- reproduces the reported 'looks frozen' bug", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.500Z"));
    render(<QualificationLiveCard {...props({ expiryInstantIso: "2026-08-30T00:00:00.000Z" })} />);

    const before = screen.getByText(/שניות/).textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const after = screen.getByText(/שניות/).textContent;

    expect(after).not.toBe(before);
  });

  it("still ticks every second under prefers-reduced-motion: reduce -- reduced motion must never freeze/slow the numeric clock", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
    render(<QualificationLiveCard {...props({ expiryInstantIso: "2026-08-30T00:00:00.000Z" })} />);

    const before = screen.getByText(/שניות/).textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const after = screen.getByText(/שניות/).textContent;

    expect(after).not.toBe(before);
    vi.unstubAllGlobals();
  });

  it("derives the displayed remaining time from the target expiry instant and the current clock, not from decrementing a stored counter -- jumping the clock forward by an hour is reflected exactly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
    render(<QualificationLiveCard {...props({ expiryInstantIso: "2026-08-30T00:00:00.000Z" })} />);

    vi.setSystemTime(new Date("2026-08-25T01:00:00.000Z"));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // 5 days minus 1 hour and 1 second remaining -> 4 days, 22h 59m 59s.
    expect(screen.getByText("22 שעות · 59 דקות · 59 שניות")).toBeInTheDocument();
  });

  it("resyncs immediately when the tab becomes visible again after being backgrounded, without requiring a refresh", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
    render(<QualificationLiveCard {...props({ expiryInstantIso: "2026-08-30T00:00:00.000Z" })} />);

    // Simulate 10 minutes passing in the background with no timer firing
    // (throttled background tab), then the tab becomes visible again.
    vi.setSystemTime(new Date("2026-08-25T00:10:00.000Z"));
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    // 5 days minus the 10 minutes that passed in the background, resynced
    // immediately on visibilitychange rather than waiting for the (possibly
    // throttled) next interval tick.
    expect(screen.getByText("23 שעות · 50 דקות · 00 שניות")).toBeInTheDocument();
  });

  it("counts UPWARD for an expired qualification, live", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    render(
      <QualificationLiveCard
        {...props({ status: "expired", expiryInstantIso: "2026-08-30T00:00:00.000Z", initialDaysRemaining: -2 })}
      />,
    );

    const before = screen.getByText(/שניות/).textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const after = screen.getByText(/שניות/).textContent;

    expect(after).not.toBe(before);
    expect(screen.getByText("מאז פקיעת הכשירות")).toBeInTheDocument();
  });

  it("gives every hours/minutes/seconds figure an explicit visible unit -- never an unexplained bare HH:MM:SS", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
    const { container } = render(<QualificationLiveCard {...props({ expiryInstantIso: "2026-08-30T00:00:00.000Z" })} />);

    expect(screen.getByText(/שעות/)).toBeInTheDocument();
    expect(screen.getByText(/דקות/)).toBeInTheDocument();
    expect(screen.getByText(/שניות/)).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b\d{2}:\d{2}:\d{2}\b/);
  });
});
