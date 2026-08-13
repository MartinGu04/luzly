import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WithMeHeader } from "./WithMeHeader";

afterEach(() => {
  cleanup();
});

describe("WithMeHeader", () => {
  it("shows the page title and subtitle", () => {
    render(<WithMeHeader />);
    expect(screen.getByRole("heading", { name: "מי איתי" })).toBeInTheDocument();
    expect(screen.getByText("הצוות סביב המשמרת שלך.")).toBeInTheDocument();
  });
});
