import Link from "next/link";
import type { DutyFairnessCardView } from "@/lib/presentation/fairnessCards";
import { FairnessMetric } from "./FairnessMetric";
import { FairnessStatusBadge, fairnessStatusTintTextClass } from "./FairnessStatusBadge";

/**
 * One Duty Fairness person card (PR #4 §12, redesigned PR #51 follow-up)
 * -- name/allocation + status, then a compact self-explanatory PRIMARY
 * metric grid (ניקוד נוכחי / יעד השוואה / פער מהיעד, the gap tinted with
 * the same restrained status color as the badge), then a smaller
 * SECONDARY row for the previous-period change, weekend count, and any
 * exemption badges. Deliberately a compact subset -- normalized load lives
 * in the detail overlay, not every read-model field crammed onto the
 * card. An unavailable target never fakes a gap/normalizedLoad/status -- a
 * `'ר"צ'` card, for example, can sit in the אחמ״שים section showing a real
 * score/weekend/exemptions with no comparison target at all, which is
 * expected, not an error.
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

      <div className="mt-3 grid grid-cols-3 gap-x-2 gap-y-1 rounded-lg bg-overlay-faint px-3 py-2.5">
        <FairnessMetric testId="metric-duty-current" label="ניקוד נוכחי" value={view.currentLabel} />
        <FairnessMetric testId="metric-duty-target" label="יעד השוואה" value={view.targetLabel ?? "—"} />
        <FairnessMetric
          testId="metric-duty-gap"
          label="פער מהיעד"
          value={view.gapLabel ?? "—"}
          toneClassName={fairnessStatusTintTextClass(view.status)}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-2">
          <span data-testid="metric-duty-delta">
            שינוי מהתקופה הקודמת <span className="font-medium text-muted">{view.deltaLabel}</span>
          </span>
          <span data-testid="metric-duty-weekend">
            סופ&quot;שים <span className="font-medium text-muted">{view.weekendLabel}</span>
          </span>
        </div>
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
    "block rounded-xl bg-surface-1 p-4 ring-1 ring-border transition-colors duration-200" +
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
