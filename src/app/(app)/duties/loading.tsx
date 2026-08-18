/**
 * Skeleton shaped like the real `/duties` layout -- header, freshness row,
 * focus card, view toggle, list -- never fake text/data. Uses the shared
 * `.skeleton` shimmer utility (globals.css), same convention as
 * `(dashboard)/loading.tsx`.
 *
 * `/duties` previously had no `loading.tsx` at all: a dynamic route with no
 * loading boundary is never prefetched (Next only prefetches a dynamic
 * route's "layout to first loading boundary"), and a click had nothing to
 * show until the full server round trip finished -- just the nav link's own
 * small `useLinkStatus` spinner, with the outgoing page frozen in place.
 * Adding this file scoped to `duties/` (its own segment, not shared with any
 * sibling route) makes this segment eligible for prefetch and gives the
 * transition an immediate visual start, without touching data fetching,
 * caching, or auth.
 */
export default function DutiesLoading() {
  return (
    <div className="flex flex-col gap-4 sm:gap-6" aria-busy="true" aria-label="טוען תורנויות">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-8 w-32 rounded-lg" />
        <div className="skeleton h-4 w-48 rounded-lg" />
      </div>

      <div className="skeleton h-4 w-40 rounded-lg" />

      <div className="skeleton h-48 rounded-xl" />

      <div className="skeleton h-9 w-40 rounded-full" />

      <div className="flex flex-col gap-3">
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-20 rounded-xl" />
        <div className="skeleton h-20 rounded-xl" />
      </div>
    </div>
  );
}
