"use client";

import { useState } from "react";
import type { DashboardVisitRecap } from "@/lib/readModels/recentDashboardChangesTypes";
import { DashboardVisitMarker } from "./DashboardVisitMarker";
import { RecentChangesPanel } from "./RecentChangesPanel";

interface DashboardVisitSessionProps {
  /** The Server Component's latest `DashboardVisitRecap` prop -- ONLY the value this component had at its very first render is ever actually used (see docstring). Every later prop update is deliberately ignored for the lifetime of this mounted instance. */
  visitRecap: DashboardVisitRecap;
}

/**
 * The visit-scoped boundary for "מה השתנה מאז הפעם הקודמת": freezes the
 * server's `DashboardVisitRecap` for the ENTIRE lifetime of one genuinely
 * mounted personal Home visit, and coordinates both `DashboardVisitMarker`
 * (the write) and `RecentChangesPanel` (the display) off that SAME frozen
 * snapshot -- never two independently-drifting reads of `visitRecap`.
 *
 * Why this exists: `DashboardVisitMarker` alone already stops a SECOND
 * visit from ever being WRITTEN on an `AppRevalidator`-triggered
 * `router.refresh()` (it captures `visitStartedAt` into a ref at mount and
 * never re-fires). But `Dashboard` is a Server Component -- every
 * `router.refresh()` re-renders it with a FRESH `visitRecap` prop (a new
 * `last_visited_at` read, since the marker's write from THIS visit may
 * have already landed server-side by the time the refresh fires). Without
 * this component, that fresh prop would flow straight into
 * `RecentChangesPanel` and silently replace/empty the recap the user is
 * still looking at, mid-visit -- correct as far as the WRITE goes, but
 * wrong as a DISPLAY: "מה השתנה מאז הפעם הקודמת" must stay a stable
 * snapshot for the whole visit, not something that can shrink to nothing
 * while the user is still on the page reading it.
 *
 * The fix is the same "freeze at first render" idea `DashboardVisitMarker`
 * already applies to its timestamp, just also covering the DISPLAYED
 * recap: `useState(visitRecap)`'s initializer argument is only ever used
 * on the very FIRST render of a given mounted instance -- every
 * subsequent render (including one driven by a brand-new `visitRecap`
 * prop from a Server Component refresh) keeps that SAME frozen state,
 * since this component never calls its own setter again.
 * `RecentChangesPanel` is rendered from that frozen state, never the live
 * `visitRecap` prop directly, so the panel can never flicker/empty/replace
 * itself mid-visit. (A `ref` would express the same "only matters once"
 * intent, but reading `ref.current` during render is unsafe/disallowed --
 * `useState`'s lazy-initializer is the idiomatic, render-safe way to
 * freeze a value for a component's whole mounted lifetime.)
 *
 * A genuine unmount + remount (leaving Home and coming back, or a full
 * reload) creates a brand-new component instance with brand-new state --
 * exactly when a NEW recap (and a NEW marker write) is correct.
 *
 * Renders no chrome of its own beyond the existing recap panel's wrapper
 * -- purely a coordination boundary, not a visual container.
 */
export function DashboardVisitSession({ visitRecap }: DashboardVisitSessionProps) {
  const [frozenRecap] = useState(visitRecap);

  return (
    <>
      <DashboardVisitMarker visitStartedAt={frozenRecap.visitStartedAt} />
      {frozenRecap.items.length > 0 ? (
        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <RecentChangesPanel changes={frozenRecap.items} totalCount={frozenRecap.totalCount} />
        </div>
      ) : null}
    </>
  );
}
