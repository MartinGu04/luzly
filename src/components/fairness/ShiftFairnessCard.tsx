import Link from "next/link";
import type { ShiftFairnessCardView } from "@/lib/presentation/fairnessCards";
import { FairnessStatusBadge } from "./FairnessStatusBadge";

/**
 * One Shift Fairness person card (PR #4 §11) -- name, status, actual vs
 * target, deviation, and a concise weekend line, in that hierarchy. A
 * `null` target/status never renders as "0"/"מאוזן" -- `unavailableNote`
 * replaces the whole target/deviation line with a calm, honest sentence
 * instead, while `actualLabel` (always a real, confirmed number) stays
 * visible regardless. No generic "partial data" badge -- the note IS the
 * only incompleteness signal, shown only when it materially matters.
 */
export function ShiftFairnessCard({ view }: { view: ShiftFairnessCardView }) {
  return (
    <li>
      <Link
        href={view.href}
        className="block rounded-2xl bg-surface-1 p-4 ring-1 ring-border transition-colors duration-200 hover:bg-overlay-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <p className="min-w-0 truncate text-sm font-semibold text-foreground">{view.personName}</p>
          <FairnessStatusBadge status={view.status} />
        </div>

        {view.unavailableNote ? (
          <p className="mt-3 text-xs leading-relaxed text-muted">
            <span className="font-medium text-foreground">בוצעו {view.actualLabel}</span> · {view.unavailableNote}
          </p>
        ) : (
          <div className="mt-3 flex items-baseline gap-4 text-sm">
            <span className="text-foreground">
              בוצעו <span className="font-semibold">{view.actualLabel}</span>
            </span>
            <span className="text-muted">
              יעד <span className="font-medium text-foreground">{view.targetLabel}</span>
            </span>
            {view.deviationLabel ? <span className="text-xs text-muted-2">פער {view.deviationLabel}</span> : null}
          </div>
        )}

        <p className="mt-2 text-xs text-muted-2">
          סופ&quot;ש {view.weekendActualLabel}
          {view.weekendTargetLabel ? <> · יעד {view.weekendTargetLabel}</> : null}
        </p>
      </Link>
    </li>
  );
}
