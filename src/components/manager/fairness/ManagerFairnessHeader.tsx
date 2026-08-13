import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * "/manager/fairness" page title -- a restrained manager sub-screen, never
 * promoted to a sixth main navigation module (PR #15 §2). Always provides
 * a clear way back to "מבט מנהל".
 */
export function ManagerFairnessHeader({ periodLabel }: { periodLabel: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/manager"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-muted transition-colors duration-200 hover:text-foreground"
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
        מבט מנהל
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">טבלת צדק</h1>
          <p className="mt-1.5 text-sm text-muted">מבט על חלוקת העומס, הניקוד, סופי השבוע והפטורים.</p>
        </div>
        <span className="mt-1 inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted">
          {periodLabel}
        </span>
      </div>
    </div>
  );
}
