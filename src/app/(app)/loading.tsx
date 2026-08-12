/**
 * Skeleton shaped like the real dashboard layout -- header, hero, secondary
 * column, timeline -- never fake text/data. Uses the shared `.skeleton`
 * shimmer utility (globals.css), which is itself disabled under
 * `prefers-reduced-motion`.
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <div className="skeleton h-56 rounded-3xl" />
          <div className="skeleton h-64 rounded-2xl" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="skeleton h-16 rounded-2xl" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
