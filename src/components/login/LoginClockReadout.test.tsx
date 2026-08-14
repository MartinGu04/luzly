import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LoginClockReadout } from "./LoginClockReadout";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-14T09:09:32.000Z"));
});

describe("LoginClockReadout", () => {
  it("panel variant renders the live clock and the weekday/day/month breakdown", () => {
    const { container, getByText } = render(
      <LoginClockReadout
        variant="panel"
        initialClockTime="12:09:00"
        weekdayLabel="יום שישי"
        dayNumber={14}
        monthLabel="באוגוסט"
      />,
    );
    expect(container.querySelector("time")).toBeInTheDocument();
    expect(getByText("יום שישי")).toBeInTheDocument();
    expect(getByText("14")).toBeInTheDocument();
    expect(getByText("באוגוסט")).toBeInTheDocument();
  });

  it("stacked variant renders the same information, centered", () => {
    const { container, getByText } = render(
      <LoginClockReadout
        variant="stacked"
        initialClockTime="12:09:00"
        weekdayLabel="יום שישי"
        dayNumber={14}
        monthLabel="באוגוסט"
      />,
    );
    expect(container.querySelector("time")).toBeInTheDocument();
    expect(getByText("יום שישי")).toBeInTheDocument();
    expect(getByText("14")).toBeInTheDocument();
  });

  it("renders no date breakdown when weekdayLabel is null", () => {
    const { queryByText } = render(
      <LoginClockReadout variant="panel" initialClockTime="12:09:00" weekdayLabel={null} dayNumber={null} monthLabel={null} />,
    );
    expect(queryByText("באוגוסט")).toBeNull();
  });
});
