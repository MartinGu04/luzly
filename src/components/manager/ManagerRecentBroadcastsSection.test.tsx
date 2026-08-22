import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const getRecentManagerBroadcastsAction = vi.fn();

vi.mock("@/lib/notifications/manualBroadcastActions", () => ({
  getRecentManagerBroadcastsAction: (...args: unknown[]) => getRecentManagerBroadcastsAction(...args),
}));

const { ManagerRecentBroadcastsSection } = await import("./ManagerRecentBroadcastsSection");

const CLEARED_BEFORE_STORAGE_KEY = "mi-ma-mo:manager-recent-broadcasts:cleared-before";

afterEach(() => {
  cleanup();
  getRecentManagerBroadcastsAction.mockReset();
  window.localStorage.clear();
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

  it("a typed, permanent ok:false result FAILS CLOSED -- clears previously-loaded items and stops retrying, unlike a thrown failure", async () => {
    vi.useFakeTimers();
    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: [RECENT_ITEM] })
      .mockResolvedValue({ ok: false, error: "forbidden" });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);

    // 1. loads recent items successfully.
    await vi.waitFor(() => expect(screen.getByText("נשלחו לאחרונה")).toBeInTheDocument());

    // 2. the next poll returns a typed permanent failure.
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));

    // 3. the existing content disappears -- unlike a transient throw, a permanent
    // manager-auth failure must not leave stale, possibly-unauthorized data visible.
    await vi.waitFor(() => expect(screen.queryByText("נשלחו לאחרונה")).toBeNull());
    expect(screen.queryByText("עדכון")).toBeNull();

    // 4. no further polling occurs.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2);
  });
});

/** N synthetic items, newest first (matches the server's own `created_at desc` ordering) -- distinct minute-apart timestamps so ordering/cutoff comparisons are unambiguous. */
function makeItems(count: number): (typeof RECENT_ITEM)[] {
  return Array.from({ length: count }, (_, index) => ({
    ...RECENT_ITEM,
    id: `batch_${count - index}`,
    title: `שידור ${count - index}`,
    createdAt: new Date(Date.parse("2026-08-21T08:00:00.000Z") + (count - index) * 60_000).toISOString(),
  }));
}

describe("ManagerRecentBroadcastsSection -- compact view (spec: default 3, הצג עוד / הצג פחות)", () => {
  it("1-3 items: no 'הצג עוד' control at all", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(3) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());
    expect(screen.getByText("שידור 1")).toBeInTheDocument();
    expect(screen.queryByText(/הצג עוד/)).toBeNull();
  });

  it("4-10 items: shows only the latest 3 by default, with the correct remaining count", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(7) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 7")).toBeInTheDocument());
    expect(screen.getByText("שידור 6")).toBeInTheDocument();
    expect(screen.getByText("שידור 5")).toBeInTheDocument();
    expect(screen.queryByText("שידור 4")).toBeNull();
    expect(screen.queryByText("שידור 1")).toBeNull();
    expect(screen.getByText("הצג עוד (4)")).toBeInTheDocument();
  });

  it("expand: reveals every currently-available item (up to the server's own 10-row limit), never fetching a second page", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(10) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("הצג עוד (7)")).toBeInTheDocument());
    fireEvent.click(screen.getByText("הצג עוד (7)"));

    for (let n = 1; n <= 10; n++) expect(screen.getByText(`שידור ${n}`)).toBeInTheDocument();
    expect(screen.getByText("הצג פחות")).toBeInTheDocument();
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1); // no extra fetch triggered by expanding
  });

  it("collapse: 'הצג פחות' returns to showing only the latest 3", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(6) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("הצג עוד (3)")).toBeInTheDocument());
    fireEvent.click(screen.getByText("הצג עוד (3)"));
    await waitFor(() => expect(screen.getByText("שידור 1")).toBeInTheDocument());

    fireEvent.click(screen.getByText("הצג פחות"));
    expect(screen.queryByText("שידור 1")).toBeNull();
    expect(screen.getByText("שידור 6")).toBeInTheDocument();
    expect(screen.getByText("הצג עוד (3)")).toBeInTheDocument();
  });
});

