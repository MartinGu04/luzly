/**
 * Skeleton shaped like the real `/manager/fairness` layout -- header,
 * subnav, fairness header, freshness row, period selector, chart panel,
 * table -- never fake text/data. Same shimmer convention as
 * `(dashboard)/loading.tsx`.
 *
 * `/manager/fairness` previously had no `loading.tsx`, so it was never
 * prefetched and a click had nothing to show until the full round trip
 * finished. Scoped to `manager/fairness/` only -- a sibling segment of
 * `/manager`, not a shared ancestor (see `manager/loading.tsx`'s own
 * docstring). Period/person selections keep their existing in-place
 * transition behavior; this fallback only appears for a genuine new entry
 * into the segment.
 */
export default function ManagerFairnessLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="טוען את טבלת הצדק">
      <div className="flex flex-col gap-2">
        <div className="skeleton h-9 w-28 rounded-lg" />
        <div className="skeleton h-4 w-56 rounded-lg" />
      </div>

      <div className="skeleton h-9 w-40 rounded-full" />

      <div className="skeleton h-10 w-64 rounded-lg" />
      <div className="skeleton h-4 w-40 rounded-lg" />

      <div className="skeleton h-64 rounded-2xl" />

      <div className="skeleton h-72 rounded-2xl" />
    </div>
  );
}
