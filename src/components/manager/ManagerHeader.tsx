/** "/manager" page title -- a restrained manager marker, never a full admin-dashboard stereotype. */
export function ManagerHeader() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-foreground sm:text-3xl">מבט מנהל</h1>
        <p className="mt-1.5 text-sm text-muted">התמונה המלאה של הסידור, הצוות והפוטנציאל.</p>
      </div>
      <span className="mt-1 inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted">
        מנהל
      </span>
    </div>
  );
}
