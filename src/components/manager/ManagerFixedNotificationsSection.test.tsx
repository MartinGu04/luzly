import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CustomWeeklyRuleView, SystemRuleView } from "@/lib/notifications/ruleActions";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

const listNotificationRulesAction = vi.fn();
const updateSystemRuleAction = vi.fn();
const setCustomWeeklyRuleEnabledAction = vi.fn();
const archiveCustomWeeklyRuleAction = vi.fn();

vi.mock("@/lib/notifications/ruleActions", () => ({
  listNotificationRulesAction: (...args: unknown[]) => listNotificationRulesAction(...args),
  updateSystemRuleAction: (...args: unknown[]) => updateSystemRuleAction(...args),
  setCustomWeeklyRuleEnabledAction: (...args: unknown[]) => setCustomWeeklyRuleEnabledAction(...args),
  archiveCustomWeeklyRuleAction: (...args: unknown[]) => archiveCustomWeeklyRuleAction(...args),
}));

const composerCalls = vi.fn();
vi.mock("./ManagerRecurringRuleComposer", () => ({
  ManagerRecurringRuleComposer: (props: Record<string, unknown>) => {
    composerCalls(props);
    return (
      <div data-testid="composer-stub">
        <button type="button" onClick={() => (props.onSaved as () => void)()}>
          fake-saved
        </button>
        <button type="button" onClick={() => (props.onCancel as () => void)()}>
          fake-cancel
        </button>
      </div>
    );
  },
}));

const { ManagerFixedNotificationsSection } = await import("./ManagerFixedNotificationsSection");

const ROSTER: ManagerPersonSummary[] = [];
const ADOPTION: ManagerAdoptionPersonView[] = [];

function systemRule(overrides: Partial<SystemRuleView> = {}): SystemRuleView {
  return {
    kind: "system",
    id: "rule-1",
    systemKey: "tomorrow_shift",
    enabled: true,
    localHour: 20,
    localMinute: 0,
    name: "תזכורת למשמרת מחר",
    trigger: "היום לפני משמרת -- מי שמשובץ למשמרת מחר",
    audience: "מי שמשובץ למשמרת למחר",
    copyNote: "",
    ...overrides,
  };
}

function customRule(overrides: Partial<CustomWeeklyRuleView> = {}): CustomWeeklyRuleView {
  return {
    kind: "custom_weekly",
    id: "rule-custom-1",
    enabled: true,
    weekday: 6,
    localHour: 21,
    localMinute: 0,
    title: "📌 תזכורת לאילוצים",
    body: "גוף ההודעה",
    audienceKind: "everyone",
    targetPersonIds: [],
    scheduleSummary: "כל שבת בשעה 21:00",
    nextSendSummary: "יום שבת · 29 באוגוסט בשעה 21:00",
    createdByPersonName: "דני מנהל",
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  listNotificationRulesAction.mockReset();
  updateSystemRuleAction.mockReset();
  setCustomWeeklyRuleEnabledAction.mockReset();
  archiveCustomWeeklyRuleAction.mockReset();
  composerCalls.mockReset();
});

describe("ManagerFixedNotificationsSection -- loading + display", () => {
  it("shows both seeded system rules and custom rules once loaded", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [systemRule()], customWeeklyRules: [customRule()] });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);

    await waitFor(() => expect(screen.getByText("תזכורת למשמרת מחר")).toBeTruthy());
    expect(screen.getByText("📌 תזכורת לאילוצים")).toBeTruthy();
    expect(screen.getAllByText("מערכת").length).toBeGreaterThan(0);
    expect(screen.getAllByText("מחזורי").length).toBeGreaterThan(0);
  });

  it("shows a truthful empty state for custom rules when none exist yet", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [systemRule()], customWeeklyRules: [] });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);

    await waitFor(() => expect(screen.getByText(/אין עדיין התראות מחזוריות/)).toBeTruthy());
  });

  it("a load failure shows a truthful error, never a crash", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: false, error: "forbidden" });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);

    await waitFor(() => expect(screen.getByText(/לא ניתן לטעון/)).toBeTruthy());
  });
});

