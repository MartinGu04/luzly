import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ConflictsEmptyState } from "./ConflictsEmptyState";

afterEach(() => {
  cleanup();
});

describe("ConflictsEmptyState", () => {
  it("shows the calm success copy, scoped to this person's own findings", () => {
    render(<ConflictsEmptyState />);
    expect(screen.getByText("הכול נראה תקין")).toBeInTheDocument();
    expect(screen.getByText("לא נמצאו כרגע התנגשויות או דברים שדורשים בדיקה בסידור שלך.")).toBeInTheDocument();
    expect(screen.getByText("✅")).toBeInTheDocument();
  });
});
