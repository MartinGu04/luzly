import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NotificationBell } from "./NotificationBell";

const enablePushNotificationsAction = vi.fn();
const disablePushNotificationsAction = vi.fn();
const getPushSubscriptionStatusAction = vi.fn();
const sendTestNotificationAction = vi.fn();

vi.mock("@/lib/notifications/actions", () => ({
  enablePushNotificationsAction: (...args: unknown[]) => enablePushNotificationsAction(...args),
  disablePushNotificationsAction: (...args: unknown[]) => disablePushNotificationsAction(...args),
  getPushSubscriptionStatusAction: (...args: unknown[]) => getPushSubscriptionStatusAction(...args),
  sendTestNotificationAction: (...args: unknown[]) => sendTestNotificationAction(...args),
}));

vi.mock("@/lib/push/publicConfig", () => ({ getVapidPublicKey: () => "test-public-key" }));

const getNotificationInboxAction = vi.fn();
const markNotificationReadAction = vi.fn();
const markAllNotificationsReadAction = vi.fn();
const clearNotificationInboxAction = vi.fn();

vi.mock("@/lib/notifications/inboxActions", () => ({
  getNotificationInboxAction: (...args: unknown[]) => getNotificationInboxAction(...args),
  markNotificationReadAction: (...args: unknown[]) => markNotificationReadAction(...args),
  markAllNotificationsReadAction: (...args: unknown[]) => markAllNotificationsReadAction(...args),
  clearNotificationInboxAction: (...args: unknown[]) => clearNotificationInboxAction(...args),
}));

class FakePushSubscription {
  endpoint: string;
  unsubscribe = vi.fn().mockResolvedValue(true);
  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }
  toJSON() {
    return { endpoint: this.endpoint, keys: { p256dh: "p", auth: "a" }, expirationTime: null };
  }
}

function installBrowserPushEnvironment({
  existingSubscription = null as FakePushSubscription | null,
  subscribeImpl,
}: {
  existingSubscription?: FakePushSubscription | null;
  subscribeImpl?: () => Promise<FakePushSubscription>;
} = {}) {
  let currentSubscription = existingSubscription;
  const subscribe = vi.fn(async () => {
    if (subscribeImpl) {
      currentSubscription = await subscribeImpl();
      return currentSubscription;
    }
    currentSubscription = new FakePushSubscription("https://push.example/new-endpoint");
    return currentSubscription;
  });
  const pushManager = {
    getSubscription: vi.fn(async () => currentSubscription),
    subscribe,
  };
  const registration = { pushManager };

  const requestPermission = vi.fn().mockResolvedValue("granted");

  // @ts-expect-error -- test-only global stubs simulating a supporting browser.
  window.PushManager = function PushManager() {};
  // @ts-expect-error -- test-only global stubs simulating a supporting browser.
  window.Notification = { permission: "default", requestPermission };

  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn().mockResolvedValue(registration),
      get ready() {
        return Promise.resolve(registration);
      },
    },
    configurable: true,
    writable: true,
  });

  return { pushManager, requestPermission, registration, setCurrentSubscription: (s: FakePushSubscription | null) => (currentSubscription = s) };
}

function removeBrowserPushEnvironment() {
  // @ts-expect-error -- test-only cleanup.
  delete window.PushManager;
  // @ts-expect-error -- test-only cleanup.
  delete window.Notification;
  // @ts-expect-error -- test-only cleanup.
  delete window.navigator.serviceWorker;
}

async function openPanel(variant: "sidebar" | "mobile" | "shell" = "mobile") {
  render(<NotificationBell variant={variant} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /התראות/ }));
}

/** Opens the popover (inbox view, the default) then clicks the gear to reach the push-settings view -- every push-control test now lives behind this. */
async function openSettings() {
  await openPanel();
  fireEvent.click(await screen.findByRole("button", { name: "הגדרות התראות" }));
}

function inboxItem(overrides: Partial<{ id: string; category: string; title: string; body: string; path: string; happenedAt: string; isRead: boolean }> = {}) {
  return {
    id: "job_1",
    category: "tomorrow_shift",
    title: "⏰ המשמרת שלך מחר",
    body: "מחר ב־07:30 מתחילה משמרת יום שלך",
    path: "/",
    happenedAt: new Date().toISOString(),
    isRead: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  enablePushNotificationsAction.mockResolvedValue({ ok: true });
  disablePushNotificationsAction.mockResolvedValue({ ok: true });
  getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });
  sendTestNotificationAction.mockResolvedValue({ ok: true });
  getNotificationInboxAction.mockResolvedValue({ items: [], unreadCount: 0 });
  markNotificationReadAction.mockResolvedValue({ ok: true });
  markAllNotificationsReadAction.mockResolvedValue({ ok: true });
  clearNotificationInboxAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  removeBrowserPushEnvironment();
});

