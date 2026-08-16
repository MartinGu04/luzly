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
 *
 * `scroll={false}` on all three links (PR #38 follow-up): a month change is
 * an IN-PLACE calendar navigation -- the user's viewport position must
 * never move. Next's `<Link>` scrolls to the top of the page by default on
 * every successful navigation (including a search-param-only change like
 * this one); verified directly (production build, real scroll positions)
 * that this was the actual cause of the reported "calendar jump," not the
 * calendar's own geometry -- `scrollY` reset to 0 after every single
 * month-nav click, in both directions, regardless of where the user
 * started. `scroll={false}` disables exactly that reset, nothing else.
 */
export function MonthNav({ prevHref, nextHref, todayHref, isOnCurrentMonth }: MonthNavProps) {
  return (
    <nav aria-label="ניווט חודשים" className="flex shrink-0 items-center gap-1 rounded-full bg-overlay-soft p-1">
      <Link href={prevHref} scroll={false} aria-label="חודש קודם" className={BUTTON_CLASSES}>
        <ChevronRight className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
        <span className="hidden sm:inline">חודש קודם</span>
      </Link>
      <Link
        href={todayHref}
        scroll={false}
        aria-label="היום"
        aria-current={isOnCurrentMonth ? "date" : undefined}
        className={`${BUTTON_CLASSES} ${isOnCurrentMonth ? "bg-surface-1 text-primary shadow-sm" : ""}`}
      >
        היום
      </Link>
      <Link href={nextHref} scroll={false} aria-label="חודש הבא" className={BUTTON_CLASSES}>
        <span className="hidden sm:inline">חודש הבא</span>
        <ChevronLeft className="h-4 w-4" aria-hidden="true" strokeWidth={2} />
      </Link>
    </nav>
  );
}
