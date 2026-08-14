import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LoginLogoRow } from "./LoginLogoRow";

afterEach(() => {
  cleanup();
});

describe("LoginLogoRow", () => {
  it("renders nothing today -- no logo assets exist yet, and no placeholder boxes/text fill the slot", () => {
    const { container } = render(<LoginLogoRow />);
    expect(container).toBeEmptyDOMElement();
  });

  it("activates once real logo content is passed in, with a divider between the two", () => {
    const { container, getByText } = render(<LoginLogoRow primary={<span>Org A</span>} secondary={<span>Org B</span>} />);
    expect(getByText("Org A")).toBeInTheDocument();
    expect(getByText("Org B")).toBeInTheDocument();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});
