import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxJobRow } from "@/lib/notifications/engine/store";

const getAuthenticatedIdentity = vi.fn();
vi.mock("@/lib/auth/currentUser", () => ({ getAuthenticatedIdentity }));

const getInboxClearedBefore = vi.fn();
const getInboxJobsForRecipient = vi.fn();
const getReadJobIds = vi.fn();
vi.mock("@/lib/notifications/engine/store", () => ({
  NOTIFICATION_INBOX_LIMIT: 50,
  getInboxClearedBefore,
  getInboxJobsForRecipient,
  getReadJobIds,
}));

const { loadNotificationInbox } = await import("./notificationInbox");

const ME_ID = "u_me";
const OTHER_ID = "u_other";

function job(overrides: Partial<InboxJobRow> = {}): InboxJobRow {
  return {
    id: "job_1",
    category: "tomorrow_shift",
    title: "⏰ המשמרת שלך מחר",
    body: "מחר ב־07:30 מתחילה משמרת יום שלך",
    path: "/",
    createdAt: "2026-08-18T00:05:00.000Z",
    scheduledFor: "2026-08-18T17:00:00.000Z",
    ...overrides,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  getAuthenticatedIdentity.mockReset();
  getInboxClearedBefore.mockReset();
  getInboxJobsForRecipient.mockReset();
  getReadJobIds.mockReset();
  getAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: ME_ID, email: "me@example.com", avatarUrl: null });
  getInboxClearedBefore.mockResolvedValue("-infinity");
  getInboxJobsForRecipient.mockResolvedValue([]);
  getReadJobIds.mockResolvedValue(new Set());
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe("loadNotificationInbox -- authorization", () => {
  it("queries only the authenticated user's own recipient id", async () => {
    await loadNotificationInbox();
    expect(getInboxClearedBefore).toHaveBeenCalledWith(ME_ID);
    expect(getInboxJobsForRecipient).toHaveBeenCalledWith(ME_ID, "-infinity", 50);
  });

  it("returns an empty inbox without querying the store when unauthenticated", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "unauthenticated" });
    const result = await loadNotificationInbox();
    expect(result).toEqual({ items: [], unreadCount: 0 });
    expect(getInboxJobsForRecipient).not.toHaveBeenCalled();
  });

  it("returns an empty inbox without querying the store for a missing-email identity", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "missing_email", userId: ME_ID });
    const result = await loadNotificationInbox();
    expect(result).toEqual({ items: [], unreadCount: 0 });
    expect(getInboxJobsForRecipient).not.toHaveBeenCalled();
  });

  it("threads the SAME clearedBefore value into the jobs query -- both queries always agree on the same instant", async () => {
    getInboxClearedBefore.mockResolvedValue("2026-08-10T00:00:00.000Z");
    await loadNotificationInbox();
    expect(getInboxJobsForRecipient).toHaveBeenCalledWith(ME_ID, "2026-08-10T00:00:00.000Z", 50);
  });
});

describe("loadNotificationInbox -- read state", () => {
  it("isRead reflects membership in the store's read-id set", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ id: "a" }), job({ id: "b" })]);
    getReadJobIds.mockResolvedValue(new Set(["a"]));

    const result = await loadNotificationInbox();

    expect(result.items.find((i) => i.id === "a")?.isRead).toBe(true);
    expect(result.items.find((i) => i.id === "b")?.isRead).toBe(false);
  });

  it("unreadCount always agrees with items[].isRead -- computed from the SAME pass", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ id: "a" }), job({ id: "b" }), job({ id: "c" })]);
    getReadJobIds.mockResolvedValue(new Set(["a"]));

    const result = await loadNotificationInbox();

    expect(result.unreadCount).toBe(2);
    expect(result.items.filter((i) => !i.isRead)).toHaveLength(result.unreadCount);
  });

  it("queries read state with exactly the visible job ids -- one query, never N+1", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ id: "a" }), job({ id: "b" })]);
    await loadNotificationInbox();
    expect(getReadJobIds).toHaveBeenCalledTimes(1);
    expect(getReadJobIds).toHaveBeenCalledWith(ME_ID, ["a", "b"]);
  });

  it("everyone unread when the store reports no reads at all", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ id: "a" }), job({ id: "b" })]);
    const result = await loadNotificationInbox();
    expect(result.unreadCount).toBe(2);
  });
});

