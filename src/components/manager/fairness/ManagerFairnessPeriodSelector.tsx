import Link from "next/link";
import type { FairnessPeriodKey } from "@/lib/domain/fairnessPeriod";
import { buildManagerFairnessHref } from "@/lib/presentation/managerFairnessUrl";

interface ManagerFairnessPeriodSelectorProps {
  current: FairnessPeriodKey;
}

const PERIOD_OPTIONS: { key: FairnessPeriodKey; label: string }[] = [
  { key: "h1", label: "1–6" },
  { key: "h2", label: "7–12" },
];

const TAB_BASE =
  "rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/**
 * Server-rendered period switch, plain `Link`s only (PR #15 §24). Switching
 * period always clears `?person=` -- a person selected in one period's
 * fairness table has no meaning in the other period's rows.
 */
export function ManagerFairnessPeriodSelector({ current }: ManagerFairnessPeriodSelectorProps) {
  return (
    <nav aria-label="בחירת תקופה" className="inline-flex items-center gap-1 rounded-full bg-overlay-soft p-1">
      {PERIOD_OPTIONS.map((option) => {
        const isActive = current === option.key;
        return (
          <Link
            key={option.key}
            href={buildManagerFairnessHref({ period: option.key, personId: null })}
            aria-current={isActive ? "page" : undefined}
            className={`${TAB_BASE} ${isActive ? "bg-surface-1 text-primary shadow-sm" : "text-muted hover:text-foreground"}`}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
