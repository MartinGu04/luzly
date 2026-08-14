import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LOGIN_FEATURE_HIGHLIGHTS } from "@/lib/config/loginCopy";
import { LoginFeatureStrip } from "./LoginFeatureStrip";

afterEach(() => {
  cleanup();
});

describe("LoginFeatureStrip", () => {
  it("renders every configured highlight's title and subtitle, in order", () => {
    const { getByText } = render(<LoginFeatureStrip />);
    for (const feature of LOGIN_FEATURE_HIGHLIGHTS) {
      expect(getByText(feature.title)).toBeInTheDocument();
      expect(getByText(feature.subtitle)).toBeInTheDocument();
    }
  });

  it("is hidden below the lg breakpoint (desktop-only, matching the supplied mobile reference)", () => {
    const { container } = render(<LoginFeatureStrip />);
    expect(container.firstElementChild).toHaveClass("hidden");
    expect(container.firstElementChild).toHaveClass("lg:block");
  });

  it("renders as a single shared card, not loose floating items", () => {
    const { container } = render(<LoginFeatureStrip />);
    const card = container.querySelector(".ring-white\\/10");
    expect(card).toBeInTheDocument();
    expect(card?.children.length).toBe(LOGIN_FEATURE_HIGHLIGHTS.length);
  });
});
