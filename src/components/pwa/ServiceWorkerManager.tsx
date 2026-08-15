"use client";

import { useEffect, useRef, useState } from "react";
import { supportsServiceWorker } from "@/lib/pwa/capabilities";
import { UpdateNotice } from "./UpdateNotice";

const SERVICE_WORKER_URL = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";
/**
 * A client-side route change (Next `<Link>`/`router.push`) never triggers
 * the browser's own periodic Service Worker update check -- only a real
 * top-level navigation does. Re-checking on tab refocus fills that gap;
 * this floor just keeps it from firing on every rapid focus/blur.
 */
const UPDATE_CHECK_MIN_INTERVAL_MS = 60_000;

/**
 * Registers the first-party Service Worker exactly once and drives the
 * user-controlled "new version available" banner (see `UpdateNotice`).
 * Mounted once at the true application root (`app/layout.tsx`), so it
 * covers /login and /auth/callback too and never re-registers on
 * client-side navigation -- the root layout persists across route
 * changes, only its children swap.
 *
 * Feature-detected end to end: renders nothing and never touches
 * `navigator.serviceWorker` at all in a browser without support (or
 * during SSR). A failed `register()` call is swallowed -- this must
 * never be able to break the rest of the app.
 *
 * Deliberately never requests notification permission or does anything
 * push-subscription related -- that is explicit user opt-in UI that
 * belongs to a future Push Notifications PR (see `lib/pwa/README`).
 *
 * Update detection: a worker reaching the "installed" state only counts
 * as an available UPDATE (not the very first install) when this page is
 * already controlled by a previous worker -- `navigator.serviceWorker
 * .controller` is null on a first-ever install. Accepting the update
 * posts "SKIP_WAITING" to the waiting worker; the actual one-time reload
 * happens from the "controllerchange" event once the new worker genuinely
 * takes control, never optimistically before that.
 */
export function ServiceWorkerManager() {
  const [updateReady, setUpdateReady] = useState(false);
  const [activating, setActivating] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const hasRegisteredRef = useRef(false);

  useEffect(() => {
    if (!supportsServiceWorker()) return;
    if (hasRegisteredRef.current) return;
    hasRegisteredRef.current = true;

    let cancelled = false;
    let registration: ServiceWorkerRegistration | null = null;
    let lastUpdateCheckAt = 0;

    function presentIfRealUpdate(worker: ServiceWorker | null) {
      if (!worker || !navigator.serviceWorker.controller) return;
      if (waitingWorkerRef.current === worker) return;
      waitingWorkerRef.current = worker;
      setUpdateReady(true);
    }

    function handleUpdateFound() {
      const installing = registration?.installing ?? null;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") presentIfRealUpdate(installing);
      });
    }

    async function register() {
      try {
        registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
          scope: SERVICE_WORKER_SCOPE,
          updateViaCache: "none",
        });
      } catch {
        return;
      }
      if (cancelled || !registration) return;

      presentIfRealUpdate(registration.waiting);
      registration.addEventListener("updatefound", handleUpdateFound);
    }

    register();

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible" || !registration) return;
      const now = Date.now();
      if (now - lastUpdateCheckAt < UPDATE_CHECK_MIN_INTERVAL_MS) return;
      lastUpdateCheckAt = now;
      registration.update().catch(() => {});
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    let reloadedOnce = false;
    function handleControllerChange() {
      if (reloadedOnce) return;
      reloadedOnce = true;
      window.location.reload();
    }
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      registration?.removeEventListener("updatefound", handleUpdateFound);
    };
  }, []);

  function handleUpdateNow() {
    setActivating(true);
    waitingWorkerRef.current?.postMessage("SKIP_WAITING");
  }

  if (!updateReady) return null;
  return <UpdateNotice onUpdate={handleUpdateNow} pending={activating} />;
}
