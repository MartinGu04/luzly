/**
 * Skeleton shaped like the real `/fairness` layout -- header, mode toggle,
 * period nav, freshness row, card groups -- never fake text/data. Same
 * shimmer convention as `/manager/fairness`'s own `loading.tsx` (which
 * this route now replaces).
 */
export default function FairnessLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="טוען את טבלת הצדק">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="skeleton h-8 w-28 rounded-lg" />
          <div className="skeleton h-4 w-72 rounded-lg" />
        </div>
        <div className="skeleton h-10 w-44 rounded-full" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="skeleton h-9 w-40 rounded-full" />
        <div className="skeleton h-4 w-40 rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
        <div className="skeleton h-28 rounded-2xl" />
      </div>
    </div>
  );
}
