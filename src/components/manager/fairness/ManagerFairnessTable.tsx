import { Panel } from "@/components/ui/Panel";
import { groupManagerFairnessRows } from "@/lib/presentation/managerFairnessGrouping";
import { ManagerFairnessRow } from "./ManagerFairnessRow";
import type { ManagerFairnessRowCardView } from "./types";

interface ManagerFairnessTableProps {
  rows: ManagerFairnessRowCardView[];
}

/**
 * Every fairness row for the selected period, grouped by role (אחמ״שים /
 * טכנאים / אחרים) via `resolveFairnessAllocationRole()` (Design Pass PR
 * #21 §31/§32). Within a group, rows keep the read model's own existing
 * order -- already sorted by relative load -- never re-sorted here.
 */
export function ManagerFairnessTable({ rows }: ManagerFairnessTableProps) {
  if (rows.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        לא נמצאה טבלת צדק לתקופה שנבחרה.
      </Panel>
    );
  }

  const groups = groupManagerFairnessRows(rows);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => (
        <div key={group.key}>
          <h3 className="mb-2 text-[15px] font-semibold text-muted-2">
            {group.label} <span className="font-normal text-muted-2">· {group.rows.length}</span>
          </h3>
          <ul className="flex flex-col gap-2.5">
            {group.rows.map((row) => (
              <ManagerFairnessRow key={row.key} view={row} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
