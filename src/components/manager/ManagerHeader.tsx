import Link from "next/link";

/**
 * "/manager" page title -- a restrained manager marker, never a full
 * admin-dashboard stereotype. Includes a restrained shortcut to "טבלת
 * צדק" (PR #15 §2) -- `/manager/fairness` is a manager sub-screen, not a
 * sixth main navigation module, so it's linked here rather than added to
 * `BottomNav`.
 */
export function ManagerHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">מבט מנהל</h1>
        <p className="mt-1.5 text-sm text-muted">התמונה המלאה של הסידור, הצוות והפוטנציאל.</p>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Link
          href="/manager/fairness"
          className="inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted transition-colors duration-200 hover:bg-overlay-strong hover:text-foreground"
        >
          טבלת צדק
        </Link>
        <span className="inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted">
          מנהל
        </span>
      </div>
    </div>
  );
}
