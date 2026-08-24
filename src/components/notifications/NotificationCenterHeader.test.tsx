import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NotificationCenterHeader } from "./NotificationCenterHeader";

afterEach(() => {
  cleanup();
});

describe("NotificationCenterHeader", () => {
  it("shows the מרכז התראות title and its subtitle", () => {
    render(<NotificationCenterHeader />);
    expect(screen.getByRole("heading", { name: "מרכז התראות", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("שליחה, תזמון וניהול התראות לצוות.")).toBeInTheDocument();
  });
});
