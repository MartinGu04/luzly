import { AlertCircle, CircleHelp } from "lucide-react";
import type { ManagerPotentialRowView } from "./types";

const STATUS_LABEL: Record<ManagerPotentialRowView["status"], string> = {
  covered: "מכוסה",
  partial: "מכוסה חלקית",
  missing: "דורש בדיקה",
  not_evaluable: "לא ניתן להצליב אוטומטית",
};

const STATUS_TEXT_CLASS: Record<ManagerPotentialRowView["status"], string> = {
  covered: "text-success",
  partial: "text-warning",
  missing: "text-critical",
  not_evaluable: "text-muted",
};

/**
 * One "פוטנציאל מול סידור" row -- source/framework requirement next to
 * the internal actual schedule, using ONLY the typed reconciliation
 * domain's own conclusion. `not_evaluable` is a real, calm, honest state
 * (never a bug, never dressed up as "מכוסה") -- see
 * `lib/domain/potentialReconciliation.ts` for exactly which statuses are
 * currently reachable and why.
 */
export function ManagerPotentialRow({ view }: { view: ManagerPotentialRowView }) {
  const Icon = view.status === "not_evaluable" ? CircleHelp : AlertCircle;

  return (
    <li className="flex items-start gap-3 py-3">
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_TEXT_CLASS[view.status]}`}
        aria-hidden="true"
        strokeWidth={2}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-xs text-muted">{view.dateLabel}</p>
        <p className="text-sm font-medium text-foreground">{view.columnLabel}</p>
        <p className="text-xs text-muted">
          <span className="text-muted-2">דרישת מקור:</span> {view.sourceRawValue}
        </p>
        <p className="text-xs text-muted">
          <span className="text-muted-2">בסידור בפועל:</span>{" "}
          {view.resolvedPersonName ? view.resolvedPersonName : "לא ידוע"}
        </p>
        {view.namedPersonBlockingAbsence ? (
          <p className="text-xs text-muted">יש היעדרות חוסמת באותו יום בסידור הפנימי.</p>
        ) : null}
        <p className={`text-xs font-medium ${STATUS_TEXT_CLASS[view.status]}`}>[{STATUS_LABEL[view.status]}]</p>
      </div>
    </li>
  );
}
