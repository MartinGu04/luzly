import { AlertCircle } from "lucide-react";
import type { ManagerFairnessTotalsView } from "@/lib/readModels/managerFairnessTypes";

function trimmedNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Manager-only discrepancy warning between the sheet's own "סך הכל:" row
 * and the independently computed sum of the person rows (PR #15 §23).
 * Informational only -- never "fixes" the sheet's total, no writeback.
 */
export function ManagerFairnessTotalsNote({ totals }: { totals: ManagerFairnessTotalsView }) {
  if (!totals.hasDiscrepancy) return null;

  return (
    <p className="flex items-start gap-2 rounded-xl bg-overlay-soft px-3 py-2 text-xs text-muted">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" strokeWidth={2} />
      <span>
        יש פער בין סכום השורות לסך הכל בגיליון. סכום מחושב: ניקוד קודם{" "}
        {trimmedNumber(totals.computedPreviousTotal)}, ניקוד נוכחי {trimmedNumber(totals.computedCurrentTotal)},
        סופ&quot;שים {trimmedNumber(totals.computedWeekendTotal)}.
      </span>
    </p>
  );
}
