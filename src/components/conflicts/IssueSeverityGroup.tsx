import { IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import { Panel } from "@/components/ui/Panel";
import { PulseIndicator } from "@/components/dashboard/PulseIndicator";
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
 *
 * `critical` gets real visual presence (Design Pass PR #20): the `critical`
 * surface variant (subtle red-tinted background/border, never a flashing
 * whole card), a stronger heading, and a small `PulseIndicator` -- the
 * SAME restrained, reduced-motion-respecting pulse already used for "live
 * now" elsewhere, reused rather than a new bespoke animation. Motion is
 * never the only signal: the heading text, count, and icon color all
 * still communicate severity with animation off. `review`/`info` never
 * receive any of this -- same neutral `panel` surface and heading weight
 * as before.
 */
export function IssueSeverityGroup({ severity, views }: IssueSeverityGroupProps) {
  if (views.length === 0) return null;

  const isCritical = severity === "critical";

  return (
    <section>
      <h2
        className={`flex items-center gap-2 ${
          isCritical ? "text-base font-bold text-critical" : "text-sm font-semibold text-foreground"
        }`}
      >
        <IssueSeverityBadge severity={severity} className="h-4 w-4" />
        {isCritical ? <PulseIndicator tone="critical" /> : null}
        {issueSeverityLabel(severity)}
        <span className={isCritical ? "font-semibold text-critical/70" : "font-normal text-muted-2"}>
          · {views.length}
        </span>
      </h2>
      <Panel variant={isCritical ? "critical" : "panel"} className="mt-2">
        <ul className="divide-y divide-border">
          {views.map((view) => (
            <IssueRow key={view.key} view={view} />
          ))}
        </ul>
      </Panel>
    </section>
  );
}
