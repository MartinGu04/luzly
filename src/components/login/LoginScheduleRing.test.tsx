import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LoginScheduleRing } from "./LoginScheduleRing";

afterEach(() => {
  cleanup();
});

describe("LoginScheduleRing", () => {
  it("renders every illustrative floating card's title, never real schedule data", () => {
    const { getByText } = render(<LoginScheduleRing />);
    for (const title of ["משמרת ערב", "משמרת בוקר", "חופש", "תורנות", "משמרת לילה"]) {
      expect(getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the tick-marked ring's SVG unconditionally -- no mobile/desktop swap, same clock face at every breakpoint", () => {
    const { container } = render(<LoginScheduleRing />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.className.baseVal ?? svg?.getAttribute("class") ?? "").not.toContain("hidden");
  });

  it("renders the brand mark image unconditionally (no `hidden`/`lg:flex` gating) so mobile gets the same centered logo as desktop", () => {
    const { container } = render(<LoginScheduleRing />);
    const logo = container.querySelector("img");
    expect(logo).toBeInTheDocument();
    expect(logo?.closest("div")?.className).not.toContain("hidden");
  });

  it("hides only the night-shift card below `sm` -- it collides with content sitting right below the ring on real phones, the other cards don't", () => {
    const { getByText } = render(<LoginScheduleRing />);
    const nightCard = getByText("משמרת לילה").closest("div.absolute");
    expect(nightCard?.className).toContain("hidden");
    expect(nightCard?.className).toContain("sm:flex");

    for (const title of ["משמרת ערב", "משמרת בוקר", "חופש", "תורנות"]) {
      const card = getByText(title).closest("div.absolute");
      expect(card?.className).not.toContain("hidden");
    }
  });
});
