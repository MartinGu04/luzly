import "client-only";

/**
 * Reads the current browser-level `PushSubscription` endpoint, if any --
 * used by the sign-out flow (PR #29) to tell the server which device's
 * row to best-effort clean up. `getRegistration()` (not
 * `navigator.serviceWorker.ready`) so this resolves immediately with
 * `null` when nothing is registered/subscribed, instead of hanging.
 * Never throws -- a browser without Service Worker support, or any
 * failure along the way, simply resolves to `null`.
 */
export async function getCurrentPushEndpoint(): Promise<string | null> {
  try {
    if (!("serviceWorker" in navigator)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    const subscription = await registration.pushManager.getSubscription();
    return subscription?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort local unsubscribe of the current browser's `PushSubscription`
 * -- used alongside the server-side row deletion on sign-out, so a shared
 * device has no leftover local subscription object either (the "cleanest
 * security model" this PR's logout requirement asks for). Never throws.
 */
export async function unsubscribeCurrentPushSubscription(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const subscription = await registration.pushManager.getSubscription();
    await subscription?.unsubscribe();
  } catch {
    // Best-effort only -- logout must never depend on this succeeding.
  }
}
