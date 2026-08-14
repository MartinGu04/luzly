import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmptyTeamState } from "./EmptyTeamState";

afterEach(() => {
  cleanup();
});

describe("EmptyTeamState", () => {
  it("shows the calm empty-state copy", () => {
    render(<EmptyTeamState />);
    expect(screen.getByText("אין כרגע משמרת עם צוות להצגה")).toBeInTheDocument();
    expect(screen.getByText("כשיהיה שיבוץ קרוב, האנשים שאיתך יופיעו כאן.")).toBeInTheDocument();
    expect(screen.getByText("😌")).toBeInTheDocument();
  });

  it("links to /schedule as a useful next step (Design Pass PR #20)", () => {
    render(<EmptyTeamState />);
    expect(screen.getByRole("link", { name: /עבור ללוח המשמרות/ })).toHaveAttribute("href", "/schedule");
  });
});
