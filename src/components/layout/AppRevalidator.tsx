"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * While the tab stays visible, revalidate at this cadence, measured from
 * the last automatic revalidation -- NOT a fixed mount-anchored interval.
 * Far longer than the workbook-snapshot cache's own 30s TTL
 * (`lib/sync/workbookSnapshotCache.ts`) -- by the time this fires, that
 * cache has always already expired on its own, so this never forces an
 * extra Google fetch beyond what the cache would naturally need anyway.
 */
const VISIBLE_REFRESH_INTERVAL_MS = 5 * 60_000;

/**
 * Cooldown/dedup window for automatic (non-manual) revalidation. Browser
 * lifecycle events (`visibilitychange`/BFCache `pageshow`) can fire close
 * together on resume -- this coalesces those into a single
 * `router.refresh()` call. It is deliberately short: the periodic cadence
 * above is what actually prevents a periodic refresh from landing too soon
 * after a resume-triggered one (see `scheduleNextPeriodicRefresh`); this
 * cooldown only ever needs to absorb near-simultaneous event firing, not
 * track true in-flight completion (the App Router gives no public
 * completion callback for `router.refresh()`).
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
 *
 * Resume signals: `visibilitychange` -> `"visible"` is the primary,
 * reliable-on-mobile signal. `pageshow` is included ONLY for genuine
 * BFCache restoration (`event.persisted === true`) -- Safari/Firefox can
 * restore a whole page from the back/forward cache without firing
 * `visibilitychange` at all, so this catches that gap. A normal (non-BFCache)
 * `pageshow`, which fires on every ordinary navigation/first paint, never
 * triggers a refresh. There is deliberately no generic `focus` listener --
 * it fires far more often than a real "resume" (e.g. clicking back into the
 * window while already on-screen) and would just be redundant with
 * `visibilitychange` on every case that actually matters.
 */
export function AppRevalidator() {
  const router = useRouter();
  const lastTriggeredAtRef = useRef(0);

  useEffect(() => {
    let periodicTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * (Re)arms the periodic check for `VISIBLE_REFRESH_INTERVAL_MS` from
     * NOW -- called once on mount and again after every automatic refresh
     * that actually runs, so a resume-triggered refresh always pushes the
     * next periodic one out by a full interval rather than letting a
     * mount-anchored timer fire a few seconds later.
     */
    function scheduleNextPeriodicRefresh() {
      if (periodicTimer) clearTimeout(periodicTimer);
      periodicTimer = setTimeout(() => {
        requestRevalidate();
      }, VISIBLE_REFRESH_INTERVAL_MS);
    }

    function requestRevalidate() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastTriggeredAtRef.current < AUTO_REFRESH_COOLDOWN_MS) return;
      lastTriggeredAtRef.current = now;
      router.refresh();
      scheduleNextPeriodicRefresh();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") requestRevalidate();
    }

    function handlePageShow(event: Event) {
      const persisted = "persisted" in event && (event as { persisted?: boolean }).persisted === true;
      if (persisted) requestRevalidate();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pageshow", handlePageShow);

    scheduleNextPeriodicRefresh();

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handlePageShow);
      if (periodicTimer) clearTimeout(periodicTimer);
    };
  }, [router]);

  return null;
}
