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
    render(<ManagerRecentBroadcastsSection reloadToken={0} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
  });

  it("renders nothing when the load fails, rather than surfacing a raw error", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: false, error: "forbidden" });
    render(<ManagerRecentBroadcastsSection reloadToken={0} />);
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
    render(<ManagerRecentBroadcastsSection reloadToken={0} />);

    await waitFor(() => expect(screen.getByText("נשלחו לאחרונה")).toBeInTheDocument());
    expect(screen.getByText("עדכון")).toBeInTheDocument();
    expect(screen.getByText(/כולם/)).toBeInTheDocument();
    expect(screen.getByText(/דני מנהל/)).toBeInTheDocument();
  });

  it("re-fetches when reloadToken changes (e.g. a scheduled broadcast just dispatched via 'שלח עכשיו')", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    const { rerender } = render(<ManagerRecentBroadcastsSection reloadToken={0} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));

    rerender(<ManagerRecentBroadcastsSection reloadToken={1} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));
  });
});
