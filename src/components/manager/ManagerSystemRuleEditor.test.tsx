import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SystemRuleView } from "@/lib/notifications/ruleActions";
import type { ManagerAdoptionPersonView, ManagerPersonSummary } from "@/lib/readModels/managerTypes";

const updateSystemRuleAction = vi.fn();

vi.mock("@/lib/notifications/ruleActions", () => ({
  updateSystemRuleAction: (...args: unknown[]) => updateSystemRuleAction(...args),
}));

const { ManagerSystemRuleEditor } = await import("./ManagerSystemRuleEditor");

afterEach(() => {
  cleanup();
  updateSystemRuleAction.mockReset();
});

const ROSTER: ManagerPersonSummary[] = [
  { id: "p_dana", name: "דנה", isManager: false, isTechnician: true, isSupervisor: false, personnelType: null },
];
const ADOPTION: ManagerAdoptionPersonView[] = [];

function dynamicRule(overrides: Partial<SystemRuleView> = {}): SystemRuleView {
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
    revision: 1,
    titleOverride: null,
    bodyOverride: null,
    audienceMode: "all_eligible",
    targetPersonIds: [],
    bodyKind: "dynamic_details_required",
    defaultTitle: "⏰ המשמרת שלך מחר",
    defaultBody: null,
    audienceFilterNote: "ההתראה עדיין תישלח רק למי שיש לו משמרת מחר בפועל.",
    ...overrides,
  };
}

function staticRule(overrides: Partial<SystemRuleView> = {}): SystemRuleView {
  return dynamicRule({
    systemKey: "constraints_sunday",
    name: "תזכורת לאילוצים -- יום ראשון",
    bodyKind: "static_editable",
    defaultTitle: "📌 תזכורת לאילוצים",
    defaultBody: "יש אילוץ לשבוע הבא? אפשר לשלוח עד מחר.",
    audienceFilterNote: "קבע מוחרגים תמיד, גם אם נבחרו ברשימה.",
    ...overrides,
  });
}

describe("ManagerSystemRuleEditor -- fields + submission", () => {
  it("submits enabled/time/copy/audience exactly as entered, defaulting to the rule's own current values", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: dynamicRule() });
    const onSaved = vi.fn();

    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith("rule-1", {
        enabled: true,
        localHour: 20,
        localMinute: 0,
        titleOverride: null,
        bodyOverride: null,
        audienceMode: "all_eligible",
        targetPersonIds: [],
      }),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("editing title/body sends the trimmed override text", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: dynamicRule() });

    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("⏰ המשמרת שלך מחר"), { target: { value: "  כותרת חדשה  " } });
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith("rule-1", expect.objectContaining({ titleOverride: "כותרת חדשה" })),
    );
  });

  it("dynamic-body rule: a body without {details} disables submit and shows the validation error", () => {
    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);

    const bodyInput = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.change(bodyInput, { target: { value: "תוכן בלי הפרטים" } });

    expect(screen.getByText(/חייב להכיל את/)).toBeTruthy();
    expect(screen.getByText("שמירת שינויים")).toBeDisabled();
  });

  it("dynamic-body rule: a body containing {details} exactly once is accepted", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: dynamicRule() });

    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const bodyInput = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.change(bodyInput, { target: { value: "תזכורת חשובה 👀 {details}" } });
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith("rule-1", expect.objectContaining({ bodyOverride: "תזכורת חשובה 👀 {details}" })),
    );
  });

  it("static-body rule: free text with no {details} is accepted -- no placeholder requirement", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: staticRule() });

    render(<ManagerSystemRuleEditor rule={staticRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    const bodyInput = screen.getAllByRole("textbox").find((el) => el.tagName === "TEXTAREA")!;
    fireEvent.change(bodyInput, { target: { value: "תוכן חופשי לגמרי" } });

    expect(screen.getByText("שמירת שינויים")).not.toBeDisabled();
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith("rule-1", expect.objectContaining({ bodyOverride: "תוכן חופשי לגמרי" })),
    );
  });

  it("איפוס לברירת מחדל clears title/body only, leaving audience untouched", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: dynamicRule() });
    const rule = dynamicRule({ titleOverride: "ישן", bodyOverride: "ישן {details}", audienceMode: "selected", targetPersonIds: ["p_dana"] });

    render(<ManagerSystemRuleEditor rule={rule} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("איפוס לברירת מחדל"));
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ titleOverride: null, bodyOverride: null, audienceMode: "selected", targetPersonIds: ["p_dana"] }),
      ),
    );
  });

  it("switching to 'אנשים מסוימים' with nothing selected disables submit; selecting a roster person enables it and reuses RosterPersonPicker", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: true, rule: dynamicRule() });

    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("אנשים מסוימים"));
    expect(screen.getByText("שמירת שינויים")).toBeDisabled();

    fireEvent.click(screen.getByText("דנה"));
    expect(screen.getByText("שמירת שינויים")).not.toBeDisabled();

    fireEvent.click(screen.getByText("שמירת שינויים"));
    await waitFor(() =>
      expect(updateSystemRuleAction).toHaveBeenCalledWith(
        "rule-1",
        expect.objectContaining({ audienceMode: "selected", targetPersonIds: ["p_dana"] }),
      ),
    );
  });

  it("shows the rule's own audienceFilterNote -- explicit that selection is a restriction, never an override", () => {
    render(<ManagerSystemRuleEditor rule={staticRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(staticRule().audienceFilterNote)).toBeTruthy();
  });

  it("cancel calls onCancel without submitting", () => {
    const onCancel = vi.fn();
    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("ביטול"));

    expect(onCancel).toHaveBeenCalled();
    expect(updateSystemRuleAction).not.toHaveBeenCalled();
  });

  it("a server-side rejection shows a truthful error, never a silent failure", async () => {
    updateSystemRuleAction.mockResolvedValue({ ok: false, error: "invalid_body_details_placeholder" });

    render(<ManagerSystemRuleEditor rule={dynamicRule()} roster={ROSTER} adoptionPeople={ADOPTION} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() => expect(screen.getByText(/פעם אחת בדיוק/)).toBeTruthy());
  });
});
