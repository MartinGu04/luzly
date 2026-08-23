import type { ShiftFairnessCardView } from "@/lib/presentation/fairnessCards";

interface ShiftFairnessDetailProps {
  view: ShiftFairnessCardView;
  /** "אחמ״שים" / "טכנאים" -- the comparison group this person belongs to, same label the group section above already used. */
  groupLabel: string;
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
 * Shift Fairness person detail (PR #4 §15, redesigned for the Justice Table
 * UX pass, whole-shift fair-range pass) -- "בוצעו / צפי הוגן / מצב /
 * סופ״שים", the same human-readable range status the card shows (never a
 * raw fractional target or signed gap number), plus -- one interaction
 * deeper -- the concrete factor breakdown behind why this person's
 * expected value differs (`expectationFactorLabel`) and a plain-Hebrew
 * explanation of WHY a target is unavailable when it is (never a raw
 * `dataCompleteness` reason key). `actualShifts`/`weekendActualShifts`
 * (the real confirmed work) always render regardless of target
 * availability.
 */
export function ShiftFairnessDetail({ view, groupLabel }: ShiftFairnessDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{groupLabel}</p>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="בוצעו" value={view.actualLabel} />
        <Stat label={view.targetPeriodLabel} value={view.targetLabel !== null ? `${view.targetLabel} משמרות` : "—"} />
        <Stat label="מצב" value={view.statusStateLabel} />
        <Stat label='סופ"שים' value={view.weekendActualLabel} />
      </div>

      {view.statusExplanationLabel ? <p className="text-sm text-muted">{view.statusExplanationLabel}</p> : null}

      {view.expectationFactorLabel ? (
        <p className="text-xs leading-relaxed text-muted">
          <span className="text-muted-2">למה הצפי שונה עבור אדם זה:</span> {view.expectationFactorLabel}
        </p>
      ) : null}

      {view.unavailableNote || view.completenessNote ? (
        <p className="rounded-xl bg-overlay-soft px-3 py-2.5 text-xs leading-relaxed text-muted">
          {view.completenessNote ?? view.unavailableNote}
        </p>
      ) : null}

      <p className="text-xs text-muted-2">
        הנתונים המוצגים מבוססים על משמרות מאושרות בפועל ועל הזדמנויות אמיתיות בתקופה -- הצגת מצב בלבד, ולא המלצה
        לשיבוץ הבא.
      </p>
    </div>
  );
}
