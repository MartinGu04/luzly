import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LoginBrandLogo } from "./LoginBrandLogo";

afterEach(() => {
  cleanup();
});

describe("LoginBrandLogo", () => {
  it("renders the supplied wordmark artwork with the product name as its alt text", () => {
    const { container } = render(<LoginBrandLogo />);
    const img = container.querySelector('img[src*="logo-wordmark.png"]');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("alt", "מי-מה-מו");
  });
});
