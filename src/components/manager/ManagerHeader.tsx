/**
 * Shared title for both manager screens (`/manager` and
 * `/manager/fairness`) -- "אזור מנהל", a restrained manager marker, never a
 * full admin-dashboard stereotype (Design Pass PR #21 §3). The old inline
 * "טבלת צדק" shortcut and "מנהל" chip are gone -- `ManagerSubNav` is the
 * real navigation between the two screens now, and the manager scope is
 * already established once here, not repeated as a badge. Presentation
 * text only: server-side authorization (`getRequestManagerOverview` /
 * `getRequestManagerFairness`) is untouched and remains the sole gate.
 */
export function ManagerHeader() {
  return (
    <div className="min-w-0">
      <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">אזור מנהל</h1>
      <p className="mt-1.5 text-sm text-muted">תמונת מצב של הסידור, הכיסוי והצוות.</p>
    </div>
  );
}
