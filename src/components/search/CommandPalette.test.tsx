import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SearchReadModel } from "@/lib/readModels/searchTypes";
import { SearchPaletteProvider } from "./SearchPaletteProvider";
import { SearchTriggerButton } from "./SearchTriggerButton";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const ME_ID = "p_me";
const COLLEAGUE_ID = "p_ilay";

function fixtureModel(overrides: Partial<SearchReadModel> = {}): SearchReadModel {
  return {
    fetchedAt: "2026-08-01T08:00:00.000Z",
    localNow: { date: "2026-08-01", minuteOfDay: 600 },
    meId: ME_ID,
    roster: [
      { id: ME_ID, name: "דני בדיקה", personnelType: "חובה", isSupervisor: false, isTechnician: true },
      { id: COLLEAGUE_ID, name: "עילאי כהן", personnelType: "קבע", isSupervisor: true, isTechnician: false },
      { id: "p_roni", name: "רוני שדה", personnelType: "חובה", isSupervisor: false, isTechnician: true },
    ],
    shiftEvents: [],
    ...overrides,
  };
}

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderPalette(model: SearchReadModel = fixtureModel(), variant: "sidebar" | "mobile" = "sidebar") {
  return render(
    <SearchPaletteProvider searchReadModel={model}>
      <SearchTriggerButton variant={variant} />
    </SearchPaletteProvider>,
  );
}

function dialog() {
  return screen.getByRole("dialog", { name: "חיפוש" });
}

function searchInput() {
  return screen.getByRole("combobox", { name: "חיפוש אנשים, תאריכים ומשמרות" });
}

describe("Command palette — entry points", () => {
  it("27. Cmd+K opens the palette", () => {
    renderPalette();
    expect(screen.queryByRole("dialog")).toBeNull();

    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });

    expect(dialog()).toBeInTheDocument();
  });

  it("27. Ctrl+K also opens the palette", () => {
    renderPalette();
    act(() => {
      fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    });
    expect(dialog()).toBeInTheDocument();
  });

  it("31. the visible mobile trigger opens the palette", () => {
    renderPalette(fixtureModel(), "mobile");
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(dialog()).toBeInTheDocument();
  });

  it("the sidebar trigger opens the palette", () => {
    renderPalette(fixtureModel(), "sidebar");
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(dialog()).toBeInTheDocument();
  });

  it("renders no trigger at all when search data is unavailable", () => {
    render(
      <SearchPaletteProvider searchReadModel={null}>
        <SearchTriggerButton variant="sidebar" />
      </SearchPaletteProvider>,
    );
    expect(screen.queryByRole("button", { name: "חיפוש" })).toBeNull();
  });

  it("Cmd+K is a no-op when search data is unavailable", () => {
    render(
      <SearchPaletteProvider searchReadModel={null}>
        <div>content</div>
      </SearchPaletteProvider>,
    );
    act(() => {
      fireEvent.keyDown(window, { key: "k", metaKey: true });
    });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Command palette — focus and dialog semantics", () => {
  it("32. input receives focus immediately on open", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(document.activeElement).toBe(searchInput());
  });

  it("32. exposes proper dialog semantics (role, aria-modal, accessible label)", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(dialog()).toHaveAttribute("aria-modal", "true");
  });

  it("32. closing returns focus to the trigger that opened it", () => {
    renderPalette();
    const trigger = screen.getByRole("button", { name: "חיפוש" });
    // A real browser click also focuses the button -- fireEvent.click alone
    // doesn't replicate that in jsdom, so it's simulated explicitly here.
    trigger.focus();
    fireEvent.click(trigger);
    expect(dialog()).toBeInTheDocument();

    act(() => {
      fireEvent.keyDown(searchInput(), { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("28. Escape closes the palette", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(dialog()).toBeInTheDocument();

    fireEvent.keyDown(searchInput(), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicking the explicit close button also closes the palette", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.click(screen.getByRole("button", { name: "סגירת חיפוש" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("resets the query on every fresh open, never carrying a stale query forward", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "עילאי" } });
    expect((searchInput() as HTMLInputElement).value).toBe("עילאי");

    fireEvent.keyDown(searchInput(), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect((searchInput() as HTMLInputElement).value).toBe("");
  });
});

describe("Command palette — keyboard navigation and results", () => {
  it("29. ArrowDown/ArrowUp move the highlighted result", () => {
    renderPalette(fixtureModel({ roster: fixtureModel().roster })); // 3 people, "י" matches both "עילאי" (contains) results
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "י" } }); // matches multiple names containing "י"

    const optionsBefore = screen.getAllByRole("option");
    expect(optionsBefore.length).toBeGreaterThan(1);
    const firstId = searchInput().getAttribute("aria-activedescendant");

    fireEvent.keyDown(searchInput(), { key: "ArrowDown" });
    const secondId = searchInput().getAttribute("aria-activedescendant");
    expect(secondId).not.toBe(firstId);

    fireEvent.keyDown(searchInput(), { key: "ArrowUp" });
    const backToFirstId = searchInput().getAttribute("aria-activedescendant");
    expect(backToFirstId).toBe(firstId);
  });

  it("30. Enter activates the highlighted result and navigates, then closes the palette", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "19.8" } });

    fireEvent.keyDown(searchInput(), { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/schedule?date=2026-08-19");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clicking a result directly also navigates and closes", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "19.8" } });

    fireEvent.click(screen.getByRole("option"));

    expect(push).toHaveBeenCalledWith("/schedule?date=2026-08-19");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the idle state with example queries before anything is typed", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(screen.getByText("לדוגמה")).toBeInTheDocument();
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("clicking an idle-state example query fills the input", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.click(screen.getByRole("button", { name: "עילאי" }));
    expect((searchInput() as HTMLInputElement).value).toBe("עילאי");
  });

  it("shows the generic empty-state hint for a nonsense query", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "asdkjfhqwer" } });
    expect(screen.getByText("לא מצאנו משהו שמתאים.")).toBeInTheDocument();
  });

  it("shows a specific empty-state message for an explicit shared-shift question with no answer", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "מתי אני ועילאי יחד" } });
    expect(screen.getByText(/עילאי/)).toBeInTheDocument();
    expect(screen.queryByText("לא מצאנו משהו שמתאים.")).toBeNull();
  });
});

