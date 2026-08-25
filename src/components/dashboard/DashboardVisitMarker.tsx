"use client";

import { useEffect, useRef } from "react";
import { recordDashboardVisitAction } from "@/lib/dashboardVisit/actions";

interface DashboardVisitMarkerProps {
  /**
   * The server render's own snapshot instant (`DashboardVisitRecap.visitStartedAt`)
   * -- captured server-side BEFORE the recap query ran, never a later
   * client-side `Date.now()`. Persisting this exact value (rather than
   * the moment this effect happens to run) is what prevents losing a
   * change that settles in the gap between the server's recap read and
   * this component's mount -- see this component's own docstring below.
   */
  visitStartedAt: string;
}

/**
 * Marks a genuine personal Home visit -- the ONLY thing that advances
 * `dashboard_visit_state.last_visited_at` (via `recordDashboardVisitAction`).
 * Renders no UI.
 *
 * A "visit" here means specifically a real mount of the personal Home
 * route `/`. It deliberately does NOT mean: `AppRevalidator`'s periodic/
 * background `router.refresh()` of an already-mounted Home instance, a
 * Supabase auth event, opening any other route, or opening the
 * Notification Bell.
 *
 * `router.refresh()` re-renders the current route's Server Components
 * with fresh props -- it does NOT unmount/remount the client component
 * tree. So this component captures `visitStartedAt` into a ref ONCE, at
 * its very first render, and its mount effect (empty dependency array)
 * fires exactly once per mounted instance:
 *
 *  - AppRevalidator's `router.refresh()` gives this SAME mounted instance
 *    a NEW `visitStartedAt` prop -- the ref keeps the ORIGINAL value, and
 *    the effect does not re-run at all. No second visit is marked.
 *  - A genuine navigation away from Home and back (or a full reload)
 *    unmounts this instance and mounts a brand-new one -- a fresh ref, a
 *    fresh effect run, a fresh (correctly later) visit is marked.
 *
 * The write uses the value `visitStartedAt` had at MOUNT time, not
 * `Date.now()` read inside the effect: a semantic change could settle in
 * the (typically short, but non-zero) gap between the server's recap
 * query and this effect actually running in the browser. Persisting the
 * server's own snapshot instant, rather than the later effect-execution
 * time, keeps that change eligible for the NEXT visit's recap rather
 * than silently marking it "already seen" before it was ever shown.
 *
 * The write is fire-and-forget and best-effort: `recordDashboardVisitAction`
 * never throws, and any failure here must never surface to the user or
 * affect the Home screen -- see that action's own docstring for why a
 * lost write is the deliberately preferred failure mode over ever
 * silently losing an unseen change.
 */
export function DashboardVisitMarker({ visitStartedAt }: DashboardVisitMarkerProps) {
  const mountedVisitStartedAtRef = useRef(visitStartedAt);

  useEffect(() => {
    // Deliberately empty deps: this must fire exactly once per genuine
    // mount, never again for a prop update on the same instance (see
    // docstring) -- `mountedVisitStartedAtRef` is a ref (stable identity)
    // and `recordDashboardVisitAction` is a module-level import, so `[]`
    // is already exhaustive.
    recordDashboardVisitAction(mountedVisitStartedAtRef.current).catch(() => {});
  }, []);

  return null;
}
