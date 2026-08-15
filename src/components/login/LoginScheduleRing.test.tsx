import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LoginScheduleRing } from "./LoginScheduleRing";

afterEach(() => {
  cleanup();
});

describe("LoginScheduleRing", () => {
  it("renders every illustrative floating card's title, never real schedule data", () => {
    const { getByText } = render(
      <LoginScheduleRing>
        <span>mobile clock slot</span>
      </LoginScheduleRing>,
    );
    for (const title of ["משמרת ערב", "משמרת בוקר", "חופש", "תורנות", "משמרת לילה"]) {
      expect(getByText(title)).toBeInTheDocument();
    }
  });

  it("renders the passed children (the mobile-only clock slot)", () => {
    const { getByText } = render(
      <LoginScheduleRing>
        <span>mobile clock slot</span>
      </LoginScheduleRing>,
    );
    expect(getByText("mobile clock slot")).toBeInTheDocument();
  });

  it("the decorative tick-mark ring is aria-hidden", () => {
    const { container } = render(
      <LoginScheduleRing>
        <span>mobile clock slot</span>
      </LoginScheduleRing>,
    );
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("hides only the night-shift card below `sm` -- it collides with the CTA on real phones, the other cards don't", () => {
    const { getByText } = render(
      <LoginScheduleRing>
        <span>mobile clock slot</span>
      </LoginScheduleRing>,
    );
    const nightCard = getByText("משמרת לילה").closest("div.absolute");
    expect(nightCard?.className).toContain("hidden");
    expect(nightCard?.className).toContain("sm:flex");

    for (const title of ["משמרת ערב", "משמרת בוקר", "חופש", "תורנות"]) {
      const card = getByText(title).closest("div.absolute");
      expect(card?.className).not.toContain("hidden");
    }
  });
});
