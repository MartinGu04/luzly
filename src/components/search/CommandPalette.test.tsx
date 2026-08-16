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
