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
});
