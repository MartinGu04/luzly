import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CustomWeeklyRuleView } from "@/lib/notifications/ruleActions";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

const createCustomWeeklyRuleAction = vi.fn();
const updateCustomWeeklyRuleAction = vi.fn();

vi.mock("@/lib/notifications/ruleActions", () => ({
  createCustomWeeklyRuleAction: (...args: unknown[]) => createCustomWeeklyRuleAction(...args),
  updateCustomWeeklyRuleAction: (...args: unknown[]) => updateCustomWeeklyRuleAction(...args),
}));

const { ManagerRecurringRuleComposer } = await import("./ManagerRecurringRuleComposer");

afterEach(() => {
  cleanup();
  createCustomWeeklyRuleAction.mockReset();
  updateCustomWeeklyRuleAction.mockReset();
});

const ROSTER: ManagerPersonSummary[] = [
  { id: "p_dana", name: "דנה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
];
const ADOPTION: ManagerAdoptionPersonView[] = [];

function existingRule(overrides: Partial<CustomWeeklyRuleView> = {}): CustomWeeklyRuleView {
  return {
    kind: "custom_weekly",
    id: "rule-custom-1",
    enabled: true,
    weekday: 6,
    localHour: 21,
    localMinute: 0,
    title: "כותרת קיימת",
    body: "גוף קיים",
    audienceKind: "everyone",
    targetPersonIds: [],
    scheduleSummary: "כל שבת בשעה 21:00",
    nextSendSummary: null,
    createdByPersonName: "דני מנהל",
    ...overrides,
  };
}

describe("ManagerRecurringRuleComposer -- create mode", () => {
  it("defaults to Saturday 21:00, everyone, and disables submit until title+body exist", () => {
    render(<ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={null} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("➕ התראה מחזורית חדשה")).toBeTruthy();
    const submitButton = screen.getByText("יצירת התראה מחזורית");
    expect(submitButton).toBeDisabled();
  });

  it("submits the create action with the entered fields", async () => {
    createCustomWeeklyRuleAction.mockResolvedValue({ ok: true, rule: existingRule() });
    const onSaved = vi.fn();

    render(<ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={null} onSaved={onSaved} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("לדוגמה: 📌 תזכורת לאילוצים"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });
    fireEvent.click(screen.getByText("יצירת התראה מחזורית"));

    await waitFor(() =>
      expect(createCustomWeeklyRuleAction).toHaveBeenCalledWith({
        title: "כותרת",
        body: "תוכן",
        weekday: 6,
        localHour: 21,
        localMinute: 0,
        audienceKind: "everyone",
        targetPersonIds: [],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("selecting 'אדם מסוים' requires exactly one person before submit is enabled", () => {
    render(<ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={null} onSaved={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText("לדוגמה: 📌 תזכורת לאילוצים"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });
    fireEvent.click(screen.getByText("אדם מסוים"));

    const submitButton = screen.getByText("יצירת התראה מחזורית");
    expect(submitButton).toBeDisabled();

    fireEvent.click(screen.getByText("דנה"));
    expect(submitButton).not.toBeDisabled();
  });

  it("shows a truthful error message when the server rejects the request", async () => {
    createCustomWeeklyRuleAction.mockResolvedValue({ ok: false, error: "invalid_title" });

    render(<ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={null} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("לדוגמה: 📌 תזכורת לאילוצים"), { target: { value: "כותרת" } });
    fireEvent.change(screen.getByPlaceholderText("תוכן ההתראה שיוצג לאנשי הצוות"), { target: { value: "תוכן" } });
    fireEvent.click(screen.getByText("יצירת התראה מחזורית"));

    await waitFor(() => expect(screen.getByText(/כותרת ההתראה חייבת להיות/)).toBeTruthy());
  });
});

describe("ManagerRecurringRuleComposer -- edit mode", () => {
  it("pre-fills every field from the editing rule", () => {
    render(
      <ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={existingRule()} onSaved={vi.fn()} onCancel={vi.fn()} />,
    );

    expect(screen.getByText("✏️ עריכת התראה מחזורית")).toBeTruthy();
    expect(screen.getByDisplayValue("כותרת קיימת")).toBeTruthy();
    expect(screen.getByDisplayValue("גוף קיים")).toBeTruthy();
  });

  it("submits the update action for the existing rule id", async () => {
    updateCustomWeeklyRuleAction.mockResolvedValue({ ok: true, rule: existingRule({ title: "כותרת חדשה" }) });
    const onSaved = vi.fn();

    render(
      <ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={existingRule()} onSaved={onSaved} onCancel={vi.fn()} />,
    );

    fireEvent.change(screen.getByDisplayValue("כותרת קיימת"), { target: { value: "כותרת חדשה" } });
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() =>
      expect(updateCustomWeeklyRuleAction).toHaveBeenCalledWith(
        "rule-custom-1",
        expect.objectContaining({ title: "כותרת חדשה" }),
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("calls onCancel when ביטול is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ManagerRecurringRuleComposer roster={ROSTER} adoptionPeople={ADOPTION} editingRule={existingRule()} onSaved={vi.fn()} onCancel={onCancel} />,
    );

    fireEvent.click(screen.getByText("ביטול"));
    expect(onCancel).toHaveBeenCalled();
  });
});
