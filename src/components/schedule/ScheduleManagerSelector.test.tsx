import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ScheduleManagerSelector } from "./ScheduleManagerSelector";

const push = vi.fn();
const useRouter = vi.fn(() => ({ push }));
const useSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => useRouter(),
  useSearchParams: () => useSearchParams(),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  useSearchParams.mockReturnValue(new URLSearchParams());
});

const PEOPLE = [
  { id: "p_daniel", name: "דניאל כהן", personnelType: null, isSupervisor: false, isTechnician: false },
  { id: "p_eitan", name: "איתן דוגמה", personnelType: null, isSupervisor: false, isTechnician: false },
];

function openListbox() {
  fireEvent.click(screen.getByRole("button"));
}

describe("ScheduleManagerSelector — option order and labels (PR #24 §5/§6)", () => {
  it("shows 'אני — <name>' as the trigger label by default (self)", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    expect(screen.getByRole("button")).toHaveTextContent("אני — מרטין גוסין");
  });

  it("lists options in order: אני, כולם, then the roster", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["אני — מרטין גוסין", "כולם", "דניאל כהן", "איתן דוגמה"]);
  });

  it("shows 'כולם' as the trigger label in everyone perspective", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="all" selectedPersonId={null} />);
    expect(screen.getByRole("button")).toHaveTextContent("כולם");
  });

  it("shows the selected person's name as the trigger label in person perspective", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="person" selectedPersonId="p_eitan" />);
    expect(screen.getByRole("button")).toHaveTextContent("איתן דוגמה");
  });

  it("marks the currently selected option with aria-selected", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="person" selectedPersonId="p_daniel" />);
    openListbox();
    const options = screen.getAllByRole("option");
    expect(options[2]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
  });
});

describe("ScheduleManagerSelector — navigation preserves month (PR #24 §8)", () => {
  it("selecting 'כולם' sets person=all and preserves the existing month param", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("month=2026-08"));
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "כולם" }));
    expect(push).toHaveBeenCalledWith("/schedule?month=2026-08&person=all");
  });

  it("selecting a roster person sets person=<id> and preserves the month param", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("month=2026-08"));
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "דניאל כהן" }));
    expect(push).toHaveBeenCalledWith("/schedule?month=2026-08&person=p_daniel");
  });

  it("selecting 'אני' removes the person param entirely rather than writing person=self", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("month=2026-08&person=all"));
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="all" selectedPersonId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "אני — מרטין גוסין" }));
    expect(push).toHaveBeenCalledWith("/schedule?month=2026-08");
  });

  it("selecting the already-selected option does not navigate", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "אני — מרטין גוסין" }));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("ScheduleManagerSelector — keyboard/accessibility", () => {
  it("is closed by default, aria-haspopup listbox, aria-expanded false", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes the listbox and returns focus to the trigger", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("button")).toHaveFocus();
  });

  it("ArrowDown/Enter selects the next option", () => {
    useSearchParams.mockReturnValue(new URLSearchParams());
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    const searchbox = screen.getByRole("searchbox");
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });
    fireEvent.keyDown(searchbox, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/schedule?person=all");
  });

  it("clicking outside the control closes the listbox", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="self" selectedPersonId={null} />);
    openListbox();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("the trigger has a contextual accessible label including the current selection", () => {
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={PEOPLE} perspective="all" selectedPersonId={null} />);
    expect(screen.getByRole("button", { name: /מציג לוח עבור: כולם/ })).toBeInTheDocument();
  });
});

describe("ScheduleManagerSelector — data-driven grouping", () => {
  it("groups the roster by קבע/סדיר/מילואים when that data is present -- data-driven, not hardcoded", () => {
    const grouped = [
      { id: "p1", name: "קבוע/ה", personnelType: "קבע", isSupervisor: false, isTechnician: false },
      { id: "p2", name: "מילואימניק/ית", personnelType: "מילואים", isSupervisor: false, isTechnician: false },
    ];
    render(<ScheduleManagerSelector managerName="מרטין גוסין" people={grouped} perspective="self" selectedPersonId={null} />);
    openListbox();
    expect(screen.getByText("קבע")).toBeInTheDocument();
    expect(screen.getByText("מילואים")).toBeInTheDocument();
  });
});
