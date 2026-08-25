import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { PlannedRangeCountdown } from "./PlannedRangeCountdown";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PlannedRangeCountdown", () => {
  describe("status: planned (counting down to a future range)", () => {
    it("ticks live every second, using the same reliable clock behavior as the qualification countdown", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-25T00:00:00.500Z"));
      render(
        <PlannedRangeCountdown status="planned" rangeDateLabel="30.08" rangeDateStartInstantIso="2026-08-30T00:00:00.000Z" />,
      );

      const before = screen.getByText(/שניות/).textContent;
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const after = screen.getByText(/שניות/).textContent;

      expect(after).not.toBe(before);
    });

    it("still ticks every second under prefers-reduced-motion: reduce", () => {
      vi.stubGlobal(
        "matchMedia",
        vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
      );
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
      render(
        <PlannedRangeCountdown status="planned" rangeDateLabel="30.08" rangeDateStartInstantIso="2026-08-30T00:00:00.000Z" />,
      );

      const before = screen.getByText(/שניות/).textContent;
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const after = screen.getByText(/שניות/).textContent;

      expect(after).not.toBe(before);
      vi.unstubAllGlobals();
    });

    it("gives every hours/minutes/seconds figure an explicit visible unit -- never a bare HH:MM:SS", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
      const { container } = render(
        <PlannedRangeCountdown status="planned" rangeDateLabel="30.08" rangeDateStartInstantIso="2026-08-30T00:00:00.000Z" />,
      );

      expect(screen.getByText(/שעות/)).toBeInTheDocument();
      expect(screen.getByText(/דקות/)).toBeInTheDocument();
      expect(screen.getByText(/שניות/)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/\b\d{2}:\d{2}:\d{2}\b/);
    });
  });

  describe("status: pending_confirmation (counting up since the range date elapsed)", () => {
    it("counts UPWARD live, every second", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-25T00:00:00.500Z"));
      render(
        <PlannedRangeCountdown
          status="pending_confirmation"
          rangeDateLabel="23.08"
          rangeDateStartInstantIso="2026-08-23T00:00:00.000Z"
        />,
      );

      const before = screen.getByText(/שניות/).textContent;
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const after = screen.getByText(/שניות/).textContent;

      expect(after).not.toBe(before);
    });

    it("gives every hours/minutes/seconds figure an explicit visible unit here too", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));
      const { container } = render(
        <PlannedRangeCountdown
          status="pending_confirmation"
          rangeDateLabel="23.08"
          rangeDateStartInstantIso="2026-08-23T00:00:00.000Z"
        />,
      );

      expect(screen.getByText(/שעות/)).toBeInTheDocument();
      expect(screen.getByText(/דקות/)).toBeInTheDocument();
      expect(screen.getByText(/שניות/)).toBeInTheDocument();
      expect(container.textContent).not.toMatch(/\b\d{2}:\d{2}:\d{2}\b/);
    });
  });
});
