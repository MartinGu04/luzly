import { Panel } from "@/components/ui/Panel";
import { ManagerFairnessRow } from "./ManagerFairnessRow";
import type { ManagerFairnessRowCardView } from "./types";

interface ManagerFairnessTableProps {
  rows: ManagerFairnessRowCardView[];
}

/** Every fairness row for the selected period, already sorted by relative load (PR #15 §30/§31) -- never re-sorted client-side. */
export function ManagerFairnessTable({ rows }: ManagerFairnessTableProps) {
  if (rows.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        לא נמצאה טבלת צדק לתקופה שנבחרה.
      </Panel>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <ManagerFairnessRow key={row.key} view={row} />
      ))}
    </ul>
  );
}
