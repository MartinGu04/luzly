/**
 * "/manager" page title -- "אזור מנהל", a restrained manager marker, never
 * a full admin-dashboard stereotype (Design Pass PR #21 §3). The old
 * inline "טבלת צדק" shortcut and "מנהל" chip are gone. `/manager` is now
 * the ONE manager screen (PR #4 removed `/manager/fairness` -- see the
 * standalone `/fairness` route, no longer manager-only -- and with it
 * `ManagerSubNav`, which had nothing left to switch between). Presentation
 * text only: server-side authorization (`getRequestManagerOverview`) is
 * untouched and remains the sole gate.
 */
export function ManagerHeader() {
  return (
    <div className="min-w-0">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[28px]">אזור מנהל</h1>
      <p className="mt-1.5 text-sm text-muted">תמונת מצב של הסידור, הכיסוי והצוות.</p>
    </div>
  );
}
