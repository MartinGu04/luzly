import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PwaInstallProvider } from "@/components/pwa/PwaInstallProvider";
import { SetupSection } from "./SetupSection";

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

const TEST_USER = "user-setup-1";

/** Same stub shape `PwaInstallProvider.test.tsx` already establishes for the `(display-mode: standalone)` media query -- controls `isStandalone`. */
function installDisplayModeStub(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(display-mode: standalone)" ? standalone : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

class FakePushSubscription {
  endpoint = "https://push.example/endpoint";
  unsubscribe = vi.fn().mockResolvedValue(true);
  toJSON() {
    return { endpoint: this.endpoint, keys: { p256dh: "p", auth: "a" }, expirationTime: null };
  }
}

/** Same browser-push-environment stub shape `NotificationBell.test.tsx` already establishes. `subscribed` controls whether the server confirms an existing subscription for the current user (-> push state "enabled"). */
function installBrowserPushEnvironment({ subscribed }: { subscribed: boolean }) {
  const subscription = subscribed ? new FakePushSubscription() : null;
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(subscription),
    subscribe: vi.fn().mockResolvedValue(new FakePushSubscription()),
  };
  const registration = { pushManager };

  // @ts-expect-error -- test-only global stubs simulating a supporting browser.
  window.PushManager = function PushManager() {};
  // @ts-expect-error -- test-only global stubs simulating a supporting browser.
  window.Notification = { permission: subscribed ? "granted" : "default", requestPermission: vi.fn().mockResolvedValue("granted") };

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

  getPushSubscriptionStatusAction.mockResolvedValue({ subscribed });
}

function removeBrowserPushEnvironment() {
  // @ts-expect-error -- test-only cleanup.
  delete window.PushManager;
  // @ts-expect-error -- test-only cleanup.
  delete window.Notification;
  // @ts-expect-error -- test-only cleanup.
  delete window.navigator.serviceWorker;
}

async function renderSetup(props: { userId?: string; calendarSyncEnabled: boolean }, { standalone = false }: { standalone?: boolean } = {}) {
  installDisplayModeStub(standalone);
  const result = render(
    <PwaInstallProvider>
      <SetupSection {...props} />
    </PwaInstallProvider>,
  );
  await act(async () => {});
  return result;
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  removeBrowserPushEnvironment();
  // @ts-expect-error -- test-only cleanup of a stubbed global.
  delete window.matchMedia;
  vi.restoreAllMocks();
});

describe("SetupSection — hidden for an already-completed/veteran user", () => {
  it("renders nothing when install is standalone, push is enabled, and calendar sync is on", async () => {
    installBrowserPushEnvironment({ subscribed: true });
    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: true }, { standalone: true });
    expect(screen.queryByTestId("setup-section")).toBeNull();
    expect(screen.queryByText("השלמת הגדרה")).toBeNull();
  });
});

describe("SetupSection — shows only missing/relevant actions", () => {
  it("shows only the calendar item when install and push are already done", async () => {
    installBrowserPushEnvironment({ subscribed: true });
    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: true });

    expect(screen.getByTestId("setup-section")).toBeInTheDocument();
    expect(screen.getByText("סנכרון יומן")).toBeInTheDocument();
    expect(screen.queryByText("הוספה למסך הבית")).toBeNull();
    expect(screen.queryByText("הפעלת התראות")).toBeNull();
  });

  it("shows install + calendar items, never notifications, when push is unsupported (no browser Push env)", async () => {
    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: false });

    expect(screen.getByText("הוספה למסך הבית")).toBeInTheDocument();
    expect(screen.getByText("סנכרון יומן")).toBeInTheDocument();
    expect(screen.queryByText("הפעלת התראות")).toBeNull();
  });

  it("shows the notifications item when push is supported but not yet enabled", async () => {
    installBrowserPushEnvironment({ subscribed: false });
    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: true }, { standalone: true });

    expect(screen.getByText("הפעלת התראות")).toBeInTheDocument();
    expect(screen.queryByText("הוספה למסך הבית")).toBeNull();
    expect(screen.queryByText("סנכרון יומן")).toBeNull();
  });
});

describe("SetupSection — skip persistence", () => {
  it("skipping an item removes it immediately", async () => {
    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: true });
    expect(screen.getByText("סנכרון יומן")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "דלג על סנכרון יומן" }));
    expect(screen.queryByText("סנכרון יומן")).toBeNull();
  });

  it("a skipped item never resurfaces on a later render for the same user", async () => {
    const first = await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: true });
    fireEvent.click(screen.getByRole("button", { name: "דלג על סנכרון יומן" }));
    first.unmount();

    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: true });
    expect(screen.queryByText("סנכרון יומן")).toBeNull();
  });

  it("skipping is isolated per user -- a different user still sees the item", async () => {
    const first = await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: true });
    fireEvent.click(screen.getByRole("button", { name: "דלג על סנכרון יומן" }));
    first.unmount();

    await renderSetup({ userId: "user-setup-2", calendarSyncEnabled: false }, { standalone: true });
    expect(screen.getByText("סנכרון יומן")).toBeInTheDocument();
  });
});

describe("SetupSection — all-complete/all-skipped state hides the section", () => {
  it("disappears once every item is either complete or explicitly skipped", async () => {
    installBrowserPushEnvironment({ subscribed: true });
    await renderSetup({ userId: TEST_USER, calendarSyncEnabled: false }, { standalone: true });

    expect(screen.getByTestId("setup-section")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "דלג על סנכרון יומן" }));

    expect(screen.queryByTestId("setup-section")).toBeNull();
  });
});
