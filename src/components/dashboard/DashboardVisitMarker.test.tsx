import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { DashboardVisitMarker } from "./DashboardVisitMarker";

const recordDashboardVisitAction = vi.hoisted(() => vi.fn());
vi.mock("@/lib/dashboardVisit/actions", () => ({ recordDashboardVisitAction }));

beforeEach(() => {
  recordDashboardVisitAction.mockReset();
  recordDashboardVisitAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
});

describe("DashboardVisitMarker -- renders nothing (11)", () => {
  it("produces no DOM output", () => {
    const { container } = render(<DashboardVisitMarker visitStartedAt="2026-08-25T10:00:00.000Z" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("DashboardVisitMarker -- mount marks the visit (14)", () => {
  it("calls recordDashboardVisitAction with the given visitStartedAt on mount", async () => {
    render(<DashboardVisitMarker visitStartedAt="2026-08-25T10:00:00.000Z" />);
    await Promise.resolve();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
    expect(recordDashboardVisitAction).toHaveBeenCalledWith("2026-08-25T10:00:00.000Z");
  });
});

describe("DashboardVisitMarker -- AppRevalidator-style rerender never marks a second visit (9, 16)", () => {
  it("a prop update on the SAME mounted instance (simulating router.refresh()) does not call the action again", async () => {
    const { rerender } = render(<DashboardVisitMarker visitStartedAt="2026-08-25T10:00:00.000Z" />);
    await Promise.resolve();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);

    rerender(<DashboardVisitMarker visitStartedAt="2026-08-25T10:05:00.000Z" />);
    await Promise.resolve();

    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
    // Still the ORIGINAL mount-time value, never the later prop update.
    expect(recordDashboardVisitAction).toHaveBeenCalledWith("2026-08-25T10:00:00.000Z");
  });

  it("several rerenders with different props still only ever mark the ORIGINAL mount instant once", async () => {
    const { rerender } = render(<DashboardVisitMarker visitStartedAt="2026-08-25T10:00:00.000Z" />);
    await Promise.resolve();

    rerender(<DashboardVisitMarker visitStartedAt="2026-08-25T10:05:00.000Z" />);
    rerender(<DashboardVisitMarker visitStartedAt="2026-08-25T10:10:00.000Z" />);
    await Promise.resolve();

    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);
  });
});

describe("DashboardVisitMarker -- genuine unmount + remount marks a new visit (17)", () => {
  it("unmounting and mounting a fresh instance calls the action again, with the new instant", async () => {
    const first = render(<DashboardVisitMarker visitStartedAt="2026-08-25T10:00:00.000Z" />);
    await Promise.resolve();
    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(1);

    first.unmount();

    render(<DashboardVisitMarker visitStartedAt="2026-08-25T11:30:00.000Z" />);
    await Promise.resolve();

    expect(recordDashboardVisitAction).toHaveBeenCalledTimes(2);
    expect(recordDashboardVisitAction).toHaveBeenLastCalledWith("2026-08-25T11:30:00.000Z");
  });
});

describe("DashboardVisitMarker -- failure behavior (16)", () => {
  it("a rejected write is swallowed -- never throws, never surfaces to the caller", async () => {
    recordDashboardVisitAction.mockRejectedValue(new Error("network down"));
    expect(() => render(<DashboardVisitMarker visitStartedAt="2026-08-25T10:00:00.000Z" />)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();
  });
});
