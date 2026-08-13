import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ManagerForbiddenState } from "./ManagerForbiddenState";

afterEach(() => {
  cleanup();
});

describe("ManagerForbiddenState", () => {
  it("shows a calm denial message without a sign-out affordance", () => {
    render(<ManagerForbiddenState />);
    expect(screen.getByText("המסך הזה מיועד למנהלים בלבד")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "התנתקות" })).toBeNull();
  });
});
