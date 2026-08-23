/**
 * Skeleton shaped like the real dashboard layout -- header, hero, secondary
 * column, timeline, and the full-width weekly strip below it -- never fake
 * text/data. Uses the shared `.skeleton`
 * shimmer utility (globals.css), which is itself disabled under
 * `prefers-reduced-motion`.
 *
 * Deliberately lives inside its own `(dashboard)` route group instead of
 * at the shared `(app)/` level. A `loading.tsx` placed at `(app)/` would
 * wrap EVERY sibling route's `{children}` (schedule/duties/manager, not
 * just `/`) in one Suspense boundary -- so tapping
 * bottom-nav to a different route while scrolled down would suspend on
 * THIS fallback first, and since a route change scrolls to top as soon as
 * the new segment (even a fallback) mounts, the outgoing page would
 * visibly jump to its own top before the destination ever appears. Scoping
 * this loading state to `/` only, via a nested group that adds no URL
 * segment, keeps every other route's navigation a single direct
 * transition with no intermediate fallback/scroll jump.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="טוען את הסידור שלך">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-6 w-40 rounded-lg" />
          <div className="skeleton h-4 w-28 rounded-lg" />
        </div>
        <div className="skeleton h-6 w-16 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <div className="skeleton h-56 rounded-xl" />
          <div className="skeleton h-64 rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="skeleton h-16 rounded-xl" />
          <div className="skeleton h-72 rounded-xl" />
        </div>
      </div>

      {/* "השבוע הקרוב" placeholder -- a full-width strip matching WeekOverviewSection's own shape, so the page doesn't visibly jump once real data replaces it. */}
      <div className="flex flex-col gap-4">
        <div className="skeleton h-5 w-32 rounded-lg" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="skeleton h-48 min-w-[78%] shrink-0 rounded-xl sm:min-w-[280px] lg:min-w-0 lg:flex-1" />
          ))}
        </div>
      </div>
    </div>
  );
}
