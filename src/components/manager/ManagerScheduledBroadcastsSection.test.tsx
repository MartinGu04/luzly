import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ScheduledBroadcastView } from "@/lib/notifications/scheduledBroadcastActions";

const listActiveScheduledBroadcastsAction = vi.fn();
const sendScheduledBroadcastNowAction = vi.fn();
const cancelScheduledBroadcastAction = vi.fn();

vi.mock("@/lib/notifications/scheduledBroadcastActions", () => ({
  listActiveScheduledBroadcastsAction: (...args: unknown[]) => listActiveScheduledBroadcastsAction(...args),
  sendScheduledBroadcastNowAction: (...args: unknown[]) => sendScheduledBroadcastNowAction(...args),
  cancelScheduledBroadcastAction: (...args: unknown[]) => cancelScheduledBroadcastAction(...args),
}));

const { ManagerScheduledBroadcastsSection } = await import("./ManagerScheduledBroadcastsSection");

afterEach(() => {
  cleanup();
  listActiveScheduledBroadcastsAction.mockReset();
  sendScheduledBroadcastNowAction.mockReset();
  cancelScheduledBroadcastAction.mockReset();
});

function item(overrides: Partial<ScheduledBroadcastView> = {}): ScheduledBroadcastView {
  return {
    id: "sb_1",
    status: "scheduled",
    audienceKind: "everyone",
    targetPersonIds: ["p_a", "p_b"],
    title: "עדכון חשוב",
    body: "תוכן",
    scheduledFor: "2026-08-23T17:00:00.000Z",
    scheduledLocalDate: "2026-08-23",
    scheduledLocalMinuteOfDay: 20 * 60,
    createdByPersonName: "דני מנהל",
    lastChangedByPersonName: null,
    ...overrides,
  };
}

describe("ManagerScheduledBroadcastsSection", () => {
  it("renders nothing while there are no active scheduled broadcasts", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("🕒 התראות מתוזמנות")).toBeNull();
  });

  it("lists an active item with its human-readable moment and audience summary", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item()] });
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("🕒 התראות מתוזמנות")).toBeInTheDocument());
    expect(screen.getByText("עדכון חשוב")).toBeInTheDocument();
    expect(screen.getByText(/כולם/)).toBeInTheDocument();
    expect(screen.getByText(/דני מנהל/)).toBeInTheDocument();
  });

  it("hides עריכה/שלח עכשיו/ביטול once the item is no longer editable ('claimed')", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item({ status: "claimed" })] });
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("עדכון חשוב")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "עריכה" })).toBeNull();
    expect(screen.queryByRole("button", { name: "שלח עכשיו" })).toBeNull();
  });

  it("'עריכה' hands the item up to the parent", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item()] });
    const onEdit = vi.fn();
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={onEdit} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "עריכה" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "עריכה" }));
    expect(onEdit).toHaveBeenCalledWith(item());
  });

  it("'שלח עכשיו' calls the action and refreshes on success", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item()] });
    sendScheduledBroadcastNowAction.mockResolvedValue({ ok: true, batchId: "batch_1", resolvedRecipientCount: 2 });
    const onChanged = vi.fn();
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "שלח עכשיו" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "שלח עכשיו" }));

    await waitFor(() => expect(sendScheduledBroadcastNowAction).toHaveBeenCalledWith("sb_1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("shows a truthful inline error when send-now races a worker claim", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item()] });
    sendScheduledBroadcastNowAction.mockResolvedValue({ ok: false, error: "already_started" });
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "שלח עכשיו" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "שלח עכשיו" }));

    expect(await screen.findByText("השליחה כבר התחילה, ולא ניתן עוד לפעול על התזמון הזה.")).toBeInTheDocument();
  });

  it("'ביטול' requires an explicit confirmation before cancelling", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item()] });
    cancelScheduledBroadcastAction.mockResolvedValue({ ok: true });
    const onChanged = vi.fn();
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={onChanged} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "ביטול" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
    expect(cancelScheduledBroadcastAction).not.toHaveBeenCalled();
    expect(screen.getByText("לבטל את התזמון?")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "כן, בטל" }));
    await waitFor(() => expect(cancelScheduledBroadcastAction).toHaveBeenCalledWith("sb_1"));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("declining the cancel confirmation never calls the action", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [item()] });
    render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);

    await waitFor(() => expect(screen.getByRole("button", { name: "ביטול" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "ביטול" }));
    fireEvent.click(screen.getByRole("button", { name: "לא" }));

    expect(cancelScheduledBroadcastAction).not.toHaveBeenCalled();
    expect(screen.queryByText("לבטל את התזמון?")).toBeNull();
  });

  it("re-fetches when reloadToken changes", async () => {
    listActiveScheduledBroadcastsAction.mockResolvedValue({ ok: true, items: [] });
    const { rerender } = render(<ManagerScheduledBroadcastsSection reloadToken={0} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(1));

    rerender(<ManagerScheduledBroadcastsSection reloadToken={1} editingId={null} onEdit={vi.fn()} onChanged={vi.fn()} />);
    await waitFor(() => expect(listActiveScheduledBroadcastsAction).toHaveBeenCalledTimes(2));
  });
});
