"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { type BeforeInstallPromptEvent, isIosInstallableDevice, isStandaloneDisplayMode } from "@/lib/pwa/installState";

export type InstallPromptOutcome = "accepted" | "dismissed" | "unavailable";

export interface PwaInstallContextValue {
  /** Real runtime standalone/installed detection for THIS window -- see `installState.ts`. Live-updated via the `display-mode` media query listener below, not just read once on mount. */
  isStandalone: boolean;
  /** A captured, not-yet-consumed native `beforeinstallprompt` event is available -- i.e. `promptInstall()` can actually do something right now. */
  canPromptInstall: boolean;
  /** iPhone/iPad manual-install environment -- for choosing INSTRUCTIONS only, never Push capability (unchanged: still decided by `lib/pwa/capabilities.ts`). Static for the life of a session (a device's platform does not change mid-session). */
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
 * wrapper). Reports the truthful, conservative "ordinary non-installed
 * browser tab, no install prompt available" state -- never a fabricated
 * "already installed" or "prompt ready" claim -- rather than throwing and
 * taking down every such render.
 */
const DEFAULT_PWA_INSTALL_STATE: PwaInstallContextValue = {
  isStandalone: false,
  canPromptInstall: false,
  isIos: false,
  installCompleted: false,
  promptInstall: async () => "unavailable",
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

/**
 * Captures PWA install state at the application root (mounted in
 * `app/layout.tsx`, alongside `ServiceWorkerManager`) so `beforeinstallprompt`
 * -- which can fire at any point after the page loads, well before the user
 * ever opens the notification bell -- is never missed by a listener that
 * only gets attached lazily on bell-open. Deliberately its own provider
 * rather than folded into `ServiceWorkerManager`: install-state is a
 * distinct concern from Service Worker registration, and keeping them
 * separate keeps each one small and independently testable.
 *
 * Kept completely separate from `usePushSubscription`'s Push state -- this
 * provider knows nothing about Notification permission or Push
 * subscriptions, and never touches either.
 */
export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [isStandalone, setIsStandalone] = useState(() => isStandaloneDisplayMode());
  const [isIos] = useState(() => isIosInstallableDevice());
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

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(display-mode: standalone)");
    function handleChange() {
      setIsStandalone(isStandaloneDisplayMode());
    }
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
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
