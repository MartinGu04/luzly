import { describe, expect, it, vi } from "vitest";

const getAuthenticatedIdentity = vi.fn();
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity: () => getAuthenticatedIdentity() }));

const enableCalendarFeedForCurrentUser = vi.fn();
const resetCalendarFeedForCurrentUser = vi.fn();
const disableCalendarFeedForCurrentUser = vi.fn();
vi.mock("./feedStore", () => ({
  enableCalendarFeedForCurrentUser: (userId: string) => enableCalendarFeedForCurrentUser(userId),
  resetCalendarFeedForCurrentUser: (userId: string) => resetCalendarFeedForCurrentUser(userId),
  disableCalendarFeedForCurrentUser: (userId: string) => disableCalendarFeedForCurrentUser(userId),
}));

const resolveRequestOrigin = vi.fn();
vi.mock("./requestOrigin", () => ({ resolveRequestOrigin: () => resolveRequestOrigin() }));

const { enableCalendarSyncAction, resetCalendarSyncAction, disableCalendarSyncAction } = await import("./actions");

const AUTHENTICATED = { status: "authenticated", userId: "user-1", email: "dani@example.com", avatarUrl: null };

describe("enableCalendarSyncAction", () => {
  it("rejects an unauthenticated caller before doing any work", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue({ status: "unauthenticated" });

    const result = await enableCalendarSyncAction();

    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(enableCalendarFeedForCurrentUser).not.toHaveBeenCalled();
  });

  it("passes the server-verified userId (never client input) to the store, and returns built links", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
    resolveRequestOrigin.mockReset().mockResolvedValue("https://mi-ma-mo.app");
    enableCalendarFeedForCurrentUser.mockReset().mockResolvedValue({ ok: true, token: "tok-1" });

    const result = await enableCalendarSyncAction();

    expect(enableCalendarFeedForCurrentUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      ok: true,
      links: {
        url: "https://mi-ma-mo.app/calendar/tok-1.ics",
        googleUrl: expect.stringContaining("calendar.google.com"),
        appleUrl: "webcal://mi-ma-mo.app/calendar/tok-1.ics",
      },
    });
  });

  it("fails when the request origin can't be resolved, without ever touching the store", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
    resolveRequestOrigin.mockReset().mockResolvedValue(null);
    enableCalendarFeedForCurrentUser.mockReset();

    const result = await enableCalendarSyncAction();

    expect(result).toEqual({ ok: false, error: "unknown_origin" });
    expect(enableCalendarFeedForCurrentUser).not.toHaveBeenCalled();
  });

  it("surfaces a persist failure without throwing", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
    resolveRequestOrigin.mockReset().mockResolvedValue("https://mi-ma-mo.app");
    enableCalendarFeedForCurrentUser.mockReset().mockResolvedValue({ ok: false });

    expect(await enableCalendarSyncAction()).toEqual({ ok: false, error: "persist_failed" });
  });
});

describe("resetCalendarSyncAction", () => {
  it("rejects an unauthenticated caller", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue({ status: "unauthenticated" });
    expect(await resetCalendarSyncAction()).toEqual({ ok: false, error: "not_authenticated" });
    expect(resetCalendarFeedForCurrentUser).not.toHaveBeenCalled();
  });

  it("returns fresh links built from the rotated token", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
    resolveRequestOrigin.mockReset().mockResolvedValue("https://mi-ma-mo.app");
    resetCalendarFeedForCurrentUser.mockReset().mockResolvedValue({ ok: true, token: "tok-2" });

    const result = await resetCalendarSyncAction();

    expect(resetCalendarFeedForCurrentUser).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      ok: true,
      links: expect.objectContaining({ url: "https://mi-ma-mo.app/calendar/tok-2.ics" }),
    });
  });

  it("surfaces the store's failure reason", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
    resolveRequestOrigin.mockReset().mockResolvedValue("https://mi-ma-mo.app");
    resetCalendarFeedForCurrentUser.mockReset().mockResolvedValue({ ok: false, reason: "not_enabled" });

    expect(await resetCalendarSyncAction()).toEqual({ ok: false, error: "not_enabled" });
  });
});

describe("disableCalendarSyncAction", () => {
  it("rejects an unauthenticated caller", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue({ status: "unauthenticated" });
    expect(await disableCalendarSyncAction()).toEqual({ ok: false });
    expect(disableCalendarFeedForCurrentUser).not.toHaveBeenCalled();
  });

  it("passes the server-verified userId and returns the store's result", async () => {
    getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
    disableCalendarFeedForCurrentUser.mockReset().mockResolvedValue({ ok: true });

    expect(await disableCalendarSyncAction()).toEqual({ ok: true });
    expect(disableCalendarFeedForCurrentUser).toHaveBeenCalledWith("user-1");
  });
});
