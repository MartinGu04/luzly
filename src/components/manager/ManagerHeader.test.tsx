import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerHeader } from "./ManagerHeader";

afterEach(() => {
  cleanup();
});

describe("ManagerHeader", () => {
  it("shows the אזור מנהל title and subtitle", () => {
    render(<ManagerHeader />);
    expect(screen.getByRole("heading", { name: "אזור מנהל" })).toBeInTheDocument();
    expect(screen.getByText("תמונת מצב של הסידור, הכיסוי והצוות.")).toBeInTheDocument();
  });

  it("no longer renders the redundant מנהל chip badge", () => {
    render(<ManagerHeader />);
    expect(screen.queryByText("מנהל")).toBeNull();
  });

  it("no longer renders an inline טבלת צדק shortcut link -- superseded by ManagerSubNav", () => {
    render(<ManagerHeader />);
    expect(screen.queryByRole("link", { name: "טבלת צדק" })).toBeNull();
  });
});
