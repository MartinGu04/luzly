"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * While the tab stays visible, revalidate at this cadence. Far longer than
 * the workbook-snapshot cache's own 30s TTL (`lib/sync/workbookSnapshotCache.ts`)
 * -- by the time this fires, that cache has always already expired on its
 * own, so this never forces an extra Google fetch beyond what the cache
 * would naturally need anyway.
 */
const VISIBLE_REFRESH_INTERVAL_MS = 5 * 60_000;

/**
 * Cooldown/dedup window for automatic (non-manual) revalidation. Browser
 * lifecycle events (`visibilitychange`/`focus`/`pageshow`) often fire
 * together on resume -- this coalesces those into a single `router.refresh()`
 * call. It also doubles as the "a refresh is still effectively in flight"
 * guard: the App Router gives no public completion callback for
 * `router.refresh()`, so rather than tracking real completion this simply
 * refuses to start another automatic refresh until a short window after the
 * last one, which also keeps the periodic interval from overlapping a
 * refresh that just started on resume.
 */
const AUTO_REFRESH_COOLDOWN_MS = 5_000;

/**
 * Keeps the app's server-rendered data reasonably fresh without the user
 * ever manually reloading -- revalidates on return-from-background and on a
 * slow periodic cadence while visible. Renders nothing; a tiny, always-
 * mounted controller (see `src/app/(app)/layout.tsx`, mounted the same way
 * `ServiceWorkerManager` sits beside the root layout's children).
 *
 * Every revalidation is exactly `router.refresh()` -- re-rendering the
 * current route's Server Components in place, through the SAME cached
 * workbook-snapshot path (`lib/sync/workbookSnapshotCache.ts`) normal
 * navigation already uses. This deliberately never force-expires that cache
 * the way the manual refresh button's `refreshWorkbookSnapshotAction` does
 * (`revalidateTag(..., { expire: 0 })`) -- automatic revalidation is quiet
 * and cache-friendly, manual refresh is an explicit "I want it now". Never
 * fetches Google Sheets, or anything else, directly.
 *
 * Deliberately does NOT refresh on initial mount -- the server render that
 * produced this page is already fresh; this exists only for long-lived
 * sessions, background/foreground resumes, and periodically-visible tabs.
 */
export function AppRevalidator() {
  const router = useRouter();
  const lastTriggeredAtRef = useRef(0);

  useEffect(() => {
    function requestRevalidate() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastTriggeredAtRef.current < AUTO_REFRESH_COOLDOWN_MS) return;
      lastTriggeredAtRef.current = now;
      router.refresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") requestRevalidate();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", requestRevalidate);
    window.addEventListener("pageshow", requestRevalidate);

    const interval = setInterval(requestRevalidate, VISIBLE_REFRESH_INTERVAL_MS);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", requestRevalidate);
      window.removeEventListener("pageshow", requestRevalidate);
      clearInterval(interval);
    };
  }, [router]);

  return null;
}
