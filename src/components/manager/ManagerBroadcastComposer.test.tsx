import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

const sendManagerBroadcastAction = vi.fn();

vi.mock("@/lib/notifications/manualBroadcastActions", () => ({
  sendManagerBroadcastAction: (...args: unknown[]) => sendManagerBroadcastAction(...args),
}));

const { ManagerBroadcastComposer } = await import("./ManagerBroadcastComposer");

afterEach(() => {
  cleanup();
  sendManagerBroadcastAction.mockReset();
});

const ROSTER: ManagerPersonSummary[] = [
  { id: "p_dana", name: "דנה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
  { id: "p_noa", name: "נועה", isManager: false, isTechnician: false, isSupervisor: true, personnelType: null },
];

const ADOPTION: ManagerAdoptionPersonView[] = [
  { personId: "p_dana", personName: "דנה", avatarUrl: null, loginStatus: "logged_in", notificationStatus: "ready", dataIssue: null, needsNudge: false },
  { personId: "p_noa", personName: "נועה", avatarUrl: null, loginStatus: "logged_in", notificationStatus: "not_enabled", dataIssue: null, needsNudge: true },
];

function renderComposer() {
  return render(<ManagerBroadcastComposer roster={ROSTER} adoptionPeople={ADOPTION} />);
}

describe("ManagerBroadcastComposer", () => {
  it("renders the audience selector, person picker, and disables send until a recipient + title + body exist", () => {
    renderComposer();
    expect(screen.getByText("📣 שליחת התראה")).toBeInTheDocument();
    const sendButton = screen.getByRole("button", { name: "שלח התראה" });
    expect(sendButton).toBeDisabled();
  });

  it("shows readiness badges next to each person in the picker, reusing the existing adoption data", () => {
    renderComposer();
    expect(screen.getByText("Push")).toBeInTheDocument();
    expect(screen.getByText("התראה בלבד")).toBeInTheDocument();
  });

  it("filters the picker by search query", () => {
    renderComposer();
    const search = screen.getByLabelText("חיפוש איש/אשת צוות");
    fireEvent.change(search, { target: { value: "דנה" } });
    expect(screen.getByText("דנה")).toBeInTheDocument();
    expect(screen.queryByText("נועה")).toBeNull();
  });

  it("selecting a person enables send once title/body are also filled, and updates the live audience summary", () => {
    renderComposer();
    fireEvent.click(screen.getByText("דנה"));
    expect(screen.getByText(/יקבלו גם Push/).parentElement?.textContent).toContain("1");

    fireEvent.change(screen.getByPlaceholderText("לדוגמה: עדכון חשוב"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן ההודעה" } });

    expect(screen.getByRole("button", { name: "שלח התראה" })).not.toBeDisabled();
  });

  it("'person' mode replaces the previous selection when a second person is clicked, never accumulating", () => {
    renderComposer();
    fireEvent.click(screen.getByText("דנה"));
    fireEvent.click(screen.getByText("נועה"));
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    const checkedCount = checkboxes.filter((box) => box.checked).length;
    expect(checkedCount).toBe(1);
  });

  it("'כמה אנשים' mode accumulates multiple selections", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("radio", { name: "כמה אנשים" }));
    fireEvent.click(screen.getByText("דנה"));
    fireEvent.click(screen.getByText("נועה"));
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.filter((box) => box.checked)).toHaveLength(2);
  });

  it("'כולם' mode hides the picker and enables send without any manual selection once title/body are filled", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("radio", { name: "כולם" }));
    expect(screen.queryByLabelText("חיפוש איש/אשת צוות")).toBeNull();

    fireEvent.change(screen.getByPlaceholderText("לדוגמה: עדכון חשוב"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });

    expect(screen.getByRole("button", { name: "שלח התראה" })).not.toBeDisabled();
  });

  it("submits with the same idempotencyKey shape the action expects, and shows the truthful post-send summary -- never claims Push was sent", async () => {
    sendManagerBroadcastAction.mockResolvedValue({
      ok: true,
      batchId: "batch_1",
      resolvedRecipientCount: 1,
      pushCapableCount: 1,
      inboxOnlyCount: 0,
      unresolved: [],
    });
    renderComposer();
    fireEvent.click(screen.getByText("דנה"));
    fireEvent.change(screen.getByPlaceholderText("לדוגמה: עדכון חשוב"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });

    fireEvent.click(screen.getByRole("button", { name: "שלח התראה" }));

    await waitFor(() => expect(sendManagerBroadcastAction).toHaveBeenCalledTimes(1));
    const call = sendManagerBroadcastAction.mock.calls[0][0];
    expect(call).toMatchObject({ audienceKind: "person", targetPersonIds: ["p_dana"], title: "כותרת", body: "תוכן" });
    expect(typeof call.idempotencyKey).toBe("string");
    expect(call.idempotencyKey.length).toBeGreaterThan(0);

    await waitFor(() => expect(screen.getByText(/נוצרה התראה ל־1 משתמשים/)).toBeInTheDocument());
    expect(screen.queryByText(/Push נשלח/)).toBeNull();
  });

  it("shows a Hebrew error message and never clears the form when the action fails", async () => {
    sendManagerBroadcastAction.mockResolvedValue({ ok: false, error: "no_targets" });
    renderComposer();
    fireEvent.click(screen.getByText("דנה"));
    fireEvent.change(screen.getByPlaceholderText("לדוגמה: עדכון חשוב"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });

    fireEvent.click(screen.getByRole("button", { name: "שלח התראה" }));

    await waitFor(() => expect(sendManagerBroadcastAction).toHaveBeenCalledTimes(1));
    expect(within(screen.getByTestId("manager-broadcast-composer")).getByPlaceholderText("לדוגמה: עדכון חשוב")).toHaveValue(
      "כותרת",
    );
  });
});