describe("NotificationBell — inbox is the primary view", () => {
  it("opening the bell shows the inbox, not the push-settings panel", async () => {
    await openPanel();
    await waitFor(() => expect(screen.getByRole("dialog", { name: "התראות" })).toBeInTheDocument());
    expect(screen.queryByText("סטטוס: כבוי")).toBeNull();
    expect(screen.queryByText("סטטוס: פעיל")).toBeNull();
  });

  it("shows the calm empty state when there are no items", async () => {
    await openPanel();
    await waitFor(() => expect(screen.getByText("אין התראות חדשות")).toBeInTheDocument());
  });

  it("shows a loading state before the first fetch resolves", async () => {
    let resolveInbox: (value: { items: unknown[]; unreadCount: number }) => void = () => {};
    getNotificationInboxAction.mockReturnValue(new Promise((resolve) => (resolveInbox = resolve)));

    await openPanel();
    expect(screen.getByText("טוען התראות...")).toBeInTheDocument();

    await act(async () => resolveInbox({ items: [], unreadCount: 0 }));
    await waitFor(() => expect(screen.getByText("אין התראות חדשות")).toBeInTheDocument());
  });

  it("shows a neutral error state when the fetch fails, never crashes", async () => {
    getNotificationInboxAction.mockRejectedValue(new Error("network down"));
    await openPanel();
    await waitFor(() => expect(screen.getByText("לא ניתן לטעון כרגע את ההתראות")).toBeInTheDocument());
  });

  it("renders items newest first with title and body", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "a", title: "⚠️ שינוי בשיבוץ", body: "השיבוץ שלך השתנה" })],
      unreadCount: 1,
    });
    await openPanel();
    await waitFor(() => expect(screen.getByText("⚠️ שינוי בשיבוץ")).toBeInTheDocument());
    expect(screen.getByText("השיבוץ שלך השתנה")).toBeInTheDocument();
  });
});

describe("NotificationBell — unread badge", () => {
  it("shows no badge when unreadCount is 0", async () => {
    getNotificationInboxAction.mockResolvedValue({ items: [inboxItem({ isRead: true })], unreadCount: 0 });
    render(<NotificationBell variant="mobile" />);
    await waitFor(() => expect(getNotificationInboxAction).toHaveBeenCalled());
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByRole("button", { name: "התראות" })).toBeInTheDocument();
  });

  it("shows the unread count on the trigger", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "a" }), inboxItem({ id: "b" })],
      unreadCount: 2,
    });
    render(<NotificationBell variant="mobile" />);
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "התראות, 2 שלא נקראו" })).toBeInTheDocument();
  });

  it("caps the displayed badge at 9+", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: Array.from({ length: 12 }, (_, i) => inboxItem({ id: `j${i}` })),
      unreadCount: 12,
    });
    render(<NotificationBell variant="mobile" />);
    await waitFor(() => expect(screen.getByText("9+")).toBeInTheDocument());
  });
});

describe("NotificationBell — unread/read visual distinction", () => {
  it("an unread item shows a dot indicator and bold title; a read item does not", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "unread", title: "⚠️ לא נקרא", isRead: false }), inboxItem({ id: "read", title: "🔄 נקרא", isRead: true })],
      unreadCount: 1,
    });
    await openPanel();
    await waitFor(() => expect(screen.getByText("⚠️ לא נקרא")).toBeInTheDocument());

    const unreadTitle = screen.getByText("⚠️ לא נקרא");
    const readTitle = screen.getByText("🔄 נקרא");
    expect(unreadTitle.className).toMatch(/font-medium/);
    expect(readTitle.className).not.toMatch(/font-medium/);
  });
});

