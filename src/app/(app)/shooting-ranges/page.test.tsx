import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { default: ShootingRangesPage } = await import("./page");

afterEach(() => {
  cleanup();
});

describe("ShootingRangesPage — placeholder", () => {
  it('renders "בקרוב" prominently, with no mock data, forms, or buttons', () => {
    render(<ShootingRangesPage />);
    expect(screen.getByText("בקרוב")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
  });
});
