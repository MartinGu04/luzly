import { Panel } from "@/components/ui/Panel";
import { DutyBlockRow } from "./DutyBlockRow";
import type { DutyBlockView } from "./types";

interface DutyBlockListProps {
  blocks: DutyBlockView[];
  emptyMessage: string;
  /** Small heading above the list -- used to honestly label a bounded history slice ("recent history", never "all history"). */
  title?: string;
}

/** One surface holding every remaining block (upcoming or history) -- no card-inside-card, no pagination. */
export function DutyBlockList({ blocks, emptyMessage, title }: DutyBlockListProps) {
  if (blocks.length === 0) {
    return (
      <Panel variant="panel">
        {title ? <h2 className="text-sm font-semibold text-foreground">{title}</h2> : null}
        <p className={title ? "mt-3 text-sm text-muted" : "text-sm text-muted"}>{emptyMessage}</p>
      </Panel>
    );
  }

  return (
    <Panel variant="panel">
      {title ? <h2 className="mb-3 text-sm font-semibold text-foreground">{title}</h2> : null}
      <div className="space-y-2.5">
        {blocks.map((block) => (
          <DutyBlockRow key={block.key} view={block} />
        ))}
      </div>
    </Panel>
  );
}
