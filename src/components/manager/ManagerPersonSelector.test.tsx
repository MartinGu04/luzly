import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ManagerPersonSelector } from "./ManagerPersonSelector";

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
  { id: "p_martin", name: "מרטין בדיקה", personnelType: null, isSupervisor: false, isTechnician: false },
  { id: "p_eitan", name: "איתן דוגמה", personnelType: null, isSupervisor: false, isTechnician: false },
];

function openListbox() {
  fireEvent.click(screen.getByRole("button", { name: /בחירת איש\/אשת צוות|כולם|מרטין|איתן/ }));
}

describe("ManagerPersonSelector", () => {
  it("shows 'כולם' as the trigger label when nobody is selected", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    expect(screen.getByRole("button")).toHaveTextContent("כולם");
  });

  it("shows the given person's name as the trigger label when selected", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId="p_eitan" />);
    expect(screen.getByRole("button")).toHaveTextContent("איתן דוגמה");
  });

  it("clicking the trigger opens the listbox showing 'כולם' first, then every person", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["כולם", "מרטין בדיקה", "איתן דוגמה"]);
  });

  it("clicking a person option navigates to /manager?person=<id>", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "מרטין בדיקה" }));
    expect(push).toHaveBeenCalledWith("/manager?person=p_martin");
  });

  it("selecting 'כולם' removes the person param", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("person=p_martin"));
    render(<ManagerPersonSelector people={PEOPLE} selectedId="p_martin" />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "כולם" }));
    expect(push).toHaveBeenCalledWith("/manager");
  });

  it("preserves other params (range/problems) when switching person", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("range=30d&problems=1"));
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "איתן דוגמה" }));
    const calledWith = push.mock.calls[0][0] as string;
    expect(calledWith).toContain("person=p_eitan");
    expect(calledWith).toContain("range=30d");
    expect(calledWith).toContain("problems=1");
  });

  it("closes the listbox after selecting an option", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    fireEvent.click(screen.getByRole("option", { name: "מרטין בדיקה" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Escape closes the listbox without navigating", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("the trigger's accessible name is contextual, not just the bare visible selection text", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "בחירת איש/אשת צוות: כולם");
  });

  it("groups people by קבע/סדיר/מילואים when they have that data -- data-driven, not hardcoded", () => {
    const grouped = [
      { id: "p1", name: "קבוע/ה", personnelType: "קבע", isSupervisor: false, isTechnician: false },
      { id: "p2", name: "מילואימניק/ית", personnelType: "מילואים", isSupervisor: false, isTechnician: false },
    ];
    render(<ManagerPersonSelector people={grouped} selectedId={null} />);
    openListbox();
    expect(screen.getByText("קבע")).toBeInTheDocument();
    expect(screen.getByText("מילואים")).toBeInTheDocument();
  });
});
