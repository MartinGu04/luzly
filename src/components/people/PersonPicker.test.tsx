import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { PersonPicker, type PersonPickerPerson } from "./PersonPicker";

afterEach(() => {
  cleanup();
});

function person(overrides: Partial<PersonPickerPerson> = {}): PersonPickerPerson {
  return {
    id: "p_martin",
    name: "מרטין בדיקה",
    personnelType: null,
    isSupervisor: false,
    isTechnician: false,
    ...overrides,
  };
}

const BASE_PROPS = {
  leadingOptions: [{ value: "all", label: "כולם" }],
  selectedValue: "all",
  onSelect: vi.fn(),
  isPending: false,
  listboxId: "test-listbox",
  listAriaLabel: "בחירת איש/אשת צוות",
  triggerAriaLabel: (label: string) => `בחירת איש/אשת צוות: ${label}`,
};

function openPopup() {
  fireEvent.click(screen.getByRole("button"));
}

describe("PersonPicker — basic single-select behavior", () => {
  it("shows the leading option's label as the trigger when nothing else is selected", () => {
    render(<PersonPicker {...BASE_PROPS} people={[person()]} />);
    expect(screen.getByRole("button")).toHaveTextContent("כולם");
  });

  it("shows the selected person's name as the trigger label", () => {
    render(<PersonPicker {...BASE_PROPS} people={[person()]} selectedValue="p_martin" />);
    expect(screen.getByRole("button")).toHaveTextContent("מרטין בדיקה");
  });

  it("is closed by default", () => {
    render(<PersonPicker {...BASE_PROPS} people={[person()]} />);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicking a person option calls onSelect with their id and closes the popup", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={[person()]} onSelect={onSelect} />);
    openPopup();
    fireEvent.click(screen.getByRole("option", { name: "מרטין בדיקה" }));
    expect(onSelect).toHaveBeenCalledWith("p_martin");
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("PersonPicker — data-driven grouping (קבע / סדיר / מילואים)", () => {
  it("groups people into קבע, סדיר (with אחמ״שים/טכנאים subgroups), and מילואים -- purely from their own data fields", () => {
    const people: PersonPickerPerson[] = [
      person({ id: "p1", name: "קבוע אחד", personnelType: "קבע" }),
      person({ id: "p2", name: "אחמש אחד", personnelType: "חובה", isSupervisor: true }),
      person({ id: "p3", name: "טכנאי אחד", personnelType: "חובה", isTechnician: true }),
      person({ id: "p4", name: "מילואימניק", personnelType: "מילואים" }),
    ];
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("קבע")).toBeInTheDocument();
    expect(within(listbox).getByText("סדיר · אחמ״שים")).toBeInTheDocument();
    expect(within(listbox).getByText("סדיר · טכנאים")).toBeInTheDocument();
    expect(within(listbox).getByText("מילואים")).toBeInTheDocument();

    const optionLabels = within(listbox)
      .getAllByRole("option")
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(["כולם", "קבוע אחד", "אחמש אחד", "טכנאי אחד", "מילואימניק"]);
  });

  it("a newly-added person with the right personnelType/role fields appears in the correct group automatically -- zero special-casing", () => {
    const existing = [person({ id: "p1", name: "ותיק", personnelType: "קבע" })];
    const withNewPerson = [
      ...existing,
      person({ id: "p2", name: "חדש/ה בצוות", personnelType: "מילואים" }),
    ];

    render(<PersonPicker {...BASE_PROPS} people={withNewPerson} />);
    openPopup();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("חדש/ה בצוות")).toBeInTheDocument();
    expect(within(listbox).getByText("מילואים")).toBeInTheDocument();
  });

  it("a person with no/unrecognized personnelType is never dropped -- lands under לא מסווג", () => {
    render(<PersonPicker {...BASE_PROPS} people={[person({ personnelType: null })]} />);
    openPopup();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("לא מסווג")).toBeInTheDocument();
    expect(within(listbox).getByText("מרטין בדיקה")).toBeInTheDocument();
  });

  it("never renders an empty group section", () => {
    render(<PersonPicker {...BASE_PROPS} people={[person({ personnelType: "קבע" })]} />);
    openPopup();
    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText("סדיר")).toBeNull();
    expect(within(listbox).queryByText("מילואים")).toBeNull();
  });
});

