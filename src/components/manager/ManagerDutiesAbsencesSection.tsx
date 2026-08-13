import { Panel } from "@/components/ui/Panel";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "./types";

interface ManagerDutiesAbsencesSectionProps {
  duties: ManagerDutyRowView[];
  absences: ManagerAbsenceRowView[];
}

/** "תורנויות והיעדרויות" across everyone, within the selected range (PR #14 §25). Typed Events only -- no fuzzy interpretation. */
export function ManagerDutiesAbsencesSection({ duties, absences }: ManagerDutiesAbsencesSectionProps) {
  if (duties.length === 0 && absences.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        אין תורנויות או היעדרויות בטווח שנבחר.
      </Panel>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {duties.length > 0 ? (
        <Panel variant="panel">
          <h3 className="text-sm font-semibold text-foreground">תורנויות</h3>
          <ul className="mt-2 divide-y divide-border">
            {duties.map((duty) => (
              <li key={duty.key} className="flex items-center gap-2 py-2 text-sm">
                {duty.emoji ? <span aria-hidden="true">{duty.emoji}</span> : null}
                <span className="min-w-0 flex-1 truncate text-foreground">{duty.title}</span>
                <span className="shrink-0 text-xs text-muted">{duty.personName}</span>
                <span className="shrink-0 text-xs text-muted-2">{duty.dateLabel}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {absences.length > 0 ? (
        <Panel variant="panel">
          <h3 className="text-sm font-semibold text-foreground">היעדרויות</h3>
          <ul className="mt-2 divide-y divide-border">
            {absences.map((absence) => (
              <li key={absence.key} className="flex items-center gap-2 py-2 text-sm">
                {absence.emoji ? <span aria-hidden="true">{absence.emoji}</span> : null}
                <span className="min-w-0 flex-1 truncate text-foreground">{absence.label}</span>
                <span className="shrink-0 text-xs text-muted">{absence.personName}</span>
                <span className="shrink-0 text-xs text-muted-2">{absence.dateLabel}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
