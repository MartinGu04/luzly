import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ManagerPersonSelector } from "./ManagerPersonSelector";

const push = vi.fn();
const useRouter = vi.fn(() => ({ push }));
const useSearchParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useRouter: () => useRouter(),
  useSearchParams: () => useSearchParams(),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
  useSearchParams.mockReturnValue(new URLSearchParams());
});

const PEOPLE = [
  { id: "p_martin", name: "מרטין בדיקה" },
  { id: "p_eitan", name: "איתן דוגמה" },
];

describe("ManagerPersonSelector", () => {
  it("shows 'כולם' first, then every person", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["כולם", "מרטין בדיקה", "איתן דוגמה"]);
  });

  it("defaults to 'כולם' selected when selectedId is null", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    expect(screen.getByRole("combobox")).toHaveValue("all");
  });

  it("shows the given person as selected", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId="p_eitan" />);
    expect(screen.getByRole("combobox")).toHaveValue("p_eitan");
  });

  it("selecting a person navigates to /manager?person=<id>", () => {
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p_martin" } });
    expect(push).toHaveBeenCalledWith("/manager?person=p_martin");
  });

  it("selecting 'כולם' removes the person param", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("person=p_martin"));
    render(<ManagerPersonSelector people={PEOPLE} selectedId="p_martin" />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "all" } });
    expect(push).toHaveBeenCalledWith("/manager");
  });

  it("preserves other params (range/problems) when switching person", () => {
    useSearchParams.mockReturnValue(new URLSearchParams("range=30d&problems=1"));
    render(<ManagerPersonSelector people={PEOPLE} selectedId={null} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "p_eitan" } });
    const calledWith = push.mock.calls[0][0] as string;
    expect(calledWith).toContain("person=p_eitan");
    expect(calledWith).toContain("range=30d");
    expect(calledWith).toContain("problems=1");
  });
});