describe("ManagerRecentBroadcastsSection -- 'נקה מהתצוגה' (visual-only local cleanup)", () => {
  it("clear: currently-visible items disappear immediately, with no refetch", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(3) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());
    fireEvent.click(screen.getByText("נקה מהתצוגה"));

    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
    expect(screen.queryByText("שידור 3")).toBeNull();
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1); // no refetch triggered by clearing
  });

  it("clear is VISUAL ONLY -- no server mutation action exists or is called; the only side effect is a localStorage write", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(2) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 2")).toBeInTheDocument());
    expect(window.localStorage.getItem(CLEARED_BEFORE_STORAGE_KEY)).toBeNull();

    fireEvent.click(screen.getByText("נקה מהתצוגה"));

    // The ONLY mocked server action in this test file is the read action above --
    // clearing never calls it again, and there is no delete/mutation action to call at all.
    expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(CLEARED_BEFORE_STORAGE_KEY)).not.toBeNull();
  });

  it("the localStorage cutoff survives a component remount (e.g. a page refresh)", async () => {
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(3) });
    const { unmount } = render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());
    fireEvent.click(screen.getByText("נקה מהתצוגה"));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
    unmount();

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);
    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));
    // Same items re-delivered by the mocked poll -- still hidden after remount.
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
  });

  it("a malformed localStorage value fails safely -- normal history still shows, nothing is hidden", async () => {
    window.localStorage.setItem(CLEARED_BEFORE_STORAGE_KEY, "not-a-real-date");
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(3) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());
    expect(screen.getByText("שידור 1")).toBeInTheDocument();
  });

  it("after clearing, an OLD item returned again by a later poll stays hidden", async () => {
    vi.useFakeTimers();
    const oldItems = makeItems(3);
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: oldItems });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);
    await vi.waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("נקה מהתצוגה"));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();

    // The next poll re-delivers the EXACT SAME (now-stale) items -- still hidden.
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
    expect(screen.queryByText("שידור 3")).toBeNull();

    vi.useRealTimers();
  });

  it("after clearing, a GENUINELY NEWER broadcast dispatched later becomes visible automatically", async () => {
    vi.useFakeTimers();
    const oldItems = makeItems(3);
    const newestOldCreatedAt = oldItems[0].createdAt;
    const newBroadcast = {
      ...RECENT_ITEM,
      id: "batch_new",
      title: "שידור חדש",
      createdAt: new Date(Date.parse(newestOldCreatedAt) + 60_000).toISOString(),
    };

    getRecentManagerBroadcastsAction
      .mockResolvedValueOnce({ ok: true, items: oldItems })
      .mockResolvedValue({ ok: true, items: [newBroadcast, ...oldItems] });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={true} />);
    await vi.waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());

    fireEvent.click(screen.getByText("נקה מהתצוגה"));
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();

    // A background dispatch lands a genuinely newer batch on the next poll.
    await vi.advanceTimersByTimeAsync(17_000);
    await vi.waitFor(() => expect(screen.getByText("שידור חדש")).toBeInTheDocument());
    // The old, already-cleared items remain hidden -- only the new one shows.
    expect(screen.queryByText("שידור 3")).toBeNull();
    expect(screen.queryByText("שידור 2")).toBeNull();
    expect(screen.queryByText("שידור 1")).toBeNull();

    vi.useRealTimers();
  });
});

