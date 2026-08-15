import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentPushEndpoint, unsubscribeCurrentPushSubscription } from "./browserSubscription";

function installFakeServiceWorker(subscription: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
  Object.defineProperty(window.navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn().mockResolvedValue({
        pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
      }),
    },
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // @ts-expect-error -- test-only cleanup.
  delete window.navigator.serviceWorker;
});

describe("getCurrentPushEndpoint", () => {
  it("returns null (never throws) when Service Workers are unsupported", async () => {
    await expect(getCurrentPushEndpoint()).resolves.toBeNull();
  });

  it("returns null when no registration exists", async () => {
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { getRegistration: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    });
    await expect(getCurrentPushEndpoint()).resolves.toBeNull();
  });

  it("returns null when registered but no subscription exists", async () => {
    installFakeServiceWorker(null);
    await expect(getCurrentPushEndpoint()).resolves.toBeNull();
  });

  it("returns the endpoint when a subscription exists", async () => {
    installFakeServiceWorker({ endpoint: "https://push.example/e1", unsubscribe: async () => true });
    await expect(getCurrentPushEndpoint()).resolves.toBe("https://push.example/e1");
  });

  it("never throws even if the underlying API rejects", async () => {
    Object.defineProperty(window.navigator, "serviceWorker", {
      value: { getRegistration: vi.fn().mockRejectedValue(new Error("boom")) },
      configurable: true,
      writable: true,
    });
    await expect(getCurrentPushEndpoint()).resolves.toBeNull();
  });
});

describe("unsubscribeCurrentPushSubscription", () => {
  it("does nothing (never throws) when Service Workers are unsupported", async () => {
    await expect(unsubscribeCurrentPushSubscription()).resolves.toBeUndefined();
  });

  it("calls unsubscribe() on the existing subscription", async () => {
    const unsubscribe = vi.fn().mockResolvedValue(true);
    installFakeServiceWorker({ endpoint: "https://push.example/e1", unsubscribe });
    await unsubscribeCurrentPushSubscription();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is no existing subscription", async () => {
    installFakeServiceWorker(null);
    await expect(unsubscribeCurrentPushSubscription()).resolves.toBeUndefined();
  });

  it("never throws even if unsubscribe() itself rejects", async () => {
    const unsubscribe = vi.fn().mockRejectedValue(new Error("network error"));
    installFakeServiceWorker({ endpoint: "https://push.example/e1", unsubscribe });
    await expect(unsubscribeCurrentPushSubscription()).resolves.toBeUndefined();
  });
});
