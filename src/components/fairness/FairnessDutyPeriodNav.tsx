import Link from "next/link";
import type { FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";
import { fairnessDutiesHref } from "@/lib/presentation/fairnessUrl";

interface FairnessDutyPeriodNavProps {
  current: FairnessPeriodKey;
  /** "1–6/2026" / "7–12/2026" -- the server-resolved label for `current`, never recomputed client-side. */
  currentLabel: string;
}

const PERIOD_OPTIONS: { key: FairnessPeriodKey; label: string }[] = [
  { key: "h1", label: "1–6" },
  { key: "h2", label: "7–12" },
];

/**
 * Duty mode's H1/H2 period switch -- adapted from the existing, proven
 * `ManagerFairnessPeriodSelector` (same pill treatment, same "switching
 * period clears `?person=`" rule), pointed at `/fairness` instead of
 * `/manager/fairness`. Duty Fairness stays H1/H2 -- this never becomes a
 * calendar-month navigator.
 *
 * `dir="ltr"` on the numeric range labels (found during visual QA): a
 * string like "7–12" or "7–12/2026" has no strong-direction character of
 * its own, so inside this page's RTL context the bidi algorithm was
 * reordering the segments around the dash (rendering as "12-7") instead
 * of keeping the range in its intended left-to-right numeric order --
 * explicit `dir="ltr"` isolates it regardless of the surrounding
 * direction.
 */
export function FairnessDutyPeriodNav({ current, currentLabel }: FairnessDutyPeriodNavProps) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <nav aria-label="ניווט תקופות" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
        {PERIOD_OPTIONS.map((option) => {
          const isActive = current === option.key;
          return (
            <Link
              key={option.key}
              href={fairnessDutiesHref({ period: option.key })}
              scroll={false}
              aria-current={isActive ? "page" : undefined}
              dir="ltr"
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                isActive ? "bg-surface-1 text-primary shadow-sm" : "text-muted hover:text-foreground"
              }`}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>
      <span dir="ltr" className="text-xs font-medium text-muted-2">
        {currentLabel}
      </span>
    </div>
  );
}
