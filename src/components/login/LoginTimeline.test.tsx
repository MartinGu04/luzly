import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LoginTimeline } from "./LoginTimeline";

afterEach(() => {
  cleanup();
});

describe("LoginTimeline", () => {
  it("is purely decorative -- aria-hidden, so it never adds noise to the login page's accessible name/description", () => {
    const { container } = render(<LoginTimeline />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it('shows the abstract משמרת/תורנות/חופש/עכשיו visual language, never real schedule data', () => {
    const { getByText } = render(<LoginTimeline />);
    expect(getByText("משמרת")).toBeInTheDocument();
    expect(getByText("תורנות")).toBeInTheDocument();
    expect(getByText("חופש")).toBeInTheDocument();
    expect(getByText("עכשיו")).toBeInTheDocument();
  });

  it("every motion class it uses is covered by the global prefers-reduced-motion rule", () => {
    const { container } = render(<LoginTimeline />);
    const usedAnimationClasses = ["animate-breathe", "animate-pulse-dot", "animate-pulse-ring", "animate-login-now-drift"];
    for (const className of usedAnimationClasses) {
      expect(container.querySelector(`.${className}`)).not.toBeNull();
    }

    const css = readFileSync(path.resolve(__dirname, "../../app/globals.css"), "utf8");
    const reducedBlockMatch = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*)}\s*$/);
    expect(reducedBlockMatch).not.toBeNull();
    const reducedBlock = reducedBlockMatch?.[1] ?? "";
    for (const className of usedAnimationClasses) {
      expect(reducedBlock).toContain(`.${className}`);
    }
  });
});