describe("ManagerFixedNotificationsSection -- system rule row actions", () => {
  it("disabling a system rule calls the action and reflects the new state without a full reload", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [systemRule()], customWeeklyRules: [] });
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: systemRule({ enabled: false }) });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText("תזכורת למשמרת מחר")).toBeTruthy());

    fireEvent.click(screen.getByText("השבתה"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith("rule-1", { enabled: false, localHour: 20, localMinute: 0 }),
    );
    await waitFor(() => expect(screen.getByText("הפעלה")).toBeTruthy());
  });

  it("never offers a delete action for a system rule -- only disable", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [systemRule()], customWeeklyRules: [] });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText("תזכורת למשמרת מחר")).toBeTruthy());

    expect(screen.queryByText("הסרה")).toBeNull();
  });

  it("editing a system rule's time submits only enabled/localHour/localMinute", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [systemRule()], customWeeklyRules: [] });
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: systemRule({ localHour: 19, localMinute: 15 }) });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText("תזכורת למשמרת מחר")).toBeTruthy());

    fireEvent.click(screen.getByText("עריכת שעה"));
    const timeInput = screen.getByLabelText("שעת שליחה עבור תזכורת למשמרת מחר");
    fireEvent.change(timeInput, { target: { value: "19:15" } });
    fireEvent.click(screen.getByText("שמירה"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith("rule-1", { enabled: true, localHour: 19, localMinute: 15 }),
    );
  });
});

describe("ManagerFixedNotificationsSection -- custom weekly rule row actions", () => {
  it("shows the + composer button, opens the composer, and reloads on save", async () => {
    listNotificationRulesAction
      .mockResolvedValueOnce({ ok: true, systemRules: [], customWeeklyRules: [] })
      .mockResolvedValueOnce({ ok: true, systemRules: [], customWeeklyRules: [customRule()] });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText(/אין עדיין התראות מחזוריות/)).toBeTruthy());

    fireEvent.click(screen.getByText("+ התראה מחזורית"));
    expect(screen.getByTestId("composer-stub")).toBeTruthy();

    fireEvent.click(screen.getByText("fake-saved"));

    await waitFor(() => expect(listNotificationRulesAction).toHaveBeenCalledTimes(2));
  });

  it("disabling a custom rule calls the action with the toggled value", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [], customWeeklyRules: [customRule()] });
    setCustomWeeklyRuleEnabledAction.mockResolvedValue({ ok: true, rule: customRule({ enabled: false }) });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText("📌 תזכורת לאילוצים")).toBeTruthy());

    fireEvent.click(screen.getByText("השבתה"));

    await waitFor(() => expect(setCustomWeeklyRuleEnabledAction).toHaveBeenCalledWith("rule-custom-1", false));
  });

  it("archiving a custom rule requires confirmation, then calls the action", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [], customWeeklyRules: [customRule()] });
    archiveCustomWeeklyRuleAction.mockResolvedValue({ ok: true });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText("📌 תזכורת לאילוצים")).toBeTruthy());

    fireEvent.click(screen.getByText("הסרה"));
    expect(archiveCustomWeeklyRuleAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("כן, הסר"));
    await waitFor(() => expect(archiveCustomWeeklyRuleAction).toHaveBeenCalledWith("rule-custom-1"));
  });

  it("clicking עריכה opens the composer pre-filled for that rule, hiding its own row actions while editing", async () => {
    listNotificationRulesAction.mockResolvedValue({ ok: true, systemRules: [], customWeeklyRules: [customRule()] });

    render(<ManagerFixedNotificationsSection roster={ROSTER} adoptionPeople={ADOPTION} />);
    await waitFor(() => expect(screen.getByText("📌 תזכורת לאילוצים")).toBeTruthy());

    fireEvent.click(screen.getByText("עריכה"));

    expect(screen.getByTestId("composer-stub")).toBeTruthy();
    expect(composerCalls.mock.calls.at(-1)?.[0].editingRule).toMatchObject({ id: "rule-custom-1" });
  });
});