describe("loadNotificationInbox -- safe presentation model", () => {
  it("never exposes internal notification-engine fields", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job()]);
    const result = await loadNotificationInbox();
    expect(Object.keys(result.items[0]).sort()).toEqual(["body", "category", "happenedAt", "id", "isRead", "path", "title"]);
  });

  it("happenedAt is the job's own scheduled_for, not created_at", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ scheduledFor: "2026-08-18T17:00:00.000Z", createdAt: "2026-08-18T00:05:00.000Z" })]);
    const result = await loadNotificationInbox();
    expect(result.items[0].happenedAt).toBe("2026-08-18T17:00:00.000Z");
  });

  it("preserves the store layer's ordering (never re-sorts)", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ id: "newest" }), job({ id: "older" })]);
    const result = await loadNotificationInbox();
    expect(result.items.map((i) => i.id)).toEqual(["newest", "older"]);
  });
});

describe("loadNotificationInbox -- path re-validation at the server/client boundary", () => {
  it("a normal hardcoded path passes through unchanged", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ path: "/schedule" })]);
    const result = await loadNotificationInbox();
    expect(result.items[0].path).toBe("/schedule");
  });

  it("a protocol-relative path (would escape same-origin) degrades to '/'", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ path: "//evil.example.com" })]);
    const result = await loadNotificationInbox();
    expect(result.items[0].path).toBe("/");
  });

  it("an absolute external URL degrades to '/'", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ path: "https://evil.example.com" })]);
    const result = await loadNotificationInbox();
    expect(result.items[0].path).toBe("/");
  });

  it("a javascript: pseudo-URL degrades to '/'", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ path: "javascript:alert(1)" })]);
    const result = await loadNotificationInbox();
    expect(result.items[0].path).toBe("/");
  });

  it("a path with no leading slash degrades to '/'", async () => {
    getInboxJobsForRecipient.mockResolvedValue([job({ path: "schedule" })]);
    const result = await loadNotificationInbox();
    expect(result.items[0].path).toBe("/");
  });

  it("never trusts persisted data as safe-forever -- reuses the SAME resolver buildNotificationPayload already applies to outgoing push paths", async () => {
    // A malformed/unexpected value never reaches items[].path unvalidated,
    // regardless of how it got into notification_jobs.path.
    getInboxJobsForRecipient.mockResolvedValue([job({ id: "a", path: "/duties" }), job({ id: "b", path: "ftp://example.com" })]);
    const result = await loadNotificationInbox();
    expect(result.items.find((i) => i.id === "a")?.path).toBe("/duties");
    expect(result.items.find((i) => i.id === "b")?.path).toBe("/");
  });
});

describe("loadNotificationInbox -- isolation", () => {
  it("never requests another user's recipient id, regardless of who is authenticated", async () => {
    getAuthenticatedIdentity.mockResolvedValue({ status: "authenticated", userId: OTHER_ID, email: "other@example.com", avatarUrl: null });
    await loadNotificationInbox();
    expect(getInboxClearedBefore).toHaveBeenCalledWith(OTHER_ID);
    expect(getInboxJobsForRecipient).toHaveBeenCalledWith(OTHER_ID, expect.anything(), expect.anything());
    expect(getInboxClearedBefore).not.toHaveBeenCalledWith(ME_ID);
  });
});

describe("loadNotificationInbox -- failure behavior", () => {
  it("a store/query failure never throws -- resolves to an empty inbox", async () => {
    getInboxJobsForRecipient.mockRejectedValue(new Error("supabase down"));
    const result = await loadNotificationInbox();
    expect(result).toEqual({ items: [], unreadCount: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[notifications] inbox query failed");
  });

  it("an auth-resolution failure never throws -- resolves to an empty inbox", async () => {
    getAuthenticatedIdentity.mockRejectedValue(new Error("auth down"));
    const result = await loadNotificationInbox();
    expect(result).toEqual({ items: [], unreadCount: 0 });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[notifications] inbox query failed");
  });

  it("never logs error details (PII-safe fixed string only)", async () => {
    getInboxJobsForRecipient.mockRejectedValue(new Error("some sensitive db detail"));
    await loadNotificationInbox();
    const loggedArgs = consoleErrorSpy.mock.calls[0];
    expect(loggedArgs).toEqual(["[notifications] inbox query failed"]);
  });
});
