import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EmergencyUnavailableState } from "./EmergencyUnavailableState";

afterEach(() => {
  cleanup();
});

describe("EmergencyUnavailableState", () => {
  it("renders a distinct message from the regular ConfigurationErrorState, mentioning Emergency Mode explicitly", () => {
    render(<EmergencyUnavailableState />);

    expect(screen.getByText(/מצב חירום פעיל/)).toBeInTheDocument();
    expect(screen.getByText(/נתוני החירום אינם זמינים/)).toBeInTheDocument();
  });
});