describe("NotificationBell — click an item", () => {
  it("marks it read and links to its safe existing destination", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "job_x", path: "/schedule", isRead: false })],
      unreadCount: 1,
    });
    await openPanel();
    const link = await screen.findByRole("link");
    expect(link).toHaveAttribute("href", "/schedule");

    fireEvent.click(link);
    expect(markNotificationReadAction).toHaveBeenCalledWith("job_x");
  });

  it("clicking an already-read item never re-marks it read", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "job_x", isRead: true })],
      unreadCount: 0,
    });
    await openPanel();
    const link = await screen.findByRole("link");

    fireEvent.click(link);
    expect(markNotificationReadAction).not.toHaveBeenCalled();
  });

  it("closes the popover after clicking an item", async () => {
    getNotificationInboxAction.mockResolvedValue({ items: [inboxItem()], unreadCount: 1 });
    await openPanel();
    const link = await screen.findByRole("link");

    fireEvent.click(link);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("NotificationBell — סמן הכל כנקרא / נקה התראות", () => {
  it("סמן הכל כנקרא is disabled when nothing is unread", async () => {
    getNotificationInboxAction.mockResolvedValue({ items: [inboxItem({ isRead: true })], unreadCount: 0 });
    await openPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: "סמן הכל כנקרא" })).toBeDisabled());
  });

  it("clicking סמן הכל כנקרא calls the mark-all action", async () => {
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "a" }), inboxItem({ id: "b" })],
      unreadCount: 2,
    });
    await openPanel();
    const button = await screen.findByRole("button", { name: "סמן הכל כנקרא" });

    await act(async () => {
      fireEvent.click(button);
    });
    expect(markAllNotificationsReadAction).toHaveBeenCalledTimes(1);
  });

  it("clicking נקה התראות calls the clear action and empties the list", async () => {
    getNotificationInboxAction.mockResolvedValue({ items: [inboxItem()], unreadCount: 1 });
    await openPanel();
    const button = await screen.findByRole("button", { name: "נקה התראות" });

    await act(async () => {
      fireEvent.click(button);
    });
    expect(clearNotificationInboxAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText("אין התראות חדשות")).toBeInTheDocument());
  });

  it("action row never renders on an empty inbox", async () => {
    getNotificationInboxAction.mockResolvedValue({ items: [], unreadCount: 0 });
    await openPanel();
    await waitFor(() => expect(screen.getByText("אין התראות חדשות")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "סמן הכל כנקרא" })).toBeNull();
    expect(screen.queryByRole("button", { name: "נקה התראות" })).toBeNull();
  });
});

describe("NotificationBell — gear opens push settings", () => {
  it("clicking the gear switches to the settings view", async () => {
    removeBrowserPushEnvironment();
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הגדרות התראות" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "הגדרות התראות" })).toBeInTheDocument());
  });

  it("the back button returns to the inbox view", async () => {
    removeBrowserPushEnvironment();
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הגדרות התראות" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "הגדרות התראות" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "חזרה להתראות" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "התראות" })).toBeInTheDocument());
  });

  it("closing and reopening the popover resets back to the inbox view", async () => {
    removeBrowserPushEnvironment();
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הגדרות התראות" }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "הגדרות התראות" })).toBeInTheDocument());

    // Escape closes the popover.
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: /התראות/ }));
    await waitFor(() => expect(screen.getByRole("dialog", { name: "התראות" })).toBeInTheDocument());
  });
});

describe("NotificationBell — unsupported environment (settings view)", () => {
  it("never throws and shows a calm 'unsupported' message, with no enable button", async () => {
    removeBrowserPushEnvironment();
    await openSettings();
    await waitFor(() => expect(screen.getByText(/אינן נתמכות/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "הפעל התראות" })).toBeNull();
  });
});

describe("NotificationBell — no automatic permission prompt", () => {
  it("never calls Notification.requestPermission on mount, or merely by opening the panel", async () => {
    const { requestPermission } = installBrowserPushEnvironment();
    await openSettings();
    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission ONLY after the user explicitly clicks 'הפעל התראות'", async () => {
    const { requestPermission } = installBrowserPushEnvironment();
    await openSettings();
    const enableButton = await screen.findByRole("button", { name: "הפעל התראות" });

    expect(requestPermission).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(enableButton);
    });
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationBell — permission denied", () => {
  it("shows a calm explanation instead of an enable button, and never calls requestPermission again", async () => {
    installBrowserPushEnvironment();
    // @ts-expect-error -- simulate a browser that already denied permission.
    window.Notification.permission = "denied";

    await openSettings();

    await waitFor(() => expect(screen.getByText("התראות חסומות")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "הפעל התראות" })).toBeNull();
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("a user who denies at the prompt sees the calm explanation, not a repeated prompt", async () => {
    const { requestPermission } = installBrowserPushEnvironment();
    requestPermission.mockResolvedValue("denied");

    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByText("התראות חסומות")).toBeInTheDocument());
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationBell — enabling", () => {
  it("does not claim 'enabled' until both the browser subscription AND server persistence succeed", async () => {
    installBrowserPushEnvironment();
    enablePushNotificationsAction.mockResolvedValue({ ok: false, error: "persist_failed" });

    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(screen.queryByText("סטטוס: פעיל")).toBeNull();
  });

  it("shows 'סטטוס: פעיל' with test/disable actions once the whole pipeline succeeds", async () => {
    installBrowserPushEnvironment();
    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "שלח התראת בדיקה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "כבה התראות" })).toBeInTheDocument();
  });

  it("reuses an existing browser subscription instead of creating a duplicate (idempotent)", async () => {
    const existing = new FakePushSubscription("https://push.example/already-subscribed");
    const { pushManager } = installBrowserPushEnvironment({ existingSubscription: existing });

    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(enablePushNotificationsAction).toHaveBeenCalledWith(existing.toJSON());
  });

  it("pressing enable twice in a row never creates two server rows or two browser subscriptions", async () => {
    installBrowserPushEnvironment();
    await openSettings();
    const enableButton = await screen.findByRole("button", { name: "הפעל התראות" });

    await act(async () => {
      fireEvent.click(enableButton);
    });
    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());

    // Re-open and simulate pressing enable again is a no-op (already enabled, no enable button rendered at all).
    expect(screen.queryByRole("button", { name: "הפעל התראות" })).toBeNull();
    expect(enablePushNotificationsAction).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationBell — status derivation (shared-device safety)", () => {
  it("a browser subscription that exists locally but has no matching server row for the current user is treated as NOT enabled", async () => {
    const leftover = new FakePushSubscription("https://push.example/previous-user");
    installBrowserPushEnvironment({ existingSubscription: leftover });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });

    await openSettings();

    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(screen.queryByText("סטטוס: פעיל")).toBeNull();
  });

  it("shows enabled immediately when the server confirms a matching subscription for the current user", async () => {
    const existing = new FakePushSubscription("https://push.example/mine");
    installBrowserPushEnvironment({ existingSubscription: existing });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: true });

    await openSettings();

    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());
  });
});

