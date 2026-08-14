import Link from "next/link";
import type { DutyView } from "@/lib/presentation/duty";

interface DutyViewToggleProps {
  view: DutyView;
}

const TAB_BASE =
  "rounded-full px-3.5 py-1.5 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Server-rendered upcoming/history switch -- plain `Link`s to `/duties` and
 * `/duties?view=history`, no client JS required. The selected tab gets a
 * real filled surface + ring + bold text (never louder than the duty focus
 * section above it, which keeps its own stronger `hero` surface).
 */
export function DutyViewToggle({ view }: DutyViewToggleProps) {
  return (
    <nav aria-label="תצוגת תורנויות" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
      <Link
        href="/duties"
        aria-current={view === "upcoming" ? "page" : undefined}
        className={`${TAB_BASE} ${
          view === "upcoming"
            ? "bg-surface-1 font-semibold text-primary shadow-sm ring-1 ring-border"
            : "font-medium text-muted hover:text-foreground"
        }`}
      >
        קרובות
      </Link>
      <Link
        href="/duties?view=history"
        aria-current={view === "history" ? "page" : undefined}
        className={`${TAB_BASE} ${
          view === "history"
            ? "bg-surface-1 font-semibold text-primary shadow-sm ring-1 ring-border"
            : "font-medium text-muted hover:text-foreground"
        }`}
      >
        היסטוריה
      </Link>
    </nav>
  );
}
