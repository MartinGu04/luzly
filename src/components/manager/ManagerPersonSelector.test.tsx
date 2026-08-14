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
  { id: "p_martin", name: "מרטין בדיקה" },
  { id: "p_eitan", name: "איתן דוגמה" },
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

  it("is closed by default, aria-haspopup listbox, aria-expanded false", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    const button = screen.getByRole("button");
    expect(button).toHaveAttribute("aria-haspopup", "listbox");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicking the trigger opens the listbox showing 'כולם' first, then every person", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    expect(screen.getByRole("button")).toHaveAttribute("aria-expanded", "true");
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["כולם", "מרטין בדיקה", "איתן דוגמה"]);
  });

  it("marks the currently selected option with aria-selected", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId="p_martin" />);
    openListbox();
    const options = screen.getAllByRole("option");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");
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
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("ArrowDown moves the highlighted option, Enter selects it", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/manager?person=p_martin");
  });

  it("Space selects the highlighted option", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    const listbox = screen.getByRole("listbox");
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    fireEvent.keyDown(listbox, { key: " " });
    expect(push).toHaveBeenCalledWith("/manager?person=p_martin");
  });

  it("has aria-controls linking the trigger to the listbox id", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    const button = screen.getByRole("button");
    const listbox = screen.getByRole("listbox");
    expect(button.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("the trigger's accessible name is contextual, not just the bare visible selection text", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "בחירת איש/אשת צוות: כולם");
  });

  it("the trigger's contextual label updates to reflect the selected person", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId="p_eitan" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "בחירת איש/אשת צוות: איתן דוגמה");
  });

  it("Tab (focus leaving the listbox to an element outside the component) closes the menu", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    const listbox = screen.getByRole("listbox");
    const outsideElement = document.createElement("div");
    document.body.appendChild(outsideElement);
    fireEvent.blur(listbox, { relatedTarget: outsideElement });
    expect(screen.queryByRole("listbox")).toBeNull();
    document.body.removeChild(outsideElement);
  });

  it("Shift+Tab (focus leaving backward) closes the menu the same way", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    const listbox = screen.getByRole("listbox");
    fireEvent.blur(listbox, { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("closing via Tab never navigates -- it's a pure focus event, not a selection", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    fireEvent.blur(screen.getByRole("listbox"), { relatedTarget: document.body });
    expect(push).not.toHaveBeenCalled();
  });

  it("Shift+Tab back onto the trigger button also closes the menu -- no reason to leave it open once focus returns to its own trigger", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    openListbox();
    const listbox = screen.getByRole("listbox");
    const button = screen.getByRole("button");
    expect(() => fireEvent.blur(listbox, { relatedTarget: button })).not.toThrow();
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
