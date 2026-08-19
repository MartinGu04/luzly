import type { DutyFairnessPersonRowView } from "@/lib/readModels/dutyFairnessTypes";
import { formatNormalizedLoad } from "@/lib/presentation/fairness";
import type { DutyFairnessCardView } from "@/lib/presentation/fairnessCards";

interface DutyFairnessDetailProps {
  view: DutyFairnessCardView;
  normalizedLoad: DutyFairnessPersonRowView["normalizedLoad"];
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
 * Duty Fairness person detail (PR #4 §16) -- the weighted completed-
 * allocation total, previous/current/delta, target, gap, and normalized
 * load as CONTEXTUAL "load relative to the comparison target" only,
 * explicitly labeled as such -- never a 0–100 Fairness grade. Exemptions
 * render as visible badges directly in the panel, never behind hover.
 */
export function DutyFairnessDetail({ view, normalizedLoad, previousLabel }: DutyFairnessDetailProps) {
  const normalizedLoadLabel = normalizedLoad !== null ? formatNormalizedLoad(normalizedLoad) : null;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{view.allocationLabel || "—"}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="הקצאות שבוצעו" value={view.completedAllocationLabel} />
        <Stat label="ניקוד קודם" value={previousLabel} />
        <Stat label="ניקוד נוכחי" value={view.currentLabel} />
        <Stat label="שינוי" value={view.deltaLabel} />
        <Stat label="יעד השוואה" value={view.targetLabel ?? "—"} />
        <Stat label="פער מהיעד" value={view.gapLabel ?? "—"} />
        <Stat label='סופ"שים' value={view.weekendLabel} />
      </div>

      {normalizedLoadLabel ? (
        <p className="text-sm text-muted">
          <span className="text-muted-2">עומס יחסי (ביחס ליעד ההשוואה, לא ציון הוגנות):</span> {normalizedLoadLabel}
        </p>
      ) : null}

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
