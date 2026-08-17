import Link from "next/link";
import type { DutyFairnessCardView } from "@/lib/presentation/fairnessCards";
import { FairnessStatusBadge } from "./FairnessStatusBadge";

/**
 * One Duty Fairness person card (PR #4 §12) -- name, allocation, status,
 * current score, target, delta, and weekend count, with visible exemption
 * badges when they exist. Deliberately a compact subset -- gap/normalized
 * load live in the detail overlay, not every read-model field crammed
 * onto the card. An unavailable target never fakes a gap/normalizedLoad/
 * status -- a `'ר"צ'` card, for example, can sit in the אחמ״שים section
 * showing a real score/weekend/exemptions with no comparison target at
 * all, which is expected, not an error.
 *
 * A row with no resolved `href` (unresolved source name) still renders in
 * full, just as a plain (non-clickable) card -- same convention as the
 * former `ManagerFairnessRow`.
 */
export function DutyFairnessCard({ view }: { view: DutyFairnessCardView }) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{view.personName}</p>
          <p className="text-xs text-muted">{view.allocationLabel || "—"}</p>
        </div>
        <FairnessStatusBadge status={view.status} />
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
        <span className="text-foreground">
          ניקוד <span className="font-semibold">{view.currentLabel}</span>
        </span>
        <span className="text-muted">
          יעד <span className="font-medium text-foreground">{view.targetLabel ?? "—"}</span>
        </span>
        <span className="text-xs text-muted-2">שינוי {view.deltaLabel}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-2">סופ&quot;שים {view.weekendLabel}</p>
        {view.exemptionBadges.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1">
            {view.exemptionBadges.map((badge) => (
              <span
                key={badge}
                className="inline-flex items-center rounded-full bg-overlay-soft px-2 py-0.5 text-[11px] font-medium text-muted"
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  const className =
    "block rounded-2xl bg-surface-1 p-4 ring-1 ring-border transition-colors duration-200" +
    (view.href ? " hover:bg-overlay-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" : "");

  if (view.href) {
    return (
      <li>
        <Link href={view.href} className={className}>
          {content}
        </Link>
      </li>
    );
  }

  return (
    <li>
      <div className={className}>{content}</div>
    </li>
  );
}
