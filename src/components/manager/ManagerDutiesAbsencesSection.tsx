import type { ReactNode } from "react";
import { Panel } from "@/components/ui/Panel";
import { groupManagerAbsences, groupManagerDuties } from "@/lib/presentation/dutyAbsenceGrouping";
import type { ManagerAbsenceGroupView, ManagerDutyGroupView } from "@/lib/presentation/dutyAbsenceGrouping";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "./types";

interface ManagerDutiesAbsencesSectionProps {
  duties: ManagerDutyRowView[];
  absences: ManagerAbsenceRowView[];
}

/**
 * One family/kind group's own row -- a `<details>` disclosure (redesign)
 * rather than a permanently-expanded block, so a range with many groups
 * stays scannable at the summary line alone. Small groups (a handful of
 * rows -- the common case) start OPEN, so the everyday range doesn't cost
 * an extra click; a genuinely long group starts collapsed. Either way the
 * full row list is a click away, never removed.
 */
function GroupDisclosure({
  emoji,
  label,
  count,
  children,
}: {
  emoji: string | null;
  label: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <details open={count <= 3}>
      <summary className="flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-foreground">
        {emoji ? <span aria-hidden="true">{emoji}</span> : null}
        {label}
        <span className="font-normal text-muted-2">· {count}</span>
      </summary>
      <ul className="mt-1.5 divide-y divide-border">{children}</ul>
    </details>
  );
}

function DutyGroupCard({ group }: { group: ManagerDutyGroupView }) {
  return (
    <GroupDisclosure emoji={group.emoji} label={group.label} count={group.rows.length}>
      {group.rows.map((duty) => (
        <li key={duty.key} className="flex items-center gap-2 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-foreground">{duty.title}</span>
          <span className="shrink-0 text-xs text-muted">{duty.personName}</span>
          <span className="shrink-0 text-xs text-muted-2">{duty.dateLabel}</span>
        </li>
      ))}
    </GroupDisclosure>
  );
}

function AbsenceGroupCard({ group }: { group: ManagerAbsenceGroupView }) {
  return (
    <GroupDisclosure emoji={group.emoji} label={group.label} count={group.rows.length}>
      {group.rows.map((absence) => (
        <li key={absence.key} className="flex items-center gap-2 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate text-foreground">{absence.personName}</span>
          <span className="shrink-0 text-xs text-muted-2">{absence.dateLabel}</span>
        </li>
      ))}
    </GroupDisclosure>
  );
}

/**
 * "תורנויות והיעדרויות" across everyone, within the selected range (PR #14
 * §25) -- the ONE cross-team duty/absence view in the app (`/duties` is
 * personal-only). Grouped by typed `dutyFamily`/`absenceKind` (Design Pass
 * PR #21 §15/§16) -- e.g. "שמירה 1" and "שמירה 2" fall under one "שמירה"
 * group, never split by their slot-specific title. Typed Events only -- no
 * fuzzy text-based grouping, and no group ever renders empty.
 *
 * Each group is its own progressive-disclosure block (redesign) instead of
 * a permanently-expanded list -- a flat wall of "name · date" rows reads as
 * visually dense and hard to scan once a range has more than a few
 * entries; the group summary line (emoji + label + count) alone already
 * answers "what kinds of things are happening, and how many", with the
 * full list one click away.
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
          <div className="mt-3 flex flex-col gap-3">
            {dutyGroups.map((group) => (
              <DutyGroupCard key={group.key} group={group} />
            ))}
          </div>
        </Panel>
      ) : null}

      {absenceGroups.length > 0 ? (
        <Panel variant="panel">
          <h3 className="text-[15px] font-semibold text-foreground">היעדרויות</h3>
          <div className="mt-3 flex flex-col gap-3">
            {absenceGroups.map((group) => (
              <AbsenceGroupCard key={group.key} group={group} />
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
