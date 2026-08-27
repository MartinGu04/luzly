import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import type { ScheduledBroadcastView } from "@/lib/notifications/scheduledBroadcastActions";

const sendManagerBroadcastAction = vi.fn();
const createScheduledBroadcastAction = vi.fn();
const editScheduledBroadcastAction = vi.fn();

vi.mock("@/lib/notifications/manualBroadcastActions", () => ({
  sendManagerBroadcastAction: (...args: unknown[]) => sendManagerBroadcastAction(...args),
}));
vi.mock("@/lib/notifications/scheduledBroadcastActions", () => ({
  createScheduledBroadcastAction: (...args: unknown[]) => createScheduledBroadcastAction(...args),
  editScheduledBroadcastAction: (...args: unknown[]) => editScheduledBroadcastAction(...args),
}));

const { ManagerBroadcastComposer } = await import("./ManagerBroadcastComposer");

afterEach(() => {
  cleanup();
  sendManagerBroadcastAction.mockReset();
  createScheduledBroadcastAction.mockReset();
  editScheduledBroadcastAction.mockReset();
});

const ROSTER: ManagerPersonSummary[] = [
  { id: "p_dana", name: "דנה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
  { id: "p_noa", name: "נועה", isManager: false, isTechnician: false, isSupervisor: true, personnelType: null },
];

const ADOPTION: ManagerAdoptionPersonView[] = [
  { personId: "p_dana", personName: "דנה", avatarUrl: null, loginStatus: "logged_in", notificationStatus: "ready", dataIssue: null, needsNudge: false },
  { personId: "p_noa", personName: "נועה", avatarUrl: null, loginStatus: "logged_in", notificationStatus: "not_enabled", dataIssue: null, needsNudge: true },
];

function fillTitleAndBody() {
  fireEvent.change(screen.getByPlaceholderText("לדוגמה: עדכון חשוב"), { target: { value: "כותרת" } });
  fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });
}

