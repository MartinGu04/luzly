/**
 * Skeleton shaped like the real `/manager` overview layout -- header,
 * subnav, command bar, attention section, coverage/potential/roster blocks
 * -- never fake text/data. Same shimmer convention as
 * `(dashboard)/loading.tsx`.
 *
 * `/manager` previously had no `loading.tsx`: a dynamic route with no
 * loading boundary is never prefetched, so a click had nothing to show
 * until the full round trip finished. This file, scoped to `manager/` only
 * (NOT shared with `/manager/fairness`, which has its own sibling
 * `loading.tsx` -- there is no `manager/layout.tsx`, so each is an
 * independent segment), makes this segment prefetchable and gives
 * navigation an immediate visual start. Person/range/problems-only
 * selections stay their existing in-place `<Suspense>`-transition
 * behavior (React keeps the previous content visible during an
 * already-mounted page's own re-render; this fallback only ever appears
 * for a genuine new entry into the segment).
 */
export default function ManagerLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="טוען את אזור המנהל">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-9 w-28 rounded-lg" />
        <div className="skeleton h-4 w-56 rounded-lg" />
      </div>

      <div className="skeleton h-9 w-40 rounded-full" />

      <div className="skeleton h-28 rounded-xl" />

      <div className="flex flex-col gap-3">
        <div className="skeleton h-6 w-32 rounded-lg" />
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-24 rounded-xl" />
      </div>

      <div className="skeleton h-64 rounded-xl" />
    </div>
  );
}
