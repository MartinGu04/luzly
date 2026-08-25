import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { PwaInstallProvider, usePwaInstall } from "./PwaInstallProvider";

class FakeBeforeInstallPromptEvent extends Event {
  readonly platforms = ["web"];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  readonly promptSpy = vi.fn();

  constructor(outcome: "accepted" | "dismissed") {
    super("beforeinstallprompt", { cancelable: true });
    this.userChoice = Promise.resolve({ outcome, platform: "web" });
  }

  prompt(): Promise<void> {
    this.promptSpy();
    return Promise.resolve();
  }
}

function installMatchMediaStub(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<() => void>();
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, handler: () => void) => listeners.add(handler),
    removeEventListener: (_type: string, handler: () => void) => listeners.delete(handler),
  };
  window.matchMedia = vi.fn().mockReturnValue(mediaQueryList);
  return {
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((handler) => handler());
    },
  };
}

function wrapper({ children }: { children: ReactNode }) {
  return <PwaInstallProvider>{children}</PwaInstallProvider>;
}

afterEach(() => {
  // Each test mounts its own `PwaInstallProvider`, which attaches its own
  // `window`-level `beforeinstallprompt`/`appinstalled` listeners -- without
  // unmounting between tests, a later test's synthetic `window.dispatchEvent`
  // would also reach every earlier test's still-mounted instance.
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of a stubbed global.
  delete window.matchMedia;
  delete (window.navigator as { standalone?: boolean }).standalone;
});

describe("PwaInstallProvider — usePwaInstall() outside a provider (safety net)", () => {
  it("never throws, and reports the conservative 'ordinary browser tab' default", async () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isStandalone).toBe(false);
    expect(result.current.canPromptInstall).toBe(false);
    expect(result.current.installCompleted).toBe(false);
    await expect(result.current.promptInstall()).resolves.toBe("unavailable");
  });
});

describe("PwaInstallProvider — standalone detection", () => {
  it("reflects (display-mode: standalone) at mount", () => {
    installMatchMediaStub(true);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.isStandalone).toBe(true);
  });

  it("reflects navigator.standalone (iOS) at mount", () => {
    installMatchMediaStub(false);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.isStandalone).toBe(true);
  });

  it("is not fooled into reporting standalone merely because a browser tab supports Service Worker/Push", () => {
    installMatchMediaStub(false);
    // @ts-expect-error -- simulating a fully Push-capable, non-installed browser tab.
    window.navigator.serviceWorker = {};
    // @ts-expect-error -- test-only stub.
    window.PushManager = function PushManager() {};
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.isStandalone).toBe(false);
    // @ts-expect-error -- test-only cleanup.
    delete window.navigator.serviceWorker;
    // @ts-expect-error -- test-only cleanup.
    delete window.PushManager;
  });

  it("updates live when the display-mode media query changes", () => {
    const media = installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.isStandalone).toBe(false);

    act(() => media.setMatches(true));
    expect(result.current.isStandalone).toBe(true);
  });
});

describe("PwaInstallProvider — beforeinstallprompt captured early", () => {
  it("preventDefault() is called on the captured event", () => {
    installMatchMediaStub(false);
    renderHook(() => usePwaInstall(), { wrapper });

    const event = new FakeBeforeInstallPromptEvent("accepted");
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");

    act(() => window.dispatchEvent(event));

    expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
  });

  it("capturing the event alone never calls its native prompt()", () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    const event = new FakeBeforeInstallPromptEvent("accepted");
    act(() => window.dispatchEvent(event));

    expect(result.current.canPromptInstall).toBe(true);
    expect(event.promptSpy).not.toHaveBeenCalled();
  });

  it("exposes canPromptInstall as soon as the event is captured -- the listener is live at mount, not attached lazily on some later user action", () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.canPromptInstall).toBe(false);

    act(() => window.dispatchEvent(new FakeBeforeInstallPromptEvent("accepted")));

    expect(result.current.canPromptInstall).toBe(true);
  });
});

describe("PwaInstallProvider — promptInstall()", () => {
  it("calls the deferred event's prompt() exactly once", async () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    const event = new FakeBeforeInstallPromptEvent("accepted");
    act(() => window.dispatchEvent(event));

    await act(async () => {
      await result.current.promptInstall();
    });

    expect(event.promptSpy).toHaveBeenCalledTimes(1);
  });

  it("an accepted choice resolves 'accepted' and consumes the prompt (no dead re-offer this session)", async () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    act(() => window.dispatchEvent(new FakeBeforeInstallPromptEvent("accepted")));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe("accepted");
    expect(result.current.canPromptInstall).toBe(false);
    // Accepting the native prompt does not, by itself, claim the install
    // completed -- only a genuine `appinstalled` event does that.
    expect(result.current.installCompleted).toBe(false);
  });

  it("a dismissed choice resolves 'dismissed' and never claims success", async () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    act(() => window.dispatchEvent(new FakeBeforeInstallPromptEvent("dismissed")));

    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });

    expect(outcome).toBe("dismissed");
    expect(result.current.installCompleted).toBe(false);
    expect(result.current.canPromptInstall).toBe(false);
  });

  it("resolves 'unavailable' without throwing when no event was ever captured", async () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    await expect(result.current.promptInstall()).resolves.toBe("unavailable");
  });

  it("a second call after the event was already consumed resolves 'unavailable', never re-calling prompt()", async () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    const event = new FakeBeforeInstallPromptEvent("accepted");
    act(() => window.dispatchEvent(event));

    await act(async () => {
      await result.current.promptInstall();
    });
    await expect(result.current.promptInstall()).resolves.toBe("unavailable");
    expect(event.promptSpy).toHaveBeenCalledTimes(1);
  });
});

describe("PwaInstallProvider — appinstalled", () => {
  it("updates installCompleted to true", () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    act(() => window.dispatchEvent(new Event("appinstalled")));

    expect(result.current.installCompleted).toBe(true);
  });

  it("stops offering the native install button for the rest of the session, even if a stray captured event remained", () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    act(() => window.dispatchEvent(new FakeBeforeInstallPromptEvent("accepted")));
    expect(result.current.canPromptInstall).toBe(true);

    act(() => window.dispatchEvent(new Event("appinstalled")));

    expect(result.current.canPromptInstall).toBe(false);
  });

  it("does NOT by itself make the current tab standalone -- isStandalone stays false unless the display-mode media query independently says otherwise", () => {
    installMatchMediaStub(false);
    const { result } = renderHook(() => usePwaInstall(), { wrapper });

    act(() => window.dispatchEvent(new Event("appinstalled")));

    expect(result.current.installCompleted).toBe(true);
    expect(result.current.isStandalone).toBe(false);
  });
});
