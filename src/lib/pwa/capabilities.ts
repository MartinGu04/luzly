/**
 * Pure feature detection for the PWA/future-Push surface (PR #28) -- every
 * check is "does this exact API exist on this exact object", never a
 * User-Agent/browser-name guess, so it stays correct as browser support
 * changes shape over time. Safe to import from anywhere (server or
 * client): every function guards for a missing `window`/`navigator`
 * first, so calling one during SSR simply reports "unsupported" instead
 * of throwing.
 *
 * Deliberately does NOT request permission or register anything -- this
 * is read-only detection only, for a future notification opt-in UI to
 * decide what it can even offer. See `components/pwa` for the actual
 * Service Worker registration.
 */

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function supportsServiceWorker(): boolean {
  return isBrowser() && "serviceWorker" in navigator;
}

export function supportsPushManager(): boolean {
  return isBrowser() && "PushManager" in window;
}

export function supportsNotifications(): boolean {
  return isBrowser() && "Notification" in window;
}

export interface PwaCapabilities {
  serviceWorker: boolean;
  pushManager: boolean;
  notifications: boolean;
}

/** All three checks combined -- what a future Push opt-in UI would gate on. */
export function getPwaCapabilities(): PwaCapabilities {
  return {
    serviceWorker: supportsServiceWorker(),
    pushManager: supportsPushManager(),
    notifications: supportsNotifications(),
  };
}
