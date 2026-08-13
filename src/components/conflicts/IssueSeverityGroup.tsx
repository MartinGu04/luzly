import { IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import { Panel } from "@/components/ui/Panel";
import type { IssueSeverity } from "@/lib/domain/operationalIssues";
import { issueSeverityLabel } from "@/lib/presentation/labels";
import { IssueRow } from "./IssueRow";
import type { ConflictIssueView } from "./types";

interface IssueSeverityGroupProps {
  severity: IssueSeverity;
  views: ConflictIssueView[];
}

/**
 * One severity section -- header (icon + friendly Hebrew label + count),
 * then every issue at that severity as a flat divided list inside a single
 * panel, never card-inside-card. Renders nothing when this severity has no
 * issues -- an `info` section only ever appears once the domain actually
 * produces one, forward-compatible without an empty placeholder today.
 */
export function IssueSeverityGroup({ severity, views }: IssueSeverityGroupProps) {
  if (views.length === 0) return null;

  return (
    <section>
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <IssueSeverityBadge severity={severity} className="h-4 w-4" />
        {issueSeverityLabel(severity)}
        <span className="font-normal text-muted-2">· {views.length}</span>
      </h2>
      <Panel variant="panel" className="mt-2">
        <ul className="divide-y divide-border">
          {views.map((view) => (
            <IssueRow key={view.key} view={view} />
          ))}
        </ul>
      </Panel>
    </section>
  );
}
