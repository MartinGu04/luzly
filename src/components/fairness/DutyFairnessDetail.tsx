import type { DutyFairnessCardView } from "@/lib/presentation/fairnessCards";

interface DutyFairnessDetailProps {
  view: DutyFairnessCardView;
  previousLabel: string;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-overlay-faint p-3">
      <p className="text-xs text-muted-2">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

/**
 * Duty Fairness person detail (PR #4 §16, redesigned for the Justice Table
 * UX pass, and corrected/refined in several follow-up passes) -- the
 * completed/target progress summary (remaining or beyond-target, plus the
 * `dutyStatusLabel` "how are they doing" state) leads, exactly like the
 * main card, then a LIVE strip when relevant, then a plain stat grid of
 * the workbook's own record for this person (previous/current score, the
 * change since last period, weekend count).
 *
 * Deliberately NO SECOND "target": the workbook's own role-based X/2X
 * comparison target, its below/balanced/above status badge, its gap-to-
 * target figure, and its normalized-load percentage (all derived from
 * `comparisonTarget`, a flat constant shared by every person in a role)
 * are NOT rendered anywhere in this panel. `personalTargetTotal` (this
 * person's own workbook "ניקוד לפוטנציאל הנוכחי" value, shown above) is now
 * the ONLY user-facing duty target -- showing the role-wide constant
 * alongside it, under any label, would read as a second, competing target
 * for the exact same word ("יעד"/"target"), even when the two numbers
 * legitimately differ (e.g. a workbook comparisonTarget of 8 next to this
 * person's own personalTargetTotal of 5.4). `comparisonTarget`/
 * `gapToTarget`/`normalizedLoad`/`status` remain computed in the read
 * model, unchanged, because `compareDutyFairnessRows`'s existing row
 * ordering still depends on `normalizedLoad` -- this is a UI-only removal,
 * not a calculation change. `currentScore`/`previousScore`/`delta` stay
 * visible here since they are plain SCORE facts (the workbook's official
 * record) -- note `currentScore` and `personalTargetTotal` are now the
 * SAME workbook number, shown twice for two different purposes (a plain
 * fact here, the progress denominator above), never a discrepancy.
 * Exemptions render as visible badges directly in the panel, never behind
 * hover.
 */
export function DutyFairnessDetail({ view, previousLabel }: DutyFairnessDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{view.allocationLabel || "—"}</p>

      {view.hasTarget ? (
        <p className="text-sm text-muted">
          <span className="text-muted-2">התקדמות מול היעד המפורסם:</span>{" "}
          {/* Same bidi isolation as the main card's "metric-duty-points" -- see
              its own comment (`DutyFairnessCard.tsx`) for why a bare numeric
              `completed / target` expression needs `dir="ltr"` inside this RTL
              page to avoid visually reversing to `target / completed`. */}
          <span dir="ltr">
            {view.completedAllocationLabel} / {view.personalTargetLabel}
          </span>{" "}
          נקודות ({view.progressPercentLabel})
          {view.beyondTargetLabel
            ? ` · ${view.beyondTargetLabel} נקודות מעבר לפוטנציאל`
            : ` · ${view.remainingLabel} נקודות נותרו`}
          {view.dutyStatusLabel ? ` · ${view.dutyStatusLabel}` : ""}
        </p>
      ) : view.noTargetNoteLabel ? (
        <p className="text-sm text-muted">{view.noTargetNoteLabel}</p>
      ) : null}

      {view.liveDutyLabel ? (
        <p className="text-sm text-status-above">
          ● LIVE · {view.liveDutyLabel} · {view.liveDutySubLabel}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="הקצאות שבוצעו" value={view.completedAllocationLabel} />
        <Stat label="ניקוד קודם" value={previousLabel} />
        <Stat label="ניקוד נוכחי" value={view.currentLabel} />
        <Stat label="שינוי" value={view.deltaLabel} />
        <Stat label='סופ"שים' value={view.weekendLabel} />
      </div>

      {view.weekendSuspendedNote ? <p className="text-xs text-muted-2">{view.weekendSuspendedNote}</p> : null}

      {view.exemptionBadges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {view.exemptionBadges.map((badge) => (
            <span
              key={badge}
              className="inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted"
            >
              {badge}
            </span>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-muted-2">
        הניקוד הנוכחי מגיע ישירות מ-Google Sheet ומהווה את מקור האמת -- הצגת מצב בלבד, ולא המלצה לשיבוץ הבא.
      </p>
    </div>
  );
}
