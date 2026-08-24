import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const listActiveScheduledBroadcastsAction = vi.fn();
const recentProps = vi.fn();

vi.mock("@/lib/notifications/scheduledBroadcastActions", () => ({
  listActiveScheduledBroadcastsAction: (...args: unknown[]) => listActiveScheduledBroadcastsAction(...args),
}));

vi.mock("@/components/manager/ManagerRecentBroadcastsSection", () => ({
  ManagerRecentBroadcastsSection: (props: Record<string, unknown>) => {
    recentProps(props);
    return <div data-testid="recent" />;
  },
}));

const { NotificationHistorySection } = await import("./NotificationHistorySection");

afterEach(() => {
  cleanup();
  listActiveScheduledBroadcastsAction.mockReset();
  recentProps.mockReset();
  vi.useRealTimers();
});

describe("NotificationHistorySection -- renders the existing recent-history list", () => {
  it("always passes a constant reloadToken=0 -- there is no sibling composer/scheduled-list action to bump it from anymore", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<NotificationHistorySection />);
    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(recentProps.mock.calls.at(-1)?.[0].reloadToken).toBe(0);
  });

  it("starts with pollWhileActive=false before the active-signal check resolves", () => {
    listActiveScheduledBroadcastsAction.mockReturnValue(new Promise(() => {})); // never resolves
    render(<NotificationHistorySection />);
    expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(false);
  });
});

describe("NotificationHistorySection -- active-scheduled-broadcasts signal (preserves live-history updating)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("turns pollWhileActive on when the underlying scheduled-broadcast action reports active items", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [{ id: "sb_1" }] });
    render(<NotificationHistorySection />);
    await vi.waitFor(() => expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(true));
  });

  it("re-checks the signal every ~17s while something is active, same cadence as the scheduled list's own poll", async () => {
    vi.useFakeTimers();
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [{ id: "sb_1" }] });
    render(<NotificationHistorySection />);

    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(2);
  });

  it("stops polling once nothing is active anymore -- never aggressive/permanent background polling", async () => {
    vi.useFakeTimers();
    listActiveScheduledBroadcastsAction.mockResolvedValueOnce({ ok: true, items: [{ id: "sb_1" }] });
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<NotificationHistorySection />);

    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(2));
    expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(2);
  });

  it("a permanent manager-auth failure (ok: false) degrades to pollWhileActive=false and stops, without breaking the history list itself", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<NotificationHistorySection />);
    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(recentProps.mock.calls.at(-1)?.[0].pollWhileActive).toBe(false);
    // ManagerRecentBroadcastsSection is still rendered (it independently re-derives its own authorization/error state).
    expect(recentProps).toHaveBeenCalled();
  });

  it("a transient throw keeps retrying (unknown is not empty) rather than dying silently", async () => {
    vi.useFakeTimers();
    listActiveScheduledBroadcastsAction.mockRejectedValueOnce(new Error("network hiccup"));
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<NotificationHistorySection />);

    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(2));
  });

  it("clears the pending poll timer on unmount", async () => {
    vi.useFakeTimers();
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [{ id: "sb_1" }] });
    const { unmount } = render(<NotificationHistorySection />);

    await vi.waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));
    unmount();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1);
  });
});
