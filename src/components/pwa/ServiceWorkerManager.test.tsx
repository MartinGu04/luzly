import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { ServiceWorkerManager } from "./ServiceWorkerManager";

class FakeEventTarget {
  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  addEventListener(type: string, handler: (event?: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, handler: (event?: unknown) => void) {
    this.listeners.get(type)?.delete(handler);
  }
}

class FakeRegistration extends FakeEventTarget {
  installing: unknown = null;
  waiting: unknown = null;
}

function installFakeServiceWorkerEnvironment() {
  const registerMock = vi.fn();
  const container = new FakeEventTarget() as FakeEventTarget & {
    register: typeof registerMock;
    controller: unknown;
  };
  container.register = registerMock;
  container.controller = null;

  Object.defineProperty(window.navigator, "serviceWorker", {
    value: container,
    configurable: true,
    writable: true,
  });

  return { container, registerMock };
}

function removeServiceWorkerSupport() {
  // @ts-expect-error -- simulating an unsupported browser for this test only.
  delete window.navigator.serviceWorker;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  removeServiceWorkerSupport();
});

describe("ServiceWorkerManager — unsupported environment", () => {
  it("renders nothing and never calls register() when Service Workers are unsupported", async () => {
    removeServiceWorkerSupport();
    const { container } = render(<ServiceWorkerManager />);
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it("never throws when mounted in an unsupported environment", () => {
    removeServiceWorkerSupport();
    expect(() => render(<ServiceWorkerManager />)).not.toThrow();
  });
});

describe("ServiceWorkerManager — registration", () => {
  it("registers the root-scoped worker with updateViaCache: 'none', exactly once", async () => {
    const { registerMock } = installFakeServiceWorkerEnvironment();
    registerMock.mockResolvedValue(new FakeRegistration());

    render(<ServiceWorkerManager />);
    await act(async () => {});

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("a failed registration is swallowed -- no thrown error", async () => {
    const { registerMock } = installFakeServiceWorkerEnvironment();
    registerMock.mockRejectedValue(new Error("registration failed"));

    const { container } = render(<ServiceWorkerManager />);
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });

  it("never calls Notification.requestPermission on mount", async () => {
    const { registerMock } = installFakeServiceWorkerEnvironment();
    registerMock.mockResolvedValue(new FakeRegistration());
    const requestPermission = vi.fn();
    // @ts-expect-error -- stubbing a minimal Notification for this assertion only.
    window.Notification = { requestPermission };

    render(<ServiceWorkerManager />);
    await act(async () => {});

    expect(requestPermission).not.toHaveBeenCalled();
    // @ts-expect-error -- test-only cleanup.
    delete window.Notification;
  });

  it("renders nothing -- there is no update banner or any other UI", async () => {
    const { registerMock } = installFakeServiceWorkerEnvironment();
    registerMock.mockResolvedValue(new FakeRegistration());

    const { container } = render(<ServiceWorkerManager />);
    await act(async () => {});

    expect(container).toBeEmptyDOMElement();
  });
});
