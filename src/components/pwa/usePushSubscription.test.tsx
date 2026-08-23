import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { usePushSubscription } from "./usePushSubscription";
import { markPushPreferenceEnabled, readPushPreference } from "@/lib/notifications/pushPreference";

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

/** Same shape as `NotificationBell.test.tsx`'s helper of the same name -- installs a fake, controllable browser Push environment on `window`. */
function installBrowserPushEnvironment({
  existingSubscription = null as FakePushSubscription | null,
  permission = "default" as NotificationPermission,
}: {
  existingSubscription?: FakePushSubscription | null;
  permission?: NotificationPermission;
} = {}) {
  let currentSubscription = existingSubscription;
  const subscribe = vi.fn(async () => {
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
  window.Notification = { permission, requestPermission };

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

  return {
    pushManager,
    requestPermission,
    setPermission: (next: NotificationPermission) => {
      // @ts-expect-error -- test-only mutation.
      window.Notification.permission = next;
    },
    setCurrentSubscription: (s: FakePushSubscription | null) => {
      currentSubscription = s;
    },
  };
}

function removeBrowserPushEnvironment() {
  // @ts-expect-error -- test-only cleanup.
  delete window.PushManager;
  // @ts-expect-error -- test-only cleanup.
  delete window.Notification;
  // @ts-expect-error -- test-only cleanup.
  delete window.navigator.serviceWorker;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  enablePushNotificationsAction.mockResolvedValue({ ok: true });
  disablePushNotificationsAction.mockResolvedValue({ ok: true });
  getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });
  sendTestNotificationAction.mockResolvedValue({ ok: true });
});

afterEach(() => {
  removeBrowserPushEnvironment();
  window.localStorage.clear();
});

describe("usePushSubscription — explicit enable (spec B)", () => {
  it("a successful enable stores the preference as enabled for this userId", async () => {
    installBrowserPushEnvironment();
    const { result } = renderHook(() => usePushSubscription("user-a"));
    await waitFor(() => expect(result.current.state).toBe("not_enabled"));

    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.state).toBe("enabled");
    expect(readPushPreference("user-a")).toBe("enabled");
  });

  it("a failed server-side enable never stores the preference as enabled", async () => {
    installBrowserPushEnvironment();
    enablePushNotificationsAction.mockResolvedValue({ ok: false, error: "persist_failed" });
    const { result } = renderHook(() => usePushSubscription("user-a"));
    await waitFor(() => expect(result.current.state).toBe("not_enabled"));

    await act(async () => {
      await result.current.enable();
    });

    expect(result.current.state).toBe("not_enabled");
    expect(readPushPreference("user-a")).toBeNull();
  });
});

describe("usePushSubscription — explicit disable (spec C)", () => {
  async function enableFirst() {
    const env = installBrowserPushEnvironment();
    const { result, unmount } = renderHook(() => usePushSubscription("user-a"));
    await waitFor(() => expect(result.current.state).toBe("not_enabled"));
    await act(async () => {
      await result.current.enable();
    });
    await waitFor(() => expect(result.current.state).toBe("enabled"));
    return { env, result, unmount };
  }

  it("stores the preference as disabled and unregisters both server row and browser subscription", async () => {
    const { result } = await enableFirst();

    await act(async () => {
      await result.current.disable();
    });

    expect(result.current.state).toBe("not_enabled");
    expect(readPushPreference("user-a")).toBe("disabled");
    expect(disablePushNotificationsAction).toHaveBeenCalledTimes(1);
  });

  it("a future remount never auto-restores after an explicit disable, even with permission still granted", async () => {
    const { result, unmount } = await enableFirst();
    await act(async () => {
      await result.current.disable();
    });
    expect(readPushPreference("user-a")).toBe("disabled");
    unmount();

    // Fresh mount, same device/browser: permission is still "granted" (disable
    // never revokes OS-level permission) and the browser subscription is gone
    // (disable's own unsubscribe already ran) -- exactly the state a real
    // remount after disable would find.
    removeBrowserPushEnvironment();
    installBrowserPushEnvironment({ existingSubscription: null, permission: "granted" });
    enablePushNotificationsAction.mockClear();

    const { result: fresh } = renderHook(() => usePushSubscription("user-a"));
    await waitFor(() => expect(fresh.current.state).toBe("not_enabled"));
    expect(enablePushNotificationsAction).not.toHaveBeenCalled();
  });
});

describe("usePushSubscription — account switch: A -> logout -> B (spec D)", () => {
  it("B never inherits A's enabled preference, and a leftover browser subscription from A is never backfilled to B", async () => {
    markPushPreferenceEnabled("user-a");
    const leftover = new FakePushSubscription("https://push.example/from-user-a");
    installBrowserPushEnvironment({ existingSubscription: leftover, permission: "granted" });
    // B's own authenticated session does not recognize A's endpoint as B's.
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });

    const { result } = renderHook(() => usePushSubscription("user-b"));

    await waitFor(() => expect(result.current.state).toBe("not_enabled"));
    expect(readPushPreference("user-b")).toBeNull();
    // A's own preference is untouched by B's session.
    expect(readPushPreference("user-a")).toBe("enabled");
  });
});

