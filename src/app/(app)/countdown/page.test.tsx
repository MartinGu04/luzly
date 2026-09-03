import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getRequestDischargeCountdown = vi.fn();
const redirect = vi.fn((path: string) => {
  throw new Error(`REDIRECT:${path}`);
});

vi.mock("@/lib/readModels/dischargeCountdown", () => ({ getRequestDischargeCountdown }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/components/discharge/DischargeCountdownScreen", () => ({
  DischargeCountdownScreen: (props: {
    dischargeDateLabel: string;
    dischargeInstantIso: string;
    dischargeDayEndInstantIso: string;
    enlistmentInstantIso: string | null;
  }) => <div data-testid="countdown-screen">{JSON.stringify(props)}</div>,
}));

const { default: CountdownPage } = await import("./page");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CountdownPage — access control", () => {
  it("redirects to /login for an unauthenticated visitor", async () => {
    getRequestDischargeCountdown.mockResolvedValue({ status: "unauthenticated" });
    await expect(CountdownPage()).rejects.toThrow("REDIRECT:/login");
  });

  it.each(["missing_email", "unmapped", "ambiguous_identity"] as const)(
    "shows the access-denied screen for %s, never the countdown screen",
    async (status) => {
      getRequestDischargeCountdown.mockResolvedValue({ status });
      render(await CountdownPage());
      expect(screen.queryByTestId("countdown-screen")).toBeNull();
    },
  );
});

describe("CountdownPage — a discharge date is on record", () => {
  it("renders the countdown screen with the formatted label and both resolved instants", async () => {
    getRequestDischargeCountdown.mockResolvedValue({
      status: "ok",
      view: {
        personName: "דני בדיקה",
        dischargeDate: "2027-01-24",
        dischargeInstantIso: "2027-01-23T22:00:00.000Z",
        dischargeDayEndInstantIso: "2027-01-24T21:59:59.999Z",
        enlistmentInstantIso: "2024-01-23T22:00:00.000Z",
      },
    });

    render(await CountdownPage());
    const props = JSON.parse(screen.getByTestId("countdown-screen").textContent ?? "{}");

    expect(props).toEqual({
      dischargeDateLabel: "24.01.2027",
      dischargeInstantIso: "2027-01-23T22:00:00.000Z",
      dischargeDayEndInstantIso: "2027-01-24T21:59:59.999Z",
      enlistmentInstantIso: "2024-01-23T22:00:00.000Z",
    });
  });

  it("passes null enlistmentInstantIso through untouched when כ\"א has no enlistment date for this person", async () => {
    getRequestDischargeCountdown.mockResolvedValue({
      status: "ok",
      view: {
        personName: "דני בדיקה",
        dischargeDate: "2027-01-24",
        dischargeInstantIso: "2027-01-23T22:00:00.000Z",
        dischargeDayEndInstantIso: "2027-01-24T21:59:59.999Z",
        enlistmentInstantIso: null,
      },
    });

    render(await CountdownPage());
    const props = JSON.parse(screen.getByTestId("countdown-screen").textContent ?? "{}");
    expect(props.enlistmentInstantIso).toBeNull();
  });
});

describe("CountdownPage — no discharge date on record", () => {
  it("renders a clean empty state instead of the countdown screen", async () => {
    getRequestDischargeCountdown.mockResolvedValue({
      status: "ok",
      view: {
        personName: "דני בדיקה",
        dischargeDate: null,
        dischargeInstantIso: null,
        dischargeDayEndInstantIso: null,
        enlistmentInstantIso: null,
      },
    });

    render(await CountdownPage());

    expect(screen.queryByTestId("countdown-screen")).toBeNull();
    expect(screen.getByText("עד מתי???")).toBeInTheDocument();
    expect(screen.getByText(/לא נמצא תאריך שחרור/)).toBeInTheDocument();
  });
});
