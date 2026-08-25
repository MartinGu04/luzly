import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedIdentity = vi.fn();
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));

const recordDashboardVisit = vi.fn();
vi.mock("./store", () => ({ recordDashboardVisit }));

const { recordDashboardVisitAction } = await import("./actions");

const ME_ID = "u_me";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getAuthenticatedIdentity.mockReset();
  recordDashboardVisit.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: ME_ID, email: "me@example.com", avatarUrl: null });
  recordDashboardVisit.mockResolvedValue(undefined);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  // Fixed "now" well after every fixed timestamp used below, so ordinary
  // past instants are never accidentally treated as "from the future".
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-25T12:00:00.000Z"));
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
  vi.useRealTimers();
});

describe("recordDashboardVisitAction -- authentication (19)", () => {
  it("re-derives the authenticated user server-side and writes only their own row", async () => {
    await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    expect(recordDashboardVisit).toHaveBeenCalledWith(ME_ID, "2026-08-25T10:00:00.000Z");
  });

  it("never writes when unauthenticated", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(recordDashboardVisit).not.toHaveBeenCalled();
  });

  it("never writes for a missing-email identity", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: ME_ID });
    const result = await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(recordDashboardVisit).not.toHaveBeenCalled();
  });

  it("the client-supplied user id (if any) is never accepted -- only the server-derived identity is used", async () => {
    await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    const [writtenUserId] = recordDashboardVisit.mock.calls[0];
    expect(writtenUserId).toBe(ME_ID);
  });
});

describe("recordDashboardVisitAction -- conservative timestamp validation", () => {
  it("rejects a malformed timestamp without ever calling the store", async () => {
    const result = await recordDashboardVisitAction("not-a-date");
    expect(result).toEqual({ ok: false, error: "invalid_timestamp" });
    expect(recordDashboardVisit).not.toHaveBeenCalled();
  });

  it("clamps a future timestamp down to now (clock skew / malformed client value), never storing a future cutoff", async () => {
    await recordDashboardVisitAction("2099-01-01T00:00:00.000Z");

    const [, writtenIso] = recordDashboardVisit.mock.calls[0];
    expect(writtenIso).toBe("2026-08-25T12:00:00.000Z");
  });

  it("passes an ordinary past/present timestamp through unchanged", async () => {
    await recordDashboardVisitAction("2026-08-25T09:30:00.000Z");
    const [, writtenIso] = recordDashboardVisit.mock.calls[0];
    expect(writtenIso).toBe("2026-08-25T09:30:00.000Z");
  });
});

describe("recordDashboardVisitAction -- failure behavior (16)", () => {
  it("a store write failure never throws -- resolves to a typed failure result", async () => {
    recordDashboardVisit.mockRejectedValue(new Error("db down"));
    const result = await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    expect(result).toEqual({ ok: false, error: "write_failed" });
  });

  it("never logs error details (PII-safe fixed string only)", async () => {
    recordDashboardVisit.mockRejectedValue(new Error("some sensitive db detail"));
    await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    expect(consoleErrorSpy).toHaveBeenCalledWith("[dashboard] visit marker write failed");
  });

  it("succeeds when the write succeeds", async () => {
    const result = await recordDashboardVisitAction("2026-08-25T10:00:00.000Z");
    expect(result).toEqual({ ok: true });
  });
});
