"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { type BeforeInstallPromptEvent, isIosInstallableDevice, isStandaloneDisplayMode } from "@/lib/pwa/installState";

/**
 * `useSyncExternalStore` plumbing for the three browser-only, render-unsafe
 * reads below (`isReady`/`isStandalone`/`isIos`) -- see the provider's own
 * docstring for why these can never be computed with a plain
 * `useState(() => ...)` initializer or set from inside a `useEffect` body.
 * `getServerSnapshot` is what guarantees the server render and the
 * client's FIRST (pre-hydration) render agree (always the conservative,
 * deterministic value); React itself then reconciles to the real
 * `getSnapshot()` value immediately once hydration completes -- the
 * React-native mechanism for exactly this "browser-only value that must
 * not differ between server and first client render" problem, so none of
 * this needs a manual mounted-flag effect.
 */
function subscribeToNothing(): () => void {
  return () => {};
}

function alwaysReady(): boolean {
  return true;
}

function notYetReady(): boolean {
  return false;
}

function notStandaloneOnFirstRender(): boolean {
  return false;
}

function subscribeToDisplayModeChange(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener("change", onStoreChange);
  return () => mediaQuery.removeEventListener("change", onStoreChange);
}

function notIosOnFirstRender(): boolean {
  return false;
}

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export interface PwaInstallContextValue {
  /**
   * Whether the one-time browser-environment detection below (standalone
   * display mode + iOS/iPad) has run yet. `false` for the server render
   * AND for the client's first (pre-hydration) render -- see this
   * component's own docstring for why `isStandalone`/`isIos` cannot be
   * trusted before this flips to `true`. Consumers (`NotificationBell`'s
   * onboarding card, its Settings install section) must treat `isReady
   * === false` as "detection not finished yet" and render no install/
   * onboarding guidance at all, rather than a value that might visibly
   * flip immediately after hydration.
   */
  isReady: boolean;
  /** Real runtime standalone/installed detection for THIS window -- see `installState.ts`. Live-updated via the `display-mode` media query listener below, not just read once on mount. Only meaningful once `isReady` is `true`. */
  isStandalone: boolean;
  /** A captured, not-yet-consumed native `beforeinstallprompt` event is available -- i.e. `promptInstall()` can actually do something right now. */
  canPromptInstall: boolean;
  /** iPhone/iPad manual-install environment -- for choosing INSTRUCTIONS only, never Push capability (unchanged: still decided by `lib/pwa/capabilities.ts`). Static for the life of a session (a device's platform does not change mid-session) once detected. Only meaningful once `isReady` is `true`. */
  isIos: boolean;
  /** `appinstalled` fired during this browser session. Installing does NOT necessarily make the current tab itself standalone -- see `promptInstall`'s docstring. */
  installCompleted: boolean;
  /**
   * Prompts the native install UI from the captured `beforeinstallprompt`
   * event. Must only ever be invoked from a real user click (a stale/no
   * longer "activated" gesture is rejected by the browser itself, same as
   * calling it with no captured event at all). Consumes the event
   * immediately -- each `beforeinstallprompt` instance can only ever be
   * prompted once -- and never throws: a browser rejection (e.g. because
   * the event's activation window already expired) resolves to
   * `"unavailable"` rather than rejecting.
   */
  promptInstall: () => Promise<InstallPromptOutcome>;
}

/**
 * Fallback used whenever `usePwaInstall()` is read outside a
 * `PwaInstallProvider` -- the real app always mounts one at the root
 * (`app/layout.tsx`), so this only matters for a stray render in tests
 * (many existing `NotificationBell` tests render it bare, with no
 * wrapper). `isReady: true` here (unlike the real provider's initial
 * `false`) because there is no pending detection to wait for in the first
 * place -- this is a static, final answer, not a snapshot mid-detection.
 * Reports the truthful, conservative "ordinary non-installed browser tab,
 * no install prompt available" state -- never a fabricated "already
 * installed" or "prompt ready" claim -- rather than throwing and taking
 * down every such render.
 */
