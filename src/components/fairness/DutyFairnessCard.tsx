import Link from "next/link";
import type { DutyFairnessCardView } from "@/lib/presentation/fairnessCards";
import { Avatar } from "@/components/ui/Avatar";
import { FairnessMetric } from "./FairnessMetric";
import { FairnessStatusBadge, fairnessStatusTintTextClass } from "./FairnessStatusBadge";

/**
 * One Duty Fairness person card (PR #4 §12, redesigned PR #51 follow-up,
 * densified follow-up) -- name/allocation + status, then a compact self-
 * explanatory PRIMARY metric grid (הקצאות שבוצעו / ניקוד נוכחי / יעד
 * השוואה / פער מהיעד, the weighted completed-allocation total leading
 * since it's the intuitive fact, followed by the fairness-scoring metrics,
 * the gap tinted with the same restrained status color as the badge), then
 * a smaller SECONDARY row for the previous-period change, weekend count,
 * and any exemption badges. Deliberately a compact subset -- normalized
 * load lives in the detail overlay, not every read-model field crammed
 * onto the card. An unavailable target never fakes a gap/normalizedLoad/
 * status -- a `'ר"צ'` card, for example, can sit in the אחמ״שים section
 * showing a real score/weekend/exemptions with no comparison target at
 * all, which is expected, not an error; the completed-allocation total
 * stays visible either way, since it never depends on having a comparison
 * target.
 *
 * The PRIMARY grid is a CSS container query (`@container` on the card root,
 * `@[380px]:grid-cols-4` on the grid itself), not a viewport breakpoint --
 * deliberately, since this card's own rendered width depends on the page's
 * 1/2-card-per-row layout AND the sidebar's own responsive show/hide, not
 * directly on the viewport. A viewport breakpoint would put the row layout
 * in effect at some widths where the card itself is still too narrow (2-up
 * card grid + visible sidebar); the container query instead asks the ONE
 * question that actually matters -- "is THIS card wide enough for 4
 * metrics in a row?" -- falling back to a compact 2x2 grid whenever it
 * isn't, exactly the same fallback narrow mobile already needed, without
 * introducing a second, viewport-based codepath into the same component.
 *
 * A row with no resolved `href` (unresolved source name) still renders in
 * full, just as a plain (non-clickable) card -- same convention as the
 * former `ManagerFairnessRow`.
 */
export function DutyFairnessCard({ view }: { view: DutyFairnessCardView }) {
  const content = (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <Avatar name={view.personName} size="xs" avatarUrl={view.avatarUrl} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{view.personName}</p>
            <p className="text-xs text-muted">{view.allocationLabel || "—"}</p>
          </div>
        </div>
        <FairnessStatusBadge status={view.status} />
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 rounded-lg bg-overlay-faint px-2.5 py-2 @[380px]:grid-cols-4">
        <FairnessMetric testId="metric-duty-allocation" label="הקצאות שבוצעו" value={view.completedAllocationLabel} />
        <FairnessMetric testId="metric-duty-current" label="ניקוד נוכחי" value={view.currentLabel} />
        <FairnessMetric testId="metric-duty-target" label="יעד השוואה" value={view.targetLabel ?? "—"} />
        <FairnessMetric
          testId="metric-duty-gap"
          label="פער מהיעד"
          value={view.gapLabel ?? "—"}
          toneClassName={fairnessStatusTintTextClass(view.status)}
        />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1.5">
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
    "@container block rounded-xl bg-surface-1 p-3 ring-1 ring-border transition-colors duration-200" +
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
