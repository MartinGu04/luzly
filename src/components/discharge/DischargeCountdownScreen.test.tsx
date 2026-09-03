import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { DischargeCountdownScreen } from "./DischargeCountdownScreen";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DischargeCountdownScreen — counting down", () => {
  it("ticks live every second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T00:00:00.500Z"));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso="2027-01-24T00:00:00.000Z"
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    const before = screen.getByText(/^\d{2} : \d{2} : \d{2}$/).textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const after = screen.getByText(/^\d{2} : \d{2} : \d{2}$/).textContent;

    expect(after).not.toBe(before);
  });

  it("shows the huge title, subtitle, day count, and formatted date label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-03T00:00:00.000Z"));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso="2027-01-24T00:00:00.000Z"
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    expect(screen.getByText("עד מתי???")).toBeInTheDocument();
    expect(screen.getByText("עד השחרור נשארו")).toBeInTheDocument();
    expect(screen.getByText("ימים")).toBeInTheDocument();
    expect(screen.getByText(/תאריך שחרור: 24\.01\.2027/)).toBeInTheDocument();
  });

  it("shows the '100 ימים!' milestone badge exactly 100 days out", () => {
    vi.useFakeTimers();
    const dischargeInstantIso = "2027-01-24T00:00:00.000Z";
    vi.setSystemTime(new Date(Date.parse(dischargeInstantIso) - 100 * 24 * 60 * 60 * 1000 - 1000));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso={dischargeInstantIso}
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    expect(screen.getByText("100 ימים!")).toBeInTheDocument();
  });

  it("shows service progress stats only when an enlistment instant is provided", () => {
    vi.useFakeTimers();
    const dischargeInstantIso = "2027-01-24T00:00:00.000Z";
    const enlistmentInstantIso = "2024-05-07T00:00:00.000Z";
    vi.setSystemTime(new Date(Date.parse(dischargeInstantIso) - 180 * 24 * 60 * 60 * 1000));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso={dischargeInstantIso}
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={enlistmentInstantIso}
      />,
    );

    expect(screen.getByText(/% מאחוריך/)).toBeInTheDocument();
    expect(screen.getByText(/ימים בשירות/)).toBeInTheDocument();
    expect(screen.getByText(/180 ימים נשארו/)).toBeInTheDocument();
  });

});

describe("DischargeCountdownScreen — discharge day", () => {
  it("completely replaces the main state with 'זהו. השתחררת.'", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-24T10:00:00.000Z"));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso="2027-01-24T00:00:00.000Z"
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    expect(screen.getByText("זהו. השתחררת.")).toBeInTheDocument();
    expect(screen.queryByText("ימים")).toBeNull();
  });
});

describe("DischargeCountdownScreen — post discharge", () => {
  it("never shows a negative countdown -- shows days since release instead", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-02-05T00:00:00.000Z"));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso="2027-01-24T00:00:00.000Z"
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    expect(screen.getByText(/משוחרר כבר \d+ ימים/)).toBeInTheDocument();
    expect(screen.getByText("משוחרר כבר 12 ימים")).toBeInTheDocument();
  });
});
