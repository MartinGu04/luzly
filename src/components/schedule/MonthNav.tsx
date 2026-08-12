import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

interface MonthNavProps {
  prevHref: string;
  nextHref: string;
  todayHref: string;
  isOnCurrentMonth: boolean;
}

const BUTTON_CLASSES =
  "flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-foreground transition-colors duration-200 hover:bg-overlay-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Server-rendered month navigation -- plain `Link`s to `/schedule?month=YYYY-MM`,
 * no client JS required. `todayHref` always points at `/schedule` with no
 * query param, so "today" resolves through the page's own Jerusalem-local
 * fallback rather than a client-computed date.
 */
export function MonthNav({ prevHref, nextHref, todayHref, isOnCurrentMonth }: MonthNavProps) {
  return (
    <nav aria-label="ניווט חודשים" className="flex shrink-0 items-center gap-1 rounded-full bg-overlay-soft p-1">
      <Link href={prevHref} aria-label="חודש קודם" className={BUTTON_CLASSES}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
        <span className="hidden sm:inline">חודש קודם</span>
      </Link>
      <Link
        href={todayHref}
        aria-label="היום"
        aria-current={isOnCurrentMonth ? "date" : undefined}
        className={`${BUTTON_CLASSES} ${isOnCurrentMonth ? "bg-surface-1 text-primary shadow-sm" : ""}`}
      >
        היום
      </Link>
      <Link href={nextHref} aria-label="חודש הבא" className={BUTTON_CLASSES}>
        <span className="hidden sm:inline">חודש הבא</span>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      </Link>
    </nav>
  );
}
