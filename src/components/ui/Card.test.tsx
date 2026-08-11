import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("renders a title and its children", () => {
    render(<Card title="כותרת">תוכן</Card>);

    expect(screen.getByText("כותרת")).toBeInTheDocument();
    expect(screen.getByText("תוכן")).toBeInTheDocument();
  });
});
