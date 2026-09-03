import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RawSheet } from "@/lib/google";

const getRequestAuthenticatedIdentity = vi.fn();
const getWorkbookSnapshot = vi.fn();

vi.mock("@/lib/auth/getRequestAuthenticatedIdentity", () => ({ getRequestAuthenticatedIdentity }));
vi.mock("@/lib/sync", () => ({ getWorkbookSnapshot }));

const { loadDischargeCountdownView } = await import("./dischargeCountdown");

function personnelSheet(rows: (string | boolean)[][]): RawSheet {
  return { name: 'כ"א', values: rows };
}

function personnelSnapshot(rows: (string | boolean)[][]) {
  return { fetchedAt: "2026-08-13T08:00:00.000Z", sheets: [personnelSheet(rows)] };
}

beforeEach(() => {
  getRequestAuthenticatedIdentity.mockReset();
  getWorkbookSnapshot.mockReset();
  getRequestAuthenticatedIdentity.mockResolvedValue({
    status: "authenticated",
    userId: "u1",
    email: "dani@example.invalid",
    avatarUrl: null,
  });
});

describe("loadDischargeCountdownView — auth pass-through states", () => {
  it("unauthenticated: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadDischargeCountdownView();
    expect(result).toEqual({ status: "unauthenticated" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("missing_email: no workbook fetch at all", async () => {
    getRequestAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: "u1" });
    const result = await loadDischargeCountdownView();
    expect(result).toEqual({ status: "missing_email" });
    expect(getWorkbookSnapshot).not.toHaveBeenCalled();
  });

  it("an email absent from כ\"א fails closed as unmapped", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]]));
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "stranger@example.invalid",
      avatarUrl: null,
    });
    const result = await loadDischargeCountdownView();
    expect(result).toEqual({ status: "unmapped" });
  });

  it("an email matching more than one כ\"א record fails closed as ambiguous_identity", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      personnelSnapshot([
        ["שם", "מייל"],
        ["דני בדיקה", "dup@example.invalid"],
        ["נועה דוגמה", "DUP@example.invalid"],
      ]),
    );
    getRequestAuthenticatedIdentity.mockResolvedValue({
      status: "authenticated",
      userId: "u9",
      email: "dup@example.invalid",
      avatarUrl: null,
    });
    const result = await loadDischargeCountdownView();
    expect(result).toEqual({ status: "ambiguous_identity" });
  });

  it("only ever fetches the personnel source, never the full manager/personal-schedule set", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]]));
    await loadDischargeCountdownView();
    expect(getWorkbookSnapshot).toHaveBeenCalledWith(["personnel"]);
  });
});

describe("loadDischargeCountdownView — resolved view", () => {
  it("resolves both instants from the person's own discharge/enlistment dates", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      personnelSnapshot([
        ["שם", "מייל", "תאריך גיוס", "תאריך שחרור"],
        ["דני בדיקה", "dani@example.invalid", "24/01/2024", "24/01/2027"],
      ]),
    );

    const result = await loadDischargeCountdownView();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.view.personName).toBe("דני בדיקה");
    expect(result.view.dischargeDate).toBe("2027-01-24");
    expect(result.view.dischargeInstantIso).toBe(new Date("2027-01-24T00:00:00.000+02:00").toISOString());
    expect(result.view.enlistmentInstantIso).toBe(new Date("2024-01-24T00:00:00.000+02:00").toISOString());
    // The discharge day's own last moment -- still the SAME civil day, never the next one.
    expect(new Date(result.view.dischargeDayEndInstantIso!).getUTCDate()).toBe(24);
  });

  it("resolves every instant to null when כ\"א has neither date for this person", async () => {
    getWorkbookSnapshot.mockResolvedValue(personnelSnapshot([["שם", "מייל"], ["דני בדיקה", "dani@example.invalid"]]));

    const result = await loadDischargeCountdownView();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.view.dischargeDate).toBeNull();
    expect(result.view.dischargeInstantIso).toBeNull();
    expect(result.view.dischargeDayEndInstantIso).toBeNull();
    expect(result.view.enlistmentInstantIso).toBeNull();
  });

  it("resolves an enlistment instant independently of whether a discharge date exists", async () => {
    getWorkbookSnapshot.mockResolvedValue(
      personnelSnapshot([
        ["שם", "מייל", "תאריך גיוס"],
        ["דני בדיקה", "dani@example.invalid", "24/01/2024"],
      ]),
    );

    const result = await loadDischargeCountdownView();

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("unreachable");
    expect(result.view.dischargeDate).toBeNull();
    expect(result.view.enlistmentInstantIso).not.toBeNull();
  });
});
