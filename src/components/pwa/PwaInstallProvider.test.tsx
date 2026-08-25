import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
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
  it("never throws, and reports the conservative 'ordinary browser tab' default -- isReady: true since there is no pending detection to wait for", async () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isReady).toBe(true);
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
    expect(result.current.isReady).toBe(true);
    expect(result.current.isStandalone).toBe(true);
  });

  it("reflects navigator.standalone (iOS) at mount", () => {
    installMatchMediaStub(false);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    const { result } = renderHook(() => usePwaInstall(), { wrapper });
    expect(result.current.isReady).toBe(true);
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

// ---------------------------------------------------------------------------
// SSR/hydration safety -- the actual bug this describe block regression-
// tests: `isStandalone`/`isIos` used to be computed with
// `useState(() => isStandaloneDisplayMode())`, i.e. synchronously DURING
// render. That function call also runs again for the client's first
// (pre-hydration) render pass, where `window`/`navigator` already exist --
// so on an iPhone/iPad, or a tab already running standalone, that call
// could return `true` on the client while the server-rendered markup
// assumed `false`, which is exactly the shape of a hydration mismatch React
// warns (or, in stricter cases, errors) about. `renderHook`/`render` from
// Testing Library render straight into a detached client-only container --
// there is no real server-rendered markup for React to reconcile against at
// all, so they cannot exercise this class of bug either way. The tests
// below instead do the two real steps: `renderToStaticMarkup` (an actual
// server render, using the SAME `getServerSnapshot` codepath a real
// `next build`/SSR request would use) followed by `hydrateRoot` against
// that markup (the same API Next.js itself uses on the client) -- and
// assert React never logs a hydration-mismatch `console.error` while doing
// so, using a real DOM attribute tied to the detected state as the signal
// (see `Capture` below) rather than inspecting a JS variable, which React
// can update purely internally without that being visible to any
// hydration-correctness check.
// ---------------------------------------------------------------------------

describe("PwaInstallProvider — SSR/hydration safety: hydrating against real server markup never warns, and still resolves correctly", () => {
  let container: HTMLDivElement;
  let root: Root | undefined;

  // A real, DOM-visible signal tied to the state under test -- unlike
  // inspecting `usePwaInstall()`'s return value from a JS variable (which
  // React can update purely internally, invisibly to any assertion that
  // runs after the fact), a mismatched value rendered into an actual DOM
  // attribute during hydration is exactly what React's own hydration
  // mismatch detection reacts to, via `console.error`.
  //
  // Manually verified (not asserted here) that this describe block's FIRST
  // test -- the server markup itself must always be the deterministic
  // default -- genuinely fails if the SSR-unsafe pattern this PR fixed
  // (`useState(() => isStandaloneDisplayMode())`, computed synchronously
  // during render) is reintroduced. The two `console.error`-spy tests
  // below this one do NOT reliably catch that same regression in THIS test
  // process specifically: jsdom exposes a real `window`/`navigator` even
  // during `renderToStaticMarkup`'s "server" pass, so the old buggy
  // pattern's "server" output already reflects the real (stubbed)
  // environment there too -- there is no genuine server/client
  // disagreement left for React to warn about once jsdom itself has
  // already erased the one true SSR signal (`typeof window === "undefined"`)
  // that would exist on an actual server. They are kept because they still
  // prove something real and independent: hydrating via the actual
  // `hydrateRoot` API against real server markup completes without
  // throwing or warning, AND resolves to the correct final values -- an
  // end-to-end integration check the pure-derivation tests above can't
  // give.
  function Capture() {
    const { isReady, isStandalone, isIos } = usePwaInstall();
    return <span data-ready={String(isReady)} data-standalone={String(isStandalone)} data-ios={String(isIos)} />;
  }

  function tree() {
    return (
      <PwaInstallProvider>
        <Capture />
      </PwaInstallProvider>
    );
  }

  /**
   * Exercises React's REAL hydration code path end to end: `renderToStaticMarkup`
   * first produces the actual server-rendered HTML (`getServerSnapshot` is
   * what `useSyncExternalStore` always uses during real server rendering,
   * per React's own documented contract for that hook -- independent of
   * whatever `window`/`navigator` jsdom happens to expose in this test
   * process), which is then hydrated via `hydrateRoot` -- the same API
   * Next.js itself uses to hydrate a server-rendered page.
   */
  function serverRenderThenHydrate() {
    const html = renderToStaticMarkup(tree());
    container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    act(() => {
      root = hydrateRoot(container, tree());
    });
  }

  function readSpan() {
    const span = container.querySelector("span");
    if (!span) throw new Error("Capture never rendered");
    return {
      ready: span.getAttribute("data-ready"),
      standalone: span.getAttribute("data-standalone"),
      ios: span.getAttribute("data-ios"),
    };
  }

  afterEach(() => {
    if (root) act(() => root!.unmount());
    container?.remove();
  });

  it("the server-rendered markup itself is always the deterministic default, regardless of the real environment", () => {
    installMatchMediaStub(true);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("iPhone");

    const html = renderToStaticMarkup(tree());

    expect(html).toContain('data-ready="false"');
    expect(html).toContain('data-standalone="false"');
    expect(html).toContain('data-ios="false"');
  });

  it("hydrating on an iPhone that is ALREADY standalone in reality never logs a hydration mismatch, and resolves to the real iOS + standalone guidance afterward", async () => {
    installMatchMediaStub(true);
    Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true });
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    );
    vi.spyOn(window.navigator, "platform", "get").mockReturnValue("iPhone");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    serverRenderThenHydrate();
    await act(async () => {});

    expect(consoleError).not.toHaveBeenCalled();
    expect(readSpan()).toEqual({ ready: "true", standalone: "true", ios: "true" });
  });

  it("hydrating an ordinary (non-iOS, non-standalone) browser tab never logs a hydration mismatch either, and resolves normally", async () => {
    installMatchMediaStub(false);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    serverRenderThenHydrate();
    await act(async () => {});

    expect(consoleError).not.toHaveBeenCalled();
    expect(readSpan()).toEqual({ ready: "true", standalone: "false", ios: "false" });
  });
});