const DEFAULT_PWA_INSTALL_STATE: PwaInstallContextValue = {
  isReady: true,
  isStandalone: false,
  canPromptInstall: false,
  isIos: false,
  installCompleted: false,
  promptInstall: async () => "unavailable",
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

/**
 * Captures PWA install state at the application root (mounted in
 * `app/layout.tsx`, alongside `ServiceWorkerManager`). `beforeinstallprompt`
 * can fire at any point after the page loads -- often well before the user
 * ever opens the notification bell -- so this provider's listener attaches
 * from an effect that runs on THIS component's own mount, at the true
 * application root, rather than lazily inside some deeper component that
 * might not mount until much later (e.g. only once the bell itself is
 * opened). That is a real, meaningful improvement over a bell-only
 * listener, but it is not an absolute guarantee: a React effect only ever
 * runs after this render has already committed/hydrated, so it cannot
 * observe an event the browser dispatched before that commit finished.
 * Nothing here uses an inline pre-hydration script or any other
 * earlier-than-React capture mechanism, so that theoretical pre-hydration
 * window is not claimed to be closed -- only that this is the earliest a
 * React effect in this app's client tree can attach.
 *
 * `isStandalone`/`isIos` deliberately never get computed synchronously
 * during render (e.g. `useState(() => isStandaloneDisplayMode())`). That
 * would read real DOM/`navigator` state during the render call itself --
 * which for a client component also runs once for the SERVER-rendered
 * HTML (where `window`/`navigator` are absent, so it degrades to `false`)
 * and again for the CLIENT's first hydration render, where those globals
 * already exist. On an iPhone/iPad, or a browser tab already running as an
 * installed standalone PWA, that second call could return `true` where the
 * first returned `false` -- a real value disagreement between the
 * server-rendered markup and the client's very first render pass, exactly
 * the shape of a hydration mismatch. Both are instead sourced via
 * `useSyncExternalStore` (see the module-level snapshot/subscribe
 * functions above): its `getServerSnapshot` guarantees the server render
 * and the client's first render agree on the same conservative default,
 * and React's own hydration reconciliation -- not a manually-written
 * `useEffect`/`setState` pair -- is what updates them to the real value
 * immediately afterward. `isReady` (also `useSyncExternalStore`-backed)
 * is what lets a consumer avoid painting a value that might immediately
 * change right after hydration.
 *
 * Deliberately its own provider rather than folded into
 * `ServiceWorkerManager`: install-state is a distinct concern from Service
 * Worker registration, and keeping them separate keeps each one small and
 * independently testable.
 *
 * Kept completely separate from `usePushSubscription`'s Push state -- this
 * provider knows nothing about Notification permission or Push
 * subscriptions, and never touches either.
 */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const isReady = useSyncExternalStore(subscribeToNothing, alwaysReady, notYetReady);
  const isStandalone = useSyncExternalStore(subscribeToDisplayModeChange, isStandaloneDisplayMode, notStandaloneOnFirstRender);
  const isIos = useSyncExternalStore(subscribeToNothing, isIosInstallableDevice, notIosOnFirstRender);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installCompleted, setInstallCompleted] = useState(false);

  useEffect(() => {
    function handleBeforeInstallPrompt(event: Event) {
      // Suppresses the browser's own default install UI -- this app always
      // drives installation from its own explicit "התקנה" button instead.
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    }
    function handleAppInstalled() {
      setInstallCompleted(true);
      // A consumed-or-not deferred prompt is meaningless once installed --
      // stop offering the native install button in this session either way.
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    if (!deferredPrompt) return "unavailable";
    const event = deferredPrompt;
    // Consumed immediately, before awaiting anything below -- a
    // `beforeinstallprompt` event can only ever be prompted once, and this
    // guarantees a second rapid click can never call `prompt()` twice on
    // the same event.
    setDeferredPrompt(null);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      return choice.outcome;
    } catch {
      return "unavailable";
    }
  }, [deferredPrompt]);

  return (
    <PwaInstallContext.Provider
      value={{
        isReady,
        isStandalone,
        canPromptInstall: deferredPrompt !== null,
        isIos,
        installCompleted,
        promptInstall,
      }}
    >
      {children}
    </PwaInstallContext.Provider>
  );
}

export function usePwaInstall(): PwaInstallContextValue {
  return useContext(PwaInstallContext) ?? DEFAULT_PWA_INSTALL_STATE;
}