describe("usePushSubscription — A -> logout -> B -> logout -> A (spec E)", () => {
  it("A's saved preference survives, and permission already granted reconnects automatically with no permission prompt", async () => {
    markPushPreferenceEnabled("user-a");
    // Both logouts already unsubscribed the browser -- no local subscription
    // left, but the OS-level permission grant persists across accounts.
    const env = installBrowserPushEnvironment({ existingSubscription: null, permission: "granted" });

    const { result } = renderHook(() => usePushSubscription("user-a"));

    await waitFor(() => expect(result.current.state).toBe("enabled"));
    expect(env.requestPermission).not.toHaveBeenCalled();
    expect(env.pushManager.subscribe).toHaveBeenCalledTimes(1);
    expect(enablePushNotificationsAction).toHaveBeenCalledTimes(1);
  });
});

describe("usePushSubscription — saved enabled + permission default (spec F)", () => {
  it("never prompts and never auto-subscribes; remains not_enabled", async () => {
    markPushPreferenceEnabled("user-a");
    const env = installBrowserPushEnvironment({ existingSubscription: null, permission: "default" });

    const { result } = renderHook(() => usePushSubscription("user-a"));

    await waitFor(() => expect(result.current.state).toBe("not_enabled"));
    expect(env.requestPermission).not.toHaveBeenCalled();
    expect(env.pushManager.subscribe).not.toHaveBeenCalled();
    expect(enablePushNotificationsAction).not.toHaveBeenCalled();
  });
});

describe("usePushSubscription — saved enabled + permission denied (spec G)", () => {
  it("shows the denied state and never attempts a restore", async () => {
    markPushPreferenceEnabled("user-a");
    installBrowserPushEnvironment({ existingSubscription: null, permission: "denied" });

    const { result } = renderHook(() => usePushSubscription("user-a"));

    await waitFor(() => expect(result.current.state).toBe("permission_denied"));
    expect(getPushSubscriptionStatusAction).not.toHaveBeenCalled();
    expect(enablePushNotificationsAction).not.toHaveBeenCalled();
  });
});

describe("usePushSubscription — legacy subscriber migration (spec H)", () => {
  it("backfills the preference to enabled once the server confirms the existing endpoint belongs to the current user", async () => {
    const existing = new FakePushSubscription("https://push.example/legacy");
    installBrowserPushEnvironment({ existingSubscription: existing, permission: "granted" });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: true });
    expect(readPushPreference("user-a")).toBeNull();

    const { result } = renderHook(() => usePushSubscription("user-a"));

    await waitFor(() => expect(result.current.state).toBe("enabled"));
    expect(readPushPreference("user-a")).toBe("enabled");
  });

  it("never backfills when the server does not confirm ownership, even though a local subscription exists", async () => {
    const existing = new FakePushSubscription("https://push.example/not-mine");
    installBrowserPushEnvironment({ existingSubscription: existing, permission: "granted" });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });

    const { result } = renderHook(() => usePushSubscription("user-a"));

    await waitFor(() => expect(result.current.state).toBe("not_enabled"));
    expect(readPushPreference("user-a")).toBeNull();
  });
});

describe("usePushSubscription — userId changes while mounted (spec I)", () => {
  it("never reuses the old user's enabled state; the new user is independently rechecked", async () => {
    const subA = new FakePushSubscription("https://push.example/user-a-device");
    installBrowserPushEnvironment({ existingSubscription: subA, permission: "granted" });
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: true });

    const { result, rerender } = renderHook(({ userId }) => usePushSubscription(userId), {
      initialProps: { userId: "user-a" },
    });
    await waitFor(() => expect(result.current.state).toBe("enabled"));

    // The same device/browser now acts on behalf of a DIFFERENT
    // authenticated user -- the leftover subscription no longer resolves
    // as this user's on the server, and B has no saved preference either.
    getPushSubscriptionStatusAction.mockResolvedValue({ subscribed: false });
    rerender({ userId: "user-b" });

    await waitFor(() => expect(result.current.state).toBe("not_enabled"));
    expect(readPushPreference("user-b")).toBeNull();
    // A's own preference (legitimately legacy-migrated to "enabled" during
    // the FIRST render, while this instance was still checking on A's
    // behalf) is untouched by B's later, independent check -- B's session
    // reporting "not subscribed" must never rewrite A's own stored value.
    expect(readPushPreference("user-a")).toBe("enabled");
  });
});
