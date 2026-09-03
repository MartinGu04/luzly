import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// `useLiveClock` returns `null` on the very first render (before its effect
// ever runs) -- see its own docs. Since `render()` from Testing Library
// flushes effects synchronously, a real (unmocked) clock never lets this
// pre-mount state be observed from a test. Mocking the hook directly is the
// only reliable way to assert the hydration-safe placeholder branch.
vi.mock("./useLiveClock", () => ({ useLiveClock: () => null }));

const { DischargeCountdownScreen } = await import("./DischargeCountdownScreen");

afterEach(() => {
  cleanup();
});

describe("DischargeCountdownScreen — before the live clock has ticked", () => {
  it("renders a fixed placeholder, never a guessed real countdown", () => {
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso="2027-01-24T00:00:00.000Z"
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
    const clock = screen.getByTestId("discharge-clock");
    expect(clock).toHaveAttribute("dir", "ltr");
    expect(clock.textContent?.replace(/\s+/g, "")).toBe("--:--:--שעותדקותשניות");
  });
});
