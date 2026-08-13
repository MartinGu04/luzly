import { Panel } from "@/components/ui/Panel";
import { CoverageBadge } from "@/components/ui/CoverageBadge";
import type { ManagerShiftGroupView } from "./types";

interface ManagerCoverageSectionProps {
  groups: ManagerShiftGroupView[];
}

const SHOWS_MISSING_CALLOUT = new Set(["partial", "missing"]);

function NameList({ label, names }: { label: string; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="text-xs text-muted">
      <span className="text-muted-2">{label}:</span> {names.join(", ")}
    </p>
  );
}

/**
 * "מה מסודר?" -- unit-wide shift coverage within the selected range,
 * grouped by date+period (PR #14 §24). Reuses `CoverageBadge` (the same
 * shared coverage icon/color mapping `/with-me` uses) and never collapses
 * multiple assigned people into one.
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
      {groups.map((group) => {
        const showsMissingCallout =
          SHOWS_MISSING_CALLOUT.has(group.coverageStatus) && group.missingIntervalLabels.length > 0;

        return (
          <Panel key={group.key} variant="panel">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                  {group.emoji ? <span aria-hidden="true">{group.emoji}</span> : null}
                  {group.periodLabel}
                </h3>
                <p className="mt-1 text-xs text-muted">{group.dateLabel}</p>
              </div>
              <CoverageBadge status={group.coverageStatus} />
            </div>

            {showsMissingCallout ? (
              <p className="mt-3 rounded-lg bg-overlay-soft px-3 py-2 text-xs text-muted">
                <span className="font-medium text-foreground">חסר כיסוי:</span>{" "}
                <span dir="ltr" className="tabular-nums">
                  {group.missingIntervalLabels.join(" · ")}
                </span>
              </p>
            ) : null}

            <div className="mt-3 space-y-1">
              <NameList label="טכנאים" names={group.technicianNames} />
              <NameList label="אחמ״שים" names={group.supervisorNames} />
              <NameList label="צל טכנאי" names={group.shadowTechnicianNames} />
              <NameList label="צל אחמ״ש" names={group.shadowSupervisorNames} />
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