describe("ManagerBroadcastComposer -- mode is fixed by the parent, no internal 'מתי לשלוח' selector", () => {
  it("mode='now' never renders a מתי לשלוח selector -- the immediate-send button is available directly", () => {
    render(<ManagerBroadcastComposer mode="now" roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(screen.queryByRole("radiogroup", { name: "מתי לשלוח" })).toBeNull();
    expect(screen.getByRole("button", { name: "שלח התראה" })).toBeInTheDocument();
  });

  it("mode='schedule' never renders a מתי לשלוח selector either -- date/time inputs are shown directly", () => {
    render(<ManagerBroadcastComposer mode="schedule" roster={ROSTER} adoptionPeople={ADOPTION} />);
    expect(screen.queryByRole("radiogroup", { name: "מתי לשלוח" })).toBeNull();
    expect(screen.getByLabelText("תאריך השליחה")).toBeInTheDocument();
    expect(screen.getByLabelText("שעת השליחה")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "שמירת תזמון" })).toBeInTheDocument();
  });

  it("mode='schedule' disables submit until both date and time are filled", () => {
    render(<ManagerBroadcastComposer mode="schedule" roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("דנה"));
    fillTitleAndBody();

    expect(screen.getByRole("button", { name: "שמירת תזמון" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("תאריך השליחה"), { target: { value: "2026-08-23" } });
    expect(screen.getByRole("button", { name: "שמירת תזמון" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("שעת השליחה"), { target: { value: "20:00" } });
    expect(screen.getByRole("button", { name: "שמירת תזמון" })).not.toBeDisabled();
    expect(screen.getByText(/תוזמן ל/)).toBeInTheDocument();
  });

  it("submits createScheduledBroadcastAction with the picked local date/time, and never claims Push was sent", async () => {
    createScheduledBroadcastAction.mockResolvedValue({
      ok: true,
      item: { id: "sb_1", scheduledLocalDate: "2026-08-23", scheduledLocalMinuteOfDay: 20 * 60, status: "scheduled" },
    });
    render(<ManagerBroadcastComposer mode="schedule" roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("דנה"));
    fillTitleAndBody();
    fireEvent.change(screen.getByLabelText("תאריך השליחה"), { target: { value: "2026-08-23" } });
    fireEvent.change(screen.getByLabelText("שעת השליחה"), { target: { value: "20:00" } });

    fireEvent.click(screen.getByRole("button", { name: "שמירת תזמון" }));

    await waitFor(() => expect(createScheduledBroadcastAction).toHaveBeenCalledTimes(1));
    expect(createScheduledBroadcastAction).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceKind: "person",
        targetPersonIds: ["p_dana"],
        title: "כותרת",
        body: "תוכן",
        scheduledDate: "2026-08-23",
        scheduledHour: 20,
        scheduledMinute: 0,
      }),
    );
    expect(sendManagerBroadcastAction).not.toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText(/ההתראה תוזמנה/)).toBeInTheDocument());
    expect(screen.queryByText(/Push נשלח/)).toBeNull();
  });

  it("shows a Hebrew error and keeps the form filled when scheduling fails", async () => {
    createScheduledBroadcastAction.mockResolvedValue({ ok: false, error: "invalid_schedule" });
    render(<ManagerBroadcastComposer mode="schedule" roster={ROSTER} adoptionPeople={ADOPTION} />);
    fireEvent.click(screen.getByText("דנה"));
    fillTitleAndBody();
    fireEvent.change(screen.getByLabelText("תאריך השליחה"), { target: { value: "2020-01-01" } });
    fireEvent.change(screen.getByLabelText("שעת השליחה"), { target: { value: "08:00" } });

    fireEvent.click(screen.getByRole("button", { name: "שמירת תזמון" }));

    await waitFor(() => expect(createScheduledBroadcastAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("יש לבחור תאריך ושעה תקינים בעתיד.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("לדוגמה: עדכון חשוב")).toHaveValue("כותרת");
  });
});

describe("ManagerBroadcastComposer -- editing an existing scheduled broadcast (always mode='schedule')", () => {
  const EDITING_ITEM: ScheduledBroadcastView = {
    id: "sb_1",
    status: "scheduled",
    audienceKind: "person",
    targetPersonIds: ["p_dana"],
    audienceGroupKeys: [],
    excludedPersonIds: [],
    title: "כותרת קיימת",
    body: "תוכן קיים",
    scheduledFor: "2026-08-23T17:00:00.000Z",
    scheduledLocalDate: "2026-08-23",
    scheduledLocalMinuteOfDay: 20 * 60,
    createdByPersonName: "דני מנהל",
    lastChangedByPersonName: null,
  };

  it("pre-fills the form from the editing item and never renders a מתי לשלוח selector", () => {
    render(<ManagerBroadcastComposer mode="schedule" roster={ROSTER} adoptionPeople={ADOPTION} editingItem={EDITING_ITEM} />);
    expect(screen.getByPlaceholderText("לדוגמה: עדכון חשוב")).toHaveValue("כותרת קיימת");
    expect(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות")).toHaveValue("תוכן קיים");
    expect(screen.getByLabelText("תאריך השליחה")).toHaveValue("2026-08-23");
    expect(screen.getByLabelText("שעת השליחה")).toHaveValue("20:00");
    expect(screen.queryByRole("radiogroup", { name: "מתי לשלוח" })).toBeNull();
    expect(screen.getByRole("button", { name: "שמירת שינויים" })).toBeInTheDocument();
  });

  it("submits editScheduledBroadcastAction with the item's id", async () => {
    editScheduledBroadcastAction.mockResolvedValue({
      ok: true,
      item: { id: "sb_1", scheduledLocalDate: "2026-08-23", scheduledLocalMinuteOfDay: 21 * 60, status: "scheduled" },
    });
    const onSaved = vi.fn();
    const onCancelEdit = vi.fn();
    render(
      <ManagerBroadcastComposer
        mode="schedule"
        roster={ROSTER}
        adoptionPeople={ADOPTION}
        editingItem={EDITING_ITEM}
        onSaved={onSaved}
        onCancelEdit={onCancelEdit}
      />,
    );

    fireEvent.change(screen.getByLabelText("שעת השליחה"), { target: { value: "21:00" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירת שינויים" }));

    await waitFor(() => expect(editScheduledBroadcastAction).toHaveBeenCalledTimes(1));
    expect(editScheduledBroadcastAction).toHaveBeenCalledWith("sb_1", expect.objectContaining({ scheduledHour: 21 }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it("calls onCancelEdit when 'ביטול עריכה' is clicked", () => {
    const onCancelEdit = vi.fn();
    render(
      <ManagerBroadcastComposer mode="schedule" roster={ROSTER} adoptionPeople={ADOPTION} editingItem={EDITING_ITEM} onCancelEdit={onCancelEdit} />,
    );
    fireEvent.click(screen.getByText("ביטול עריכה"));
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });
});
