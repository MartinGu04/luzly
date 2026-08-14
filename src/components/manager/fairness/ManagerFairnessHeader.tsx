/**
 * "/manager/fairness" page-scoped heading -- `ManagerHeader` (shared "אזור
 * מנהל" title) and `ManagerSubNav` (real navigation) already sit above this
 * on the page, so the old chevron "מבט מנהל" back-link is gone (Design
 * Pass PR #21 §6) -- it was made redundant once real subnav links exist.
 * This stays a lighter, page-scoped `h2`, never a second competing page
 * title.
 */
export function ManagerFairnessHeader({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
      <div className="min-w-0">
        <h2 className="text-lg font-bold text-foreground sm:text-xl">טבלת צדק</h2>
        <p className="mt-1 text-sm text-muted">מבט על חלוקת העומס, הניקוד, סופי השבוע והפטורים.</p>
      </div>
      <span className="mt-1 inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted">
        {periodLabel}
      </span>
    </div>
  );
}
