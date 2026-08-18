import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedIdentity = vi.fn();
const loadNotificationInbox = vi.fn();
const getInboxClearedBefore = vi.fn();
const getInboxJobsForRecipient = vi.fn();
const getReadJobIds = vi.fn();
const markNotificationJobRead = vi.fn();
const markNotificationJobsRead = vi.fn();
const clearNotificationInbox = vi.fn();

vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity: () => getAuthenticatedIdentity() }));
vi.mock("@/lib/readModels/notificationInbox", () => ({ loadNotificationInbox: () => loadNotificationInbox() }));
vi.mock("@/lib/notifications/engine/store", () => ({
  NOTIFICATION_INBOX_LIMIT: 50,
  getInboxClearedBefore: (...args: unknown[]) => getInboxClearedBefore(...args),
  getInboxJobsForRecipient: (...args: unknown[]) => getInboxJobsForRecipient(...args),
  getReadJobIds: (...args: unknown[]) => getReadJobIds(...args),
  markNotificationJobRead: (...args: unknown[]) => markNotificationJobRead(...args),
  markNotificationJobsRead: (...args: unknown[]) => markNotificationJobsRead(...args),
  clearNotificationInbox: (...args: unknown[]) => clearNotificationInbox(...args),
}));

const {
  getNotificationInboxAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  clearNotificationInboxAction,
} = await import("./inboxActions");

const AUTHENTICATED = { status: "authenticated" as const, userId: "u_me", email: "me@example.invalid", avatarUrl: null };

beforeEach(() => {
  getAuthenticatedIdentity.mockReset().mockResolvedValue(AUTHENTICATED);
  loadNotificationInbox.mockReset().mockResolvedValue({ items: [], unreadCount: 0 });
  getInboxClearedBefore.mockReset().mockResolvedValue("-infinity");
  getInboxJobsForRecipient.mockReset().mockResolvedValue([]);
  getReadJobIds.mockReset().mockResolvedValue(new Set());
  markNotificationJobRead.mockReset();
  markNotificationJobsRead.mockReset();
  clearNotificationInbox.mockReset();
});

describe("getNotificationInboxAction", () => {
  it("delegates straight to the read model", async () => {
    loadNotificationInbox.mockResolvedValue({ items: [{ id: "a" }], unreadCount: 1 });
    const result = await getNotificationInboxAction();
    expect(result).toEqual({ items: [{ id: "a" }], unreadCount: 1 });
  });
});

describe("markNotificationReadAction", () => {
  it("rejects an unauthenticated caller before touching the store", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await markNotificationReadAction("job_1");
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(markNotificationJobRead).not.toHaveBeenCalled();
  });

  it("rejects an empty/invalid job id", async () => {
    const result = await markNotificationReadAction("");
    expect(result).toEqual({ ok: false, error: "invalid_job_id" });
    expect(markNotificationJobRead).not.toHaveBeenCalled();
  });

  it("marks the job read, scoped to the server-verified user id -- never a client-supplied one", async () => {
    const result = await markNotificationReadAction("job_1");
    expect(result).toEqual({ ok: true });
    expect(markNotificationJobRead).toHaveBeenCalledWith("u_me", "job_1");
  });

  it("never throws on a store failure -- fails closed with a typed result", async () => {
    markNotificationJobRead.mockRejectedValue(new Error("db down"));
    const result = await markNotificationReadAction("job_1");
    expect(result).toEqual({ ok: false, error: "mark_read_failed" });
  });
});

describe("markAllNotificationsReadAction", () => {
  it("rejects an unauthenticated caller before touching the store", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await markAllNotificationsReadAction();
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(markNotificationJobsRead).not.toHaveBeenCalled();
  });

  it("re-derives the currently-unread set server-side rather than trusting a client-supplied list", async () => {
    getInboxJobsForRecipient.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    getReadJobIds.mockResolvedValue(new Set(["a"]));

    const result = await markAllNotificationsReadAction();

    expect(result).toEqual({ ok: true });
    expect(markNotificationJobsRead).toHaveBeenCalledWith("u_me", ["b", "c"]);
  });

  it("marks nothing when everything is already read", async () => {
    getInboxJobsForRecipient.mockResolvedValue([{ id: "a" }]);
    getReadJobIds.mockResolvedValue(new Set(["a"]));

    await markAllNotificationsReadAction();

    expect(markNotificationJobsRead).toHaveBeenCalledWith("u_me", []);
  });

  it("never throws on a store failure -- fails closed with a typed result", async () => {
    getInboxJobsForRecipient.mockRejectedValue(new Error("db down"));
    const result = await markAllNotificationsReadAction();
    expect(result).toEqual({ ok: false, error: "mark_all_read_failed" });
  });
});

describe("clearNotificationInboxAction", () => {
  it("rejects an unauthenticated caller before touching the store", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await clearNotificationInboxAction();
    expect(result).toEqual({ ok: false, error: "not_authenticated" });
    expect(clearNotificationInbox).not.toHaveBeenCalled();
  });

  it("clears the caller's own inbox, scoped to the server-verified user id", async () => {
    const result = await clearNotificationInboxAction();
    expect(result).toEqual({ ok: true });
    expect(clearNotificationInbox).toHaveBeenCalledWith("u_me");
  });

  it("never throws on a store failure -- fails closed with a typed result", async () => {
    clearNotificationInbox.mockRejectedValue(new Error("db down"));
    const result = await clearNotificationInboxAction();
    expect(result).toEqual({ ok: false, error: "clear_failed" });
  });
});