describe("PersonPicker — search", () => {
  const people: PersonPickerPerson[] = [
    person({ id: "p1", name: "דני קבוע", personnelType: "קבע" }),
    person({ id: "p2", name: "רותם אחמ״שית", personnelType: "חובה", isSupervisor: true }),
    person({ id: "p3", name: "נועה מילואים", personnelType: "מילואים" }),
  ];

  it("filters people by name across every group", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "רותם" } });

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("רותם אחמ״שית")).toBeInTheDocument();
    expect(within(listbox).queryByText("דני קבוע")).toBeNull();
    expect(within(listbox).queryByText("נועה מילואים")).toBeNull();
  });

  it("hides a group's header entirely once it has zero matching people -- never an empty section", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "רותם" } });

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).queryByText("קבע")).toBeNull();
    expect(within(listbox).queryByText("מילואים")).toBeNull();
    expect(within(listbox).getByText("סדיר · אחמ״שים")).toBeInTheDocument();
  });

  it("a matching person stays clearly associated with their own group heading", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "נועה" } });

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("מילואים")).toBeInTheDocument();
    expect(within(listbox).getByText("נועה מילואים")).toBeInTheDocument();
  });

  it("always keeps leading options visible regardless of the search query", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "נועה" } });
    expect(screen.getByRole("option", { name: "כולם" })).toBeInTheDocument();
  });

  it("shows a no-matches message when the query matches nobody", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "לא קיים" } });
    expect(screen.getByText("לא נמצאו התאמות")).toBeInTheDocument();
  });

  it("resets the search query every time the popup is reopened", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "רותם" } });
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    openPopup();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByText("דני קבוע")).toBeInTheDocument();
  });

  it("keeps showing the real selected person's name on the trigger even while a query would filter them out", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} selectedValue="p1" />);
    expect(screen.getByRole("button")).toHaveTextContent("דני קבוע");
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "רותם" } });
    expect(screen.getByRole("button")).toHaveTextContent("דני קבוע");
  });
});

describe("PersonPicker — selection and keyboard", () => {
  const people = [person({ id: "p1", name: "אדם ראשון" }), person({ id: "p2", name: "אדם שני" })];

  it("clicking a person option calls onSelect with their id", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    fireEvent.click(screen.getByRole("option", { name: "אדם ראשון" }));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("clicking the leading option calls onSelect with its value", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} selectedValue="p1" />);
    openPopup();
    fireEvent.click(screen.getByRole("option", { name: "כולם" }));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("marks the selected option with aria-selected", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} selectedValue="p2" />);
    openPopup();
    expect(screen.getByRole("option", { name: "אדם שני" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option", { name: "אדם ראשון" })).toHaveAttribute("aria-selected", "false");
  });

  it("closes the popup after selecting, without calling onSelect again for the same value", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} selectedValue="p1" />);
    openPopup();
    fireEvent.click(screen.getByRole("option", { name: "אדם ראשון" }));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("Escape closes the popup without selecting", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ArrowDown moves the highlight past the leading option onto the first person, Enter selects it", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    const searchbox = screen.getByRole("searchbox");
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });
    fireEvent.keyDown(searchbox, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("blur to an element outside the picker closes the popup without selecting", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.blur(screen.getByRole("searchbox"), { relatedTarget: outside });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    document.body.removeChild(outside);
  });

  it("aria-controls on the trigger links to the listbox id", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    const button = screen.getByRole("button");
    const listbox = screen.getByRole("listbox");
    expect(button.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("the trigger's accessible name is contextual, not just the bare visible text", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-label", "בחירת איש/אשת צוות: כולם");
  });
});

