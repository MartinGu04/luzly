import { Panel } from "@/components/ui/Panel";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import { formatReportOneDateSlash } from "@/lib/presentation/reportOneFormat";
import { shootingRangeHistorySourceLabel, shootingRangeHistoryStatusLabel } from "@/lib/presentation/shootingRangeHistory";
import type { ShootingRangeHistoryEntry } from "@/lib/readModels/buildShootingRangeQualificationReadModel";

interface ShootingRangeHistoryListProps {
  history: readonly ShootingRangeHistoryEntry[];
}

/**
 * A simple history list -- date, verified status, source, approver, never
 * internal auth ids/database details (spec: "Do not expose internal auth
 * IDs or database implementation details in the UI").
 */
export function ShootingRangeHistoryList({ history }: ShootingRangeHistoryListProps) {
  if (history.length === 0) {
    return <p className="text-sm text-muted">אין עדיין היסטוריית מטווחים.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {history.map((entry, index) => (
        <li key={`${entry.id ?? "sheet"}-${entry.performedOn}-${index}`}>
          <Panel variant="inline" className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="font-medium text-foreground">
              {parseCalendarDate(entry.performedOn) ? formatReportOneDateSlash(entry.performedOn) : entry.performedOn}
            </span>
            <span className="text-muted">{shootingRangeHistoryStatusLabel(entry.status)}</span>
            <span className="text-xs text-muted-2">{shootingRangeHistorySourceLabel(entry.source)}</span>
            {entry.approvedByPersonName ? <span className="text-xs text-muted-2">אושר ע״י {entry.approvedByPersonName}</span> : null}
          </Panel>
        </li>
      ))}
    </ul>
  );
}