describe("ManagerRecentBroadcastsSection -- cutoff comparisons are CHRONOLOGICAL, not lexicographic", () => {
  // "+03:00" (07:00Z) sorts AFTER ".000Z" (08:00Z) as plain strings despite
  // being chronologically EARLIER -- these two fixtures exist specifically
  // to catch a regression back to string comparison.
  const EARLIER_BUT_STRING_GREATER = "2026-08-21T10:00:00+03:00"; // = 07:00:00Z
  const LATER_BUT_STRING_SMALLER = "2026-08-21T08:00:00.000Z"; // = 08:00:00Z

  it("1. the clear cutoff is chosen by actual chronological time -- the numerically-later item wins even though its ISO string sorts smaller", async () => {
    const items = [
      { ...RECENT_ITEM, id: "batch_a", title: "מוקדם במחרוזת", createdAt: EARLIER_BUT_STRING_GREATER },
      { ...RECENT_ITEM, id: "batch_b", title: "מאוחר במחרוזת", createdAt: LATER_BUT_STRING_SMALLER },
    ];
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("מוקדם במחרוזת")).toBeInTheDocument());
    fireEvent.click(screen.getByText("נקה מהתצוגה"));

    // Both items are at-or-before the TRUE (chronological) cutoff, so both disappear.
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();

    const stored = window.localStorage.getItem(CLEARED_BEFORE_STORAGE_KEY);
    expect(stored).not.toBeNull();
    // The stored cutoff must equal the chronologically later instant (08:00Z), not the
    // lexicographically-larger string (which would incorrectly be the 07:00Z one).
    expect(new Date(stored!).getTime()).toBe(new Date(LATER_BUT_STRING_SMALLER).getTime());
  });

  it("2. after clearing, an item chronologically NEWER than the cutoff appears even though its ISO string would sort smaller", async () => {
    // Cutoff = the 08:00Z instant, written in its ".000Z" form.
    window.localStorage.setItem(CLEARED_BEFORE_STORAGE_KEY, LATER_BUT_STRING_SMALLER);
    // A genuinely later broadcast (09:00Z) but expressed with a "+00:30" offset
    // whose raw string ("...T09:30:00+00:30") still sorts BEFORE ".000Z" lexicographically.
    const trulyNewerButStringSmaller = "2026-08-21T09:30:00+00:30"; // = 09:00:00Z, after the 08:00Z cutoff
    const newTitle = "שידור אמיתי חדש";
    getRecentManagerBroadcastsAction.mockResolvedValue({
      ok: true,
      items: [{ ...RECENT_ITEM, id: "batch_new", title: newTitle, createdAt: trulyNewerButStringSmaller }],
    });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText(newTitle)).toBeInTheDocument());
  });

  it("3. an item chronologically OLDER than (or exactly AT) the cutoff stays hidden, regardless of string ordering", async () => {
    window.localStorage.setItem(CLEARED_BEFORE_STORAGE_KEY, LATER_BUT_STRING_SMALLER); // cutoff = 08:00Z
    getRecentManagerBroadcastsAction.mockResolvedValue({
      ok: true,
      // Exactly AT the cutoff instant, textually different ("+03:00" form) -- still hidden (<=).
      items: [{ ...RECENT_ITEM, id: "batch_same", title: "בדיוק בגבול", createdAt: "2026-08-21T11:00:00+03:00" }],
    });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(getRecentManagerBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("בדיוק בגבול")).toBeNull();
    expect(screen.queryByText("נשלחו לאחרונה")).toBeNull();
  });

  it("4. the existing malformed-localStorage fail-safe behavior is unchanged by the chronological rewrite", async () => {
    window.localStorage.setItem(CLEARED_BEFORE_STORAGE_KEY, "not-a-real-date");
    getRecentManagerBroadcastsAction.mockResolvedValue({ ok: true, items: makeItems(3) });
    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("שידור 3")).toBeInTheDocument());
    expect(screen.getByText("שידור 1")).toBeInTheDocument();
  });

  it("an item with its OWN malformed createdAt fails OPEN (stays visible) rather than being silently hidden", async () => {
    window.localStorage.setItem(CLEARED_BEFORE_STORAGE_KEY, LATER_BUT_STRING_SMALLER);
    getRecentManagerBroadcastsAction.mockResolvedValue({
      ok: true,
      items: [{ ...RECENT_ITEM, id: "batch_bad", title: "תאריך שבור", createdAt: "not-a-real-date" }],
    });

    render(<ManagerRecentBroadcastsSection reloadToken={0} pollWhileActive={false} />);

    await waitFor(() => expect(screen.getByText("תאריך שבור")).toBeInTheDocument());
  });
});
