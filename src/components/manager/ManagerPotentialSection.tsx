import { Panel } from "@/components/ui/Panel";
import { ManagerPotentialRow } from "./ManagerPotentialRow";
import type { ManagerPotentialRowView } from "./types";

interface ManagerPotentialSectionProps {
  rows: ManagerPotentialRowView[];
}

/** "פוטנציאל מול סידור" -- every reconciled Potential requirement in the selected range (PR #14 §26), not just the problematic ones (see `ManagerAttentionSection` for that). */
export function ManagerPotentialSection({ rows }: ManagerPotentialSectionProps) {
  if (rows.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        אין דרישות Potential בטווח שנבחר.
      </Panel>
    );
  }

  return (
    <Panel variant="panel">
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <ManagerPotentialRow key={row.key} view={row} />
        ))}
      </ul>
    </Panel>
  );
}
