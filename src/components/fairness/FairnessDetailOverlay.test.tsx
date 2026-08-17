import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FairnessDetailOverlay } from "./FairnessDetailOverlay";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  push.mockReset();
});

afterEach(() => {
  cleanup();
});

function renderOverlay(closeHref = "/fairness") {
  return render(
    <FairnessDetailOverlay closeHref={closeHref} title="טל טכנאי">
      <button type="button">תוכן פנימי</button>
    </FairnessDetailOverlay>,
  );
}

describe("FairnessDetailOverlay — accessible dialog semantics", () => {
  it("renders a labeled dialog with the given title", () => {
    renderOverlay();
    expect(screen.getByRole("dialog", { name: "טל טכנאי" })).toBeInTheDocument();
  });

  it("the close button is a real, navigable link to closeHref, with an accessible label", () => {
    renderOverlay("/fairness?month=2026-06");
    const close = screen.getByRole("link", { name: "סגירה" });
    expect(close).toHaveAttribute("href", "/fairness?month=2026-06");
  });

  it("Escape navigates to closeHref via the router", () => {
    renderOverlay("/fairness?mode=duties&period=h1");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(push).toHaveBeenCalledWith("/fairness?mode=duties&period=h1");
  });

  it("clicking the backdrop navigates to closeHref", () => {
    renderOverlay("/fairness");
    // Portaled into document.body -- not inside RTL's own container.
    const backdrop = document.querySelector('[role="presentation"]');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop as Element);
    expect(push).toHaveBeenCalledWith("/fairness");
  });

  it("focus moves into the dialog (the close button) on mount", () => {
    renderOverlay();
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "סגירה" }));
  });

  it("Tab wraps focus from the last focusable element back to the first, never escaping the dialog", () => {
    renderOverlay();
    const close = screen.getByRole("link", { name: "סגירה" });
    const innerButton = screen.getByRole("button", { name: "תוכן פנימי" });

    innerButton.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(close);
  });

  it("Shift+Tab from the first focusable element wraps to the last", () => {
    renderOverlay();
    const close = screen.getByRole("link", { name: "סגירה" });
    const innerButton = screen.getByRole("button", { name: "תוכן פנימי" });

    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(innerButton);
  });
});