describe("Command palette — non-actionable results never misleadingly act", () => {
  // רוני has no shiftEvents in the fixture model at all, so the resolved
  // person result has neither a next shift nor a shared shift -- href: null.
  it("Enter on a hrefless person result neither closes the palette nor navigates", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "רוני" } });
    expect(screen.getByRole("option")).toBeInTheDocument();

    fireEvent.keyDown(searchInput(), { key: "Enter" });

    expect(push).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });

  it("clicking a hrefless person result neither closes the palette nor navigates", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "רוני" } });

    fireEvent.click(screen.getByRole("option"));

    expect(push).not.toHaveBeenCalled();
    expect(dialog()).toBeInTheDocument();
  });
});

describe("Command palette — keyboard focus trap", () => {
  function closeButton() {
    return screen.getByRole("button", { name: "סגירת חיפוש" });
  }

  it("Tab wraps from the LAST focusable control (an idle-state example button) back to the search input", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));

    const exampleButtons = screen.getAllByRole("button", { name: /^(עילאי|מי איתי בשבת|19\.8|מתי אני ועילאי יחד)$/ });
    const lastExample = exampleButtons[exampleButtons.length - 1];
    lastExample.focus();
    expect(document.activeElement).toBe(lastExample);

    fireEvent.keyDown(lastExample, { key: "Tab" });

    expect(document.activeElement).toBe(searchInput());
  });

  it("Shift+Tab wraps from the FIRST focusable control (the search input) back to the last one", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    expect(document.activeElement).toBe(searchInput());

    const exampleButtons = screen.getAllByRole("button", { name: /^(עילאי|מי איתי בשבת|19\.8|מתי אני ועילאי יחד)$/ });
    const lastExample = exampleButtons[exampleButtons.length - 1];

    fireEvent.keyDown(searchInput(), { key: "Tab", shiftKey: true });

    expect(document.activeElement).toBe(lastExample);
  });

  it("the close button is a real, reachable focusable control -- Tab while focused there does not forcibly yank focus back to the input", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));

    const close = closeButton();
    close.focus();
    expect(document.activeElement).toBe(close);

    // The close button is neither the first nor the last focusable control
    // while idle (input, close, then 4 example buttons) -- Tab here is a
    // normal mid-sequence move the browser handles natively, so the trap
    // must NOT intervene (the old bug forcibly refocused the input on
    // every single Tab press, making the close button unreachable).
    fireEvent.keyDown(close, { key: "Tab" });

    expect(document.activeElement).toBe(close);
  });

  it("wraps correctly with only [input, close button] focusable once results replace the idle example buttons", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "19.8" } });

    const close = closeButton();
    close.focus();
    fireEvent.keyDown(close, { key: "Tab" });

    // With no idle example buttons rendered, the close button is now the
    // LAST focusable control -- Tab from there wraps back to the input.
    expect(document.activeElement).toBe(searchInput());
  });

  it("ArrowUp/ArrowDown/Enter on the input still work for navigating and activating search results, unaffected by the focus trap", () => {
    renderPalette();
    fireEvent.click(screen.getByRole("button", { name: "חיפוש" }));
    fireEvent.change(searchInput(), { target: { value: "19.8" } });

    fireEvent.keyDown(searchInput(), { key: "ArrowDown" });
    fireEvent.keyDown(searchInput(), { key: "Enter" });

    expect(push).toHaveBeenCalledWith("/schedule?date=2026-08-19");
  });
});
