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
 * Shift Fairness person detail (PR #4 §15) -- the fuller facts a card
 * intentionally leaves out: weekend deviation/status alongside the
 * general ones, and a plain-Hebrew explanation of WHY a target is
 * unavailable when it is (never a raw `dataCompleteness` reason key).
 * `actualShifts`/`weekendActualShifts` (the real confirmed work) always
 * render regardless of target availability.
 */
export function ShiftFairnessDetail({ view, groupLabel }: ShiftFairnessDetailProps) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{groupLabel}</p>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="בוצעו" value={view.actualLabel} />
        <Stat label="יעד" value={view.targetLabel ?? "—"} />
        <Stat label="פער" value={view.deviationLabel ?? "—"} />
        <Stat label='סופ"ש בוצעו' value={view.weekendActualLabel} />
        <Stat label='סופ"ש יעד' value={view.weekendTargetLabel ?? "—"} />
        <Stat label='סופ"ש פער' value={view.weekendDeviationLabel ?? "—"} />
      </div>

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
