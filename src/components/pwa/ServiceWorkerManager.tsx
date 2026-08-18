"use client";

import { useEffect, useRef } from "react";
import { supportsServiceWorker } from "@/lib/pwa/capabilities";

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";

/**
 * Registers the first-party Service Worker exactly once. Mounted once at
 * the true application root (`app/layout.tsx`), so it covers /login and
 * /auth/callback too and never re-registers on client-side navigation --
 * the root layout persists across route changes, only its children swap.
 *
 * Feature-detected end to end: does nothing and never touches
 * `navigator.serviceWorker` at all in a browser without support (or
 * during SSR). A failed `register()` call is swallowed -- this must never
 * be able to break the rest of the app.
 *
 * Deliberately never requests notification permission or does anything
 * push-subscription related -- that is explicit user opt-in UI living in
 * `components/pwa/usePushSubscription.ts`.
 *
 * No user-facing "new version available" flow. A previous version drove a
 * manual "Update now" banner (posting a "SKIP_WAITING" message to the
 * waiting worker, then waiting for `controllerchange` to reload), but its
 * "wait for controllerchange" step could get stuck in a pending state
 * that never resolved. Rather than patch that spinner, the banner and its
 * update-detection wiring -- and the now-unused `sw.js` message handler
 * behind it -- were removed outright: a waiting worker now simply
 * activates the normal way the browser already handles this, once every
 * tab/client still controlled by the old worker has closed. There is no
 * toast, no manual trigger, and no new automatic reload in its place.
 */
export function ServiceWorkerManager() {
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    if (!supportsServiceWorker()) return;
    if (hasRegisteredRef.current) return;
    hasRegisteredRef.current = true;

    navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE, updateViaCache: "none" }).catch(() => {});
  }, []);

  return null;
}
