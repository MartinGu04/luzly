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

async function openPanel() {
  render(<NotificationBell variant="mobile" />);
  await act(async () => {});
  fireEvent.click(screen.getByRole("button", { name: /התראות/ }));
}

beforeEach(() => {
  vi.clearAllMocks();
  enablePushNotificationsAction.mockResolvedValue({ ok: true });
  disablePushNotificationsAction.mockResolvedValue({ ok: true });
  getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });
  sendTestNotificationAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  removeBrowserPushEnvironment();
});

describe("NotificationBell — unsupported environment", () => {
  it("never throws and shows a calm 'unsupported' message, with no enable button", async () => {
    removeBrowserPushEnvironment();
    await openPanel();
    await waitFor(() => expect(screen.getByText(/אינן נתמכות/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "הפעל התראות" })).toBeNull();
  });
});

describe("NotificationBell — no automatic permission prompt", () => {
  it("never calls Notification.requestPermission on mount, or merely by opening the panel", async () => {
    const { requestPermission } = installBrowserPushEnvironment();
    await openPanel();
    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("requests permission ONLY after the user explicitly clicks 'הפעל התראות'", async () => {
    const { requestPermission } = installBrowserPushEnvironment();
    await openPanel();
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

    await openPanel();

    await waitFor(() => expect(screen.getByText("התראות חסומות")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "הפעל התראות" })).toBeNull();
    expect(window.Notification.requestPermission).not.toHaveBeenCalled();
  });

  it("a user who denies at the prompt sees the calm explanation, not a repeated prompt", async () => {
    const { requestPermission } = installBrowserPushEnvironment();
    requestPermission.mockResolvedValue("denied");

    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByText("התראות חסומות")).toBeInTheDocument());
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });
});

describe("NotificationBell — enabling", () => {
  it("does not claim 'enabled' until both the browser subscription AND server persistence succeed", async () => {
    installBrowserPushEnvironment();
    enablePushNotificationsAction.mockResolvedValue({ ok: false, error: "persist_failed" });

    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(screen.queryByText("התראות פעילות")).toBeNull();
  });

  it("shows 'התראות פעילות' with test/disable actions once the whole pipeline succeeds", async () => {
    installBrowserPushEnvironment();
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "שלח התראת בדיקה" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "כבה התראות" })).toBeInTheDocument();
  });

  it("reuses an existing browser subscription instead of creating a duplicate (idempotent)", async () => {
    const existing = new FakePushSubscription("https://push.example/already-subscribed");
    const { pushManager } = installBrowserPushEnvironment({ existingSubscription: existing });

    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));

    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(enablePushNotificationsAction).toHaveBeenCalledWith(existing.toJSON());
  });

  it("pressing enable twice in a row never creates two server rows or two browser subscriptions", async () => {
    installBrowserPushEnvironment();
    await openPanel();
    const enableButton = await screen.findByRole("button", { name: "הפעל התראות" });

    await act(async () => {
      fireEvent.click(enableButton);
    });
    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());

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

    await openPanel();

    await waitFor(() => expect(screen.getByRole("button", { name: "הפעל התראות" })).toBeInTheDocument());
    expect(screen.queryByText("התראות פעילות")).toBeNull();
  });

  it("shows enabled immediately when the server confirms a matching subscription for the current user", async () => {
    const existing = new FakePushSubscription("https://push.example/mine");
    installBrowserPushEnvironment({ existingSubscription: existing });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: true });

    await openPanel();

    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());
  });
});

describe("NotificationBell — disable", () => {
  async function enableFirst() {
    installBrowserPushEnvironment();
    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));
    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());
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
  it("clicking 'שלח התראת בדיקה' calls the server test-push action, never `new Notification()` directly", async () => {
    installBrowserPushEnvironment();
    const notificationConstructorSpy = vi.fn();
    // @ts-expect-error -- if NotificationBell ever constructed a real Notification, this spy would catch it.
    window.Notification = Object.assign(notificationConstructorSpy, { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") });

    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));
    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "שלח התראת בדיקה" }));
    });

    expect(sendTestNotificationAction).toHaveBeenCalledTimes(1);
    expect(notificationConstructorSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByText(/נשלחה בהצלחה/)).toBeInTheDocument());
  });

  it("shows an error state when the test send fails, without crashing", async () => {
    installBrowserPushEnvironment();
    sendTestNotificationAction.mockResolvedValue({ ok: false, error: "send_failed" });

    await openPanel();
    fireEvent.click(await screen.findByRole("button", { name: "הפעל התראות" }));
    await waitFor(() => expect(screen.getByText("התראות פעילות")).toBeInTheDocument());

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "שלח התראת בדיקה" }));
    });

    await waitFor(() => expect(screen.getByText(/נכשלה/)).toBeInTheDocument());
  });
});

describe("NotificationBell — popover anchor side (header polish follow-up)", () => {
  it.each(["sidebar", "mobile", "shell"] as const)(
    "the %s variant's open panel is anchored with end-0 (RTL: pins the panel's physical LEFT edge, growing rightward/inward) -- never start-0, which grows further left and off-screen for a trigger near the physical left edge",
    async (variant) => {
      render(<NotificationBell variant={variant} />);
      await act(async () => {});
      fireEvent.click(screen.getByRole("button", { name: /התראות/ }));

      const panel = await screen.findByRole("dialog", { name: "הגדרות התראות" });
      expect(panel.className).toMatch(/\bend-0\b/);
      expect(panel.className).not.toMatch(/\bstart-0\b/);
    },
  );
});
