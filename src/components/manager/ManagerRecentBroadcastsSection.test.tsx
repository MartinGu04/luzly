import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const getRecentManagerBroadcastsAction = vi.fn();

vi.mock("@/lib/notifications/manualBroadcastActions", () => ({
  getRecentManagerBroadcastsAction: (...args: unknown[]) => getRecentManagerBroadcastsAction(...args),
}));

const { ManagerRecentBroadcastsSection } = await import("./ManagerRecentBroadcastsSection");

afterEach(() => {
  cleanup();
  getRecentManagerBroadcastsAction.mockReset();
});

describe("ManagerRecentBroadcastsSection", () => {
  it("renders nothing when there is nothing recent", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
  });

  it("renders nothing when the load fails, rather than surfacing a raw error", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
  });

  it("lists recent batches reusing PR #78's own bounded history", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({
      ok: true,
      items: [
        {
          id: "batch_1",
          title: "עדכון",
          body: "תוכן",
          audienceKind: "everyone",
          createdByPersonName: "דני מנהל",
          createdAt: "2026-08-21T08:00:00.000Z",
          resolvedRecipientCount: 5,
          pushCapableCount: 4,
          inboxOnlyCount: 1,
          unresolvedCount: 0,
        },
      ],
    });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("נשלחו לאחרונה")).toBeInTheDocument());
    expect(screen.getByText("עדכון")).toBeInTheDocument();
    expect(screen.getByText(/כולם/)).toBeInTheDocument();
    expect(screen.getByText(/דני מנהל/)).toBeInTheDocument();
  });

  it("re-fetches when reloadToken changes (e.g. a scheduled broadcast just dispatched via 'שלח עכשיו')", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    const { rerender } = render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));

    rerender(<ManagerRecentBroadcastsSection reloadToken={1} pollWhileActive={false} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));
  });
});

describe("ManagerRecentBroadcastsSection -- background polling gated on pollWhileActive (spec §7)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT poll again after the interval when pollWhileActive is false", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1);
  });

  it("polls again after ~17s when pollWhileActive is true, never before", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2);
  });

  it("stops polling once pollWhileActive flips back to false", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    const { rerender } = render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));

    rerender(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2);
  });

  it("clears the pending poll timer on unmount", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    const { unmount } = render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));

    unmount();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1);
  });
});

const RECENT_ITEM = {
  id: "batch_1",
  title: "עדכון",
  body: "תוכן",
  audienceKind: "everyone" as const,
  createdByPersonName: "דני מנהל",
  createdAt: "2026-08-21T08:00:00.000Z",
  resolvedRecipientCount: 5,
  pushCapableCount: 4,
  inboxOnlyCount: 1,
  unresolvedCount: 0,
};

describe("ManagerRecentBroadcastsSection -- polling survives a transient failure (fix for a resilience bug)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("1. success, then a throw on the next poll, then a later success -- all while pollWhileActive stays true", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: [RECENT_ITEM] })
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockResolvedValue({ ok: true, items: [RECENT_ITEM] });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2)); // the throwing poll
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(3)); // recovers
  });

  it("2. no overlapping requests -- never a second call before the retry interval elapses", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: [RECENT_ITEM] })
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockResolvedValue({ ok: true, items: [RECENT_ITEM] });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(10_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(7_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(3);
  });

  it("3. clears the retry timer on unmount, same as the normal poll timer", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction.mockRejectedValue(new Error("always fails"));
    const { unmount } = render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    unmount();

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1);
  });

  it("4. previously rendered recent items stay visible during a transient background-poll failure -- the section never disappears because one request failed", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: [RECENT_ITEM] })
      .mockRejectedValueOnce(new Error("network hiccup"));

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(screen.getByText("נשלחו לאחרונה")).toBeInTheDocument());
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));

    // Still visible -- the throw never cleared the already-loaded items.
    expect(screen.getByText("נשלחו לאחרונה")).toBeInTheDocument();
    expect(screen.getByText("עדכון")).toBeInTheDocument();
  });

  it("5. an INITIAL load failure (nothing has ever succeeded yet) renders nothing but still recovers automatically without a manual refresh", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockRejectedValueOnce(new Error("network hiccup on first load"))
      .mockResolvedValue({ ok: true, items: [RECENT_ITEM] });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();

    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.getByText("נשלחו לאחרונה")).toBeInTheDocument());
  });

  it("6. polling still stops once pollWhileActive becomes false, even mid-retry-cycle", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: [RECENT_ITEM] })
      .mockRejectedValueOnce(new Error("network hiccup"))
      .mockResolvedValue({ ok: true, items: [RECENT_ITEM] });

    const { rerender } = render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2)); // throws

    rerender(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(3)); // one immediate re-fetch from the prop change

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(3);
  });

  it("a typed, permanent ok:false result still stops retrying, unlike a thrown failure", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: [RECENT_ITEM] })
      .mockResolvedValue({ ok: false, error: "forbidden" });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));

    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2);
  });
});