describe("NotificationBell — disable", () => {
  async function enableFirst() {
    installBrowserPushEnvironment();
    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));
    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());
  }

  it("removes both the server record and the browser subscription, and ends in a truthful disabled state", async () => {
    await enableFirst();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "כבה התראות" }));
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(disablePushNotificationsAction).toHaveBeenCalledTimes(1);
  });

  it("still ends in a disabled state locally even if the server-side delete fails (best-effort, never blocks)", async () => {
    await enableFirst();
    disablePushNotificationsAction.mockResolvedValue({ ok: false });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "כבה התראות" }));
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
  });
});

describe("NotificationBell — real test notification, never a fake browser Notification", () => {
  it("clicking 'שלח התראת בדיקה' calls the server test-push action, never `new Notification()` directly, and never creates an inbox item", async () => {
    installBrowserPushEnvironment();
    const notificationConstructorSpy = vi.fn();
    // @ts-expect-error -- if NotificationBell ever constructed a real Notification, this spy would catch it.
    window.Notification = Object.assign(notificationConstructorSpy, { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });

    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));
    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "שלח התראת בדיקה" }));
    });

    expect(sendTestNotificationAction).toHaveBeenCalledTimes(1);
    expect(notificationConstructorSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/נשלחה בהצלחה/)).toBeInTheDocument());

    // The test notification is diagnostic only -- it must never write to the inbox.
    expect(markNotificationReadAction).not.toHaveBeenCalled();
    expect(markAllNotificationsReadAction).not.toHaveBeenCalled();
    expect(clearNotificationInboxAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "חזרה להתראות" }));
    await waitFor(() => expect(screen.getByText("אין התראות חדשות")).toBeInTheDocument());
  });

  it("shows an error state when the test send fails, without crashing", async () => {
    installBrowserPushEnvironment();
    sendTestNotificationAction.mockResolvedValue({ ok: false, error: "send_failed" });

    await openSettings();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));
    await waitFor(() => expect(screen.getByText("סטטוס: פעיל")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "שלח התראת בדיקה" }));
    });

    await waitFor(() => expect(screen.getByText(/נכשלה/)).toBeInTheDocument());
  });
});

describe("NotificationBell — inbox works with push disabled", () => {
  it("shows real inbox items even when push is unsupported/never enabled on this device", async () => {
    removeBrowserPushEnvironment();
    getNotificationInboxAction.mockResolvedValue({
      items: [inboxItem({ id: "a", title: "🪖 תורנות מתקרבת", body: "מחר אתה תורן" })],
      unreadCount: 1,
    });

    await openPanel();

    await waitFor(() => expect(screen.getByText("🪖 תורנות מתקרבת")).toBeInTheDocument());
    expect(screen.getByText("מחר אתה תורן")).toBeInTheDocument();
  });
});

describe("NotificationBell — popover anchor side (header polish follow-up)", () => {
  it.each(["sidebar", "mobile", "shell"] as const)(
    "the %s variant's open panel is anchored with end-0 (RTL: pins the panel's physical LEFT edge, growing rightward/inward) -- never start-0, which grows further left and off-screen for a trigger near the physical left edge",
    async (variant) => {
      render(<NotificationBell variant={variant} />);
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: /התראות/ }));

      const panel = await screen.findByRole("dialog", { name: "התראות" });
      expect(panel.className).toMatch(/\bend-0\b/);
      expect(panel.className).not.toMatch(/\bstart-0\b/);
    },
  );
});
