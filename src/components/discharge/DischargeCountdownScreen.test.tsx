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

    const before = screen.getByTestId("discharge-clock").textContent;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    const after = screen.getByTestId("discharge-clock").textContent;

    expect(after).not.toBe(before);
  });

  it("renders the clock explicitly LTR so RTL page layout can never reorder H : M : S", () => {
    vi.useFakeTimers();
    // 15:34:32 remaining until discharge.
    vi.setSystemTime(
      new Date(Date.parse("2027-01-24T00:00:00.000Z") - (15 * 60 * 60 * 1000 + 34 * 60 * 1000 + 32 * 1000)),
    );
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso="2027-01-24T00:00:00.000Z"
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    const clock = screen.getByTestId("discharge-clock");
    expect(clock).toHaveAttribute("dir", "ltr");
    expect(clock.style.unicodeBidi).toBe("isolate");
    // The DOM order (which the grid then lays out left-to-right under
    // dir="ltr") must itself be H, M, S -- never reversed to compensate
    // for the surrounding RTL page.
    expect(clock.textContent?.replace(/\s+/g, "")).toBe("15:34:32שעותדקותשניות");
  });

  it("labels the three time groups שעות / דקות / שניות, aligned under the live clock", () => {
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

    const clock = screen.getByTestId("discharge-clock");
    expect(clock).toHaveTextContent("שעות");
    expect(clock).toHaveTextContent("דקות");
    expect(clock).toHaveTextContent("שניות");
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

  it("never shows a milestone badge on a day that isn't an exact match -- e.g. 51 days out is NOT '100 ימים!'", () => {
    vi.useFakeTimers();
    const dischargeInstantIso = "2027-01-24T00:00:00.000Z";
    vi.setSystemTime(new Date(Date.parse(dischargeInstantIso) - 51 * 24 * 60 * 60 * 1000 - 1000));
    render(
      <DischargeCountdownScreen
        dischargeDateLabel="24.01.2027"
        dischargeInstantIso={dischargeInstantIso}
        dischargeDayEndInstantIso="2027-01-24T23:59:59.999Z"
        enlistmentInstantIso={null}
      />,
    );

    expect(screen.getByText("51")).toBeInTheDocument();
    expect(screen.queryByText("100 ימים!")).toBeNull();
    expect(screen.queryByText("50 ימים!")).toBeNull();
  });

  it("shows service progress stats and a visual progress bar only when an enlistment instant is provided", () => {
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

    const percentText = screen.getByText(/% מאחוריך/).textContent ?? "";
    const percent = Number(percentText.match(/(\d+)%/)?.[1]);

    expect(screen.getByText(/ימים בשירות/)).toBeInTheDocument();
    expect(screen.getByText(/180 ימים נשארו/)).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", String(percent));
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("shows no progress bar when there is no enlistment instant", () => {
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

    expect(screen.queryByRole("progressbar")).toBeNull();
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

  it("no longer shows 'עד השחרור נשארו' once the discharge day itself has arrived", () => {
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

    expect(screen.queryByText("עד השחרור נשארו")).toBeNull();
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

  it("no longer shows 'עד השחרור נשארו' after discharge", () => {
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

    expect(screen.queryByText("עד השחרור נשארו")).toBeNull();
  });
});
