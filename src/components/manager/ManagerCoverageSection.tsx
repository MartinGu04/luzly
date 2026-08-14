import { Panel } from "@/components/ui/Panel";
import { CoverageBadge } from "@/components/ui/CoverageBadge";
import type { ManagerRoleCoverageRowView, ManagerShiftGroupView } from "./types";

interface ManagerCoverageSectionProps {
  groups: ManagerShiftGroupView[];
}

const ROLE_TONE_CLASS: Record<ManagerRoleCoverageRowView["status"], string> = {
  full: "text-xs text-muted",
  partial: "text-sm font-medium text-warning",
  missing: "text-sm font-medium text-critical",
  not_evaluable: "text-xs text-muted",
};

function ShadowList({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      <span className="text-muted-2">{label}:</span> {names.join(", ")}
    </p>
  );
}

/**
 * One role's explicit coverage line -- "טכנאים: X, Y" when full (calm,
 * names only, same as before); "חסר טכנאי" / "כיסוי טכנאי חלקי · 05:30–07:30"
 * / "לא ניתן להעריך כיסוי טכנאי" otherwise (Design Pass PR #21 §13/§14) --
 * NEVER inferred from an empty name list, always the domain-derived
 * `roleCoverage` diagnostic message. Partial coverage still shows whichever
 * names ARE assigned alongside the explicit gap.
 */
function RoleCoverageLine({
  roleLabel,
  names,
  coverage,
}: {
  roleLabel: string;
  names: string[];
  coverage: ManagerRoleCoverageRowView;
}) {
  if (coverage.status === "full") {
    if (names.length === 0) return null;
    return (
      <p className="text-xs text-muted">
        <span className="text-muted-2">{roleLabel}:</span> {names.join(", ")}
      </p>
    );
  }

  return (
    <p className={ROLE_TONE_CLASS[coverage.status]}>
      {coverage.message}
      {names.length > 0 ? <span className="text-muted-2"> · {names.join(", ")}</span> : null}
    </p>
  );
}

/**
 * "מה מסודר?" -- unit-wide shift coverage within the selected range,
 * grouped by date+period (PR #14 §24). Each role's line is explicit about
 * WHO or WHAT is missing (§13) rather than making the manager infer it from
 * an empty name list -- `CoverageBadge` stays as an at-a-glance summary but
 * is never the sole explanation. `not_evaluable` is rendered as truthfully
 * unknown, never as a claimed gap.
 */
export function ManagerCoverageSection({ groups }: ManagerCoverageSectionProps) {
  if (groups.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        אין משמרות בטווח שנבחר.
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {groups.map((group) => (
        <Panel key={group.key} variant="panel">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 text-[15px] font-bold text-foreground">
                {group.emoji ? <span aria-hidden="true">{group.emoji}</span> : null}
                {group.periodLabel}
              </h3>
              <p className="mt-1 text-xs text-muted">{group.dateLabel}</p>
            </div>
            <CoverageBadge status={group.coverageStatus} />
          </div>

          <div className="mt-3 space-y-1">
            <RoleCoverageLine roleLabel="טכנאים" names={group.technicianNames} coverage={group.technicianCoverage} />
            <RoleCoverageLine roleLabel="אחמ״שים" names={group.supervisorNames} coverage={group.supervisorCoverage} />
            <ShadowList label="צל טכנאי" names={group.shadowTechnicianNames} />
            <ShadowList label="צל אחמ״ש" names={group.shadowSupervisorNames} />
          </div>
        </Panel>
      ))}
    </div>
  );
}
