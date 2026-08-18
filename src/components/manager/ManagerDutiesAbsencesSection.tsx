import { Panel } from "@/components/ui/Panel";
import { groupManagerAbsences, groupManagerDuties } from "@/lib/presentation/dutyAbsenceGrouping";
import type { ManagerAbsenceGroupView, ManagerDutyGroupView } from "@/lib/presentation/dutyAbsenceGrouping";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "./types";

interface ManagerDutiesAbsencesSectionProps {
  duties: ManagerDutyRowView[];
  absences: ManagerAbsenceRowView[];
}

function DutyGroupCard({ group }: { group: ManagerDutyGroupView }) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {group.emoji ? <span aria-hidden="true">{group.emoji}</span> : null}
        {group.label}
        <span className="font-normal text-muted-2">· {group.rows.length}</span>
      </h4>
      <ul className="mt-1 divide-y divide-border">
        {group.rows.map((duty) => (
          <li key={duty.key} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-foreground">{duty.title}</span>
            <span className="shrink-0 text-xs text-muted">{duty.personName}</span>
            <span className="shrink-0 text-xs text-muted-2">{duty.dateLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AbsenceGroupCard({ group }: { group: ManagerAbsenceGroupView }) {
  return (
    <div>
      <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
        {group.emoji ? <span aria-hidden="true">{group.emoji}</span> : null}
        {group.label}
        <span className="font-normal text-muted-2">· {group.rows.length}</span>
      </h4>
      <ul className="mt-1 divide-y divide-border">
        {group.rows.map((absence) => (
          <li key={absence.key} className="flex items-center gap-2 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-foreground">{absence.personName}</span>
            <span className="shrink-0 text-xs text-muted-2">{absence.dateLabel}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * "תורנויות והיעדרויות" across everyone, within the selected range (PR #14
 * §25). Grouped by typed `dutyFamily`/`absenceKind` (Design Pass PR #21
 * §15/§16) -- e.g. "שמירה 1" and "שמירה 2" fall under one "שמירה" group,
 * never split by their slot-specific title. Typed Events only -- no fuzzy
 * text-based grouping, and no group ever renders empty.
 */
export function ManagerDutiesAbsencesSection({ duties, absences }: ManagerDutiesAbsencesSectionProps) {
  if (duties.length === 0 && absences.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        אין תורנויות או היעדרויות בטווח שנבחר.
      </Panel>
    );
  }

  const dutyGroups = groupManagerDuties(duties);
  const absenceGroups = groupManagerAbsences(absences);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {dutyGroups.length > 0 ? (
        <Panel variant="panel">
          <h3 className="text-[15px] font-semibold text-foreground">תורנויות</h3>
          <div className="mt-3 flex flex-col gap-4">
            {dutyGroups.map((group) => (
              <DutyGroupCard key={group.key} group={group} />
            ))}
          </div>
        </Panel>
      ) : null}

      {absenceGroups.length > 0 ? (
        <Panel variant="panel">
          <h3 className="text-[15px] font-semibold text-foreground">היעדרויות</h3>
          <div className="mt-3 flex flex-col gap-4">
            {absenceGroups.map((group) => (
              <AbsenceGroupCard key={group.key} group={group} />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
