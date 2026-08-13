import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerHeader } from "./ManagerHeader";

afterEach(() => {
  cleanup();
});

describe("ManagerHeader", () => {
  it("shows the title, subtitle, and a restrained manager marker", () => {
    render(<ManagerHeader />);
    expect(screen.getByRole("heading", { name: "מבט מנהל" })).toBeInTheDocument();
    expect(screen.getByText("התמונה המלאה של הסידור, הצוות והפוטנציאל.")).toBeInTheDocument();
    expect(screen.getByText("מנהל")).toBeInTheDocument();
  });
});