/**
 * Regression coverage for a real bug: clicking an option did nothing.
 * `fireEvent.click(option)` alone (used above) does NOT reproduce it --
 * jsdom doesn't automatically blur a focused element just because
 * mousedown landed on a different, non-focusable one, so those tests
 * passed even with the bug present. A real browser does: mousedown on the
 * non-focusable `<li role="option">` blurs the focused search input
 * (relatedTarget ends up outside the picker, e.g. <body>) BEFORE `click`
 * fires -- UNLESS the mousedown's default action was prevented, which is
 * exactly what stops a real browser's focus-shift algorithm from running.
 * `realClick` reproduces that ordering explicitly, gated on
 * `fireEvent.mouseDown`'s own return value (`false` once
 * `preventDefault()` was called during dispatch) so this test actually
 * exercises the fix rather than unconditionally simulating a blur that a
 * real browser would never fire once mousedown is prevented.
 */
function realClick(element: HTMLElement) {
  const searchbox = screen.getByRole("searchbox");
  const mousedownNotPrevented = fireEvent.mouseDown(element);
  if (mousedownNotPrevented) {
    fireEvent.blur(searchbox, { relatedTarget: document.body });
  }
  fireEvent.mouseUp(element);
  fireEvent.click(element);
}

describe("PersonPicker — real click event ordering (mousedown blurs the input before click fires)", () => {
  const people = [person({ id: "p1", name: "אדם ראשון" }), person({ id: "p2", name: "אדם שני" })];

  it("clicking a person with the real mousedown->blur->mouseup->click sequence still selects them", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    realClick(screen.getByRole("option", { name: "אדם ראשון" }));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("clicking the leading option (כולם) with the real event sequence still selects it", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} selectedValue="p1" />);
    openPopup();
    realClick(screen.getByRole("option", { name: "כולם" }));
    expect(onSelect).toHaveBeenCalledWith("all");
  });

  it("the popup closes after a real-sequence selection", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    realClick(screen.getByRole("option", { name: "אדם ראשון" }));
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("a real mousedown on an element outside the picker still closes it without selecting", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    const outside = document.createElement("div");
    document.body.appendChild(outside);
    fireEvent.mouseDown(outside);
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    document.body.removeChild(outside);
  });

  it("keyboard Enter selection is unaffected by the mousedown fix", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    const searchbox = screen.getByRole("searchbox");
    fireEvent.keyDown(searchbox, { key: "ArrowDown" });
    fireEvent.keyDown(searchbox, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("Tab/Shift+Tab away (a genuine keyboard-driven blur, not a mousedown one) still closes the popup", () => {
    const onSelect = vi.fn();
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} />);
    openPopup();
    fireEvent.blur(screen.getByRole("searchbox"), { relatedTarget: document.body });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe("PersonPicker — zero-search-results state never leaves a hidden selectable option", () => {
  const people = [person({ id: "p1", name: "אדם ראשון" }), person({ id: "p2", name: "אדם שני" })];

  it("every rendered role=\"option\" is exactly the set of keyboard-selectable rows once a search matches nobody", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "לא קיים בכלל" } });

    expect(screen.getByText("לא נמצאו התאמות")).toBeInTheDocument();
    // Leading options remain rendered as real, selectable options -- only
    // the person rows (and their headers) are replaced by the message.
    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["כולם"]);
  });

  it("the no-matches message itself is never announced as a selectable option", () => {
    render(<PersonPicker {...BASE_PROPS} people={people} />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "לא קיים בכלל" } });
    const message = screen.getByText("לא נמצאו התאמות");
    expect(message).toHaveAttribute("role", "presentation");
  });

  it("keyboard highlight/Enter in the zero-match state only ever reaches a rendered leading option, never a hidden person row", () => {
    const onSelect = vi.fn();
    // Start from a person already selected (not the leading "כולם" option)
    // so that highlighting/selecting "כולם" after the search empties out
    // is a real, observable change -- not a same-value no-op.
    render(<PersonPicker {...BASE_PROPS} people={people} onSelect={onSelect} selectedValue="p1" />);
    openPopup();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "לא קיים בכלל" } });

    const searchbox = screen.getByRole("searchbox");
    // aria-activedescendant must reference an id that is actually in the DOM.
    const activeId = searchbox.getAttribute("aria-activedescendant");
    expect(activeId).not.toBeNull();
    expect(document.getElementById(activeId as string)).not.toBeNull();
    expect(document.getElementById(activeId as string)).toHaveTextContent("כולם");

    fireEvent.keyDown(searchbox, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("all");
  });
});
