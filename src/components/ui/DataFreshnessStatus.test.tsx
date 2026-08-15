import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const refresh = vi.fn();
const push = vi.fn();
const replace = vi.fn();
const useRouter = vi.fn(() => ({ refresh, push, replace }));
const refreshWorkbookSnapshotAction = vi.fn(() => Promise.resolve());

vi.mock("next/navigation", () => ({
  useRouter: () => useRouter(),
}));

vi.mock("@/lib/sync/actions", () => ({
  refreshWorkbookSnapshotAction: () => refreshWorkbookSnapshotAction(),
}));

const { DataFreshnessStatus } = await import("./DataFreshnessStatus");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  refresh.mockReset();
  push.mockReset();
  replace.mockReset();
  refreshWorkbookSnapshotAction.mockReset();
  refreshWorkbookSnapshotAction.mockResolvedValue(undefined);
});

describe("DataFreshnessStatus — hydration-safe initial render", () => {
  it("renders the static 'Google Sheets' source text on first paint, before the relative-age effect runs", () => {
    render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    expect(screen.getByText(/Google Sheets/)).toBeInTheDocument();
  });
});

describe("DataFreshnessStatus — relative-age text", () => {
  it("shows the freshness label after mount", async () => {
    const fetchedAt = new Date(Date.now() - 2 * 60_000).toISOString();
    render(<DataFreshnessStatus fetchedAt={fetchedAt} />);
    expect(await screen.findByText(/עודכן לפני 2 דקות/)).toBeInTheDocument();
  });

  it("re-ticks the label locally on a timer WITHOUT calling router.refresh (no polling)", async () => {
    vi.useFakeTimers();
    const fetchedAt = new Date(Date.now() - 59_000).toISOString();
    render(<DataFreshnessStatus fetchedAt={fetchedAt} />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(screen.getByText(/עודכן לפני דקה/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("DataFreshnessStatus — refresh control", () => {
  it("has an accessible button labeled 'רענון נתונים'", () => {
    render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    expect(screen.getByRole("button", { name: "רענון נתונים" })).toBeInTheDocument();
  });

  it("clicking refresh invalidates the workbook-snapshot cache BEFORE calling router.refresh(), never push/replace", async () => {
    render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "רענון נתונים" }));
    });
    expect(refreshWorkbookSnapshotAction).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refreshWorkbookSnapshotAction.mock.invocationCallOrder[0]).toBeLessThan(
      refresh.mock.invocationCallOrder[0],
    );
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("never performs a direct fetch/XHR call itself", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "רענון נתונים" }));
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("shows the pending 'מרענן…' state while the cache-invalidation action is still in flight", async () => {
    let resolveAction: () => void = () => {};
    refreshWorkbookSnapshotAction.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    fireEvent.click(screen.getByRole("button", { name: "רענון נתונים" }));

    const pendingButton = await screen.findByRole("button", { name: "רענון נתונים" });
    expect(pendingButton).toBeDisabled();
    expect(screen.getByText("מרענן…")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveAction();
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not show a fake success message immediately after clicking (no new fetchedAt has arrived yet)", async () => {
    render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "רענון נתונים" }));
    });
    expect(screen.queryByText(/הרענון הצליח/)).toBeNull();
  });

  it("resets the displayed age once a genuinely new fetchedAt prop arrives (the natural success signal)", async () => {
    const oldFetchedAt = new Date(Date.now() - 10 * 60_000).toISOString();
    const { rerender } = render(<DataFreshnessStatus fetchedAt={oldFetchedAt} />);
    expect(await screen.findByText(/עודכן לפני 10 דקות/)).toBeInTheDocument();

    const newFetchedAt = new Date().toISOString();
    rerender(<DataFreshnessStatus fetchedAt={newFetchedAt} />);
    expect(await screen.findByText(/עודכן עכשיו/)).toBeInTheDocument();
  });
});

describe("DataFreshnessStatus — privacy", () => {
  it("never renders sourceSheet/sourceCell/spreadsheetId-shaped text (it only ever receives fetchedAt)", () => {
    const { container } = render(<DataFreshnessStatus fetchedAt={new Date().toISOString()} />);
    expect(container.textContent).not.toContain("sourceSheet");
    expect(container.textContent).not.toContain("spreadsheetId");
  });
});
