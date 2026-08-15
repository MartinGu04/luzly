import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  dispatch(type: string, event?: unknown) {
    for (const handler of [...(this.listeners.get(type) ?? [])]) handler(event);
  }
}

class FakeWorker extends FakeEventTarget {
  state: string;
  postMessage = vi.fn();

  constructor(state: string) {
    super();
    this.state = state;
  }

  transitionTo(state: string) {
    this.state = state;
    this.dispatch("statechange");
  }
}

class FakeRegistration extends FakeEventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);

  triggerUpdateFound(worker: FakeWorker) {
    this.installing = worker;
    this.dispatch("updatefound");
  }
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

function stubLocationReload(): ReturnType<typeof vi.fn> {
  const reloadSpy = vi.fn();
  const originalLocation = window.location;
  Object.defineProperty(window, "location", {
    value: { ...originalLocation, reload: reloadSpy },
    configurable: true,
    writable: true,
  });
  return reloadSpy;
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

  it("a failed registration is swallowed -- no thrown error, no banner", async () => {
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
});

describe("ServiceWorkerManager — update detection", () => {
  it("does NOT show the update banner on the very first install (no existing controller)", async () => {
    const { container, registerMock } = installFakeServiceWorkerEnvironment();
    container.controller = null; // first-ever install: nothing controls this page yet
    const registration = new FakeRegistration();
    registerMock.mockResolvedValue(registration);

    render(<ServiceWorkerManager />);
    await act(async () => {});

    const installingWorker = new FakeWorker("installing");
    await act(async () => {
      registration.triggerUpdateFound(installingWorker);
      installingWorker.transitionTo("installed");
    });

    expect(screen.queryByText(/גרסה חדשה/)).toBeNull();
  });

  it("shows the update banner once a NEW worker finishes installing while a previous worker already controls the page", async () => {
    const { container, registerMock } = installFakeServiceWorkerEnvironment();
    container.controller = {}; // this page is already controlled -- a real update, not a first install
    const registration = new FakeRegistration();
    registerMock.mockResolvedValue(registration);

    render(<ServiceWorkerManager />);
    await act(async () => {});

    const installingWorker = new FakeWorker("installing");
    await act(async () => {
      registration.triggerUpdateFound(installingWorker);
      installingWorker.transitionTo("installed");
    });

    expect(screen.getByText(/גרסה חדשה/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /עדכון עכשיו/ })).toBeInTheDocument();
  });

  it("shows the banner immediately if a waiting worker already exists at registration time (an update installed in another tab)", async () => {
    const { container, registerMock } = installFakeServiceWorkerEnvironment();
    container.controller = {};
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker("installed");
    registerMock.mockResolvedValue(registration);

    render(<ServiceWorkerManager />);
    await act(async () => {});

    expect(screen.getByText(/גרסה חדשה/)).toBeInTheDocument();
  });

  it("clicking 'עדכון עכשיו' posts SKIP_WAITING to the waiting worker and never reloads before controllerchange fires", async () => {
    const { container, registerMock } = installFakeServiceWorkerEnvironment();
    container.controller = {};
    const registration = new FakeRegistration();
    const waitingWorker = new FakeWorker("installed");
    registration.waiting = waitingWorker;
    registerMock.mockResolvedValue(registration);
    const reloadSpy = stubLocationReload();

    render(<ServiceWorkerManager />);
    await act(async () => {});

    fireEvent.click(screen.getByRole("button", { name: /עדכון עכשיו/ }));

    expect(waitingWorker.postMessage).toHaveBeenCalledWith("SKIP_WAITING");
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("reloads exactly once, only after the new worker actually takes control (controllerchange)", async () => {
    const { container, registerMock } = installFakeServiceWorkerEnvironment();
    container.controller = {};
    const registration = new FakeRegistration();
    const waitingWorker = new FakeWorker("installed");
    registration.waiting = waitingWorker;
    registerMock.mockResolvedValue(registration);
    const reloadSpy = stubLocationReload();

    render(<ServiceWorkerManager />);
    await act(async () => {});
    fireEvent.click(screen.getByRole("button", { name: /עדכון עכשיו/ }));

    await act(async () => {
      container.dispatch("controllerchange");
      container.dispatch("controllerchange"); // a duplicate event must never double-reload
    });

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });
});
