import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConflictsHeader } from "./ConflictsHeader";

afterEach(() => {
  cleanup();
});

describe("ConflictsHeader", () => {
  it("shows the page title and subtitle", () => {
    render(<ConflictsHeader />);
    expect(screen.getByRole("heading", { name: "התנגשויות ובדיקות" })).toBeInTheDocument();
    expect(screen.getByText("דברים בסידור שלך שכדאי לבדוק.")).toBeInTheDocument();
  });
});
