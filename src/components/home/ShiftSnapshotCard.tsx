import { ShiftProgress } from "@/components/dashboard/ShiftProgress";
import { CoverageBadge } from "@/components/ui/CoverageBadge";
import { Panel } from "@/components/ui/Panel";
import { TimeRange } from "@/components/dashboard/TimeRange";
import { periodLabel } from "@/lib/presentation/labels";
import { buildManagerHref } from "@/lib/presentation/managerUrl";
import { roleCoverageMessage } from "@/lib/presentation/roleCoverage";
import { issueDateLabel } from "@/lib/presentation/issue";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { ManagerShiftGroupPerson, ManagerRoleCoverageView } from "@/lib/readModels/managerTypes";
import type { PermanentManagerHomeCurrentShift, PermanentManagerHomeShift } from "@/lib/readModels/permanentManagerHomeTypes";

interface ShiftSnapshotCardProps {
  label: string;
  shift: PermanentManagerHomeShift;
  todayDate: string;
  /** Only set for the current shift -- drives live progress + the "hero" treatment. */
  current?: { timing: PermanentManagerHomeCurrentShift["timing"]; fetchedAt: string };
}

function RoleGroup({ label, people }: { label: string; people: ManagerShiftGroupPerson[] }) {
  if (people.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold text-muted-2">{label}</h4>
      <p className="mt-0.5 text-sm font-medium text-foreground">{people.map((p) => p.personName).join(" · ")}</p>
    </div>
  );
}

const ROLE_MESSAGE_TONE_CLASS: Record<CoverageStatus, string> = {
  full: "",
  partial: "text-warning",
  missing: "text-critical",
  not_evaluable: "text-muted",
};

function RoleCoverageMessage({ role, diagnostic }: { role: "technician" | "supervisor"; diagnostic: ManagerRoleCoverageView }) {
  const message = roleCoverageMessage(role, diagnostic);
  if (!message) return null;
  return <p className={`text-xs font-medium ${ROLE_MESSAGE_TONE_CLASS[diagnostic.status]}`}>{message}</p>;
}

/**
 * One of the three shift snapshots -- previous/current/next, all built from
 * the SAME `PermanentManagerHomeShift` shape. `current` opts into the
 * dominant "hero" treatment (bigger surface, live `ShiftProgress`) --
 * previous/next stay compact and calm. Coverage is always the domain's own
 * explicit verdict (`CoverageBadge`/`roleCoverageMessage`), never inferred
 * here from an empty name list.
 */
export function ShiftSnapshotCard({ label, shift, todayDate, current }: ShiftSnapshotCardProps) {
  const isCurrent = current !== undefined;
  const period = periodLabel(shift.period) ?? "משמרת";
  const dateLabel = issueDateLabel(shift.date, todayDate);
  const hasCoverageProblem = shift.coverageStatus !== "full" && shift.coverageStatus !== "not_evaluable";

  return (
    <Panel variant={isCurrent ? "hero" : "panel"} className={isCurrent ? "relative overflow-hidden" : undefined}>
      {isCurrent ? (
        <div
          aria-hidden="true"
          className="animate-ambient-glow pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl"
        />
      ) : null}

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={isCurrent ? "text-sm font-semibold text-primary" : "text-xs font-semibold text-muted-2"}>
            {label}
          </h3>
          <p className={isCurrent ? "mt-1 text-2xl font-bold text-foreground sm:text-3xl" : "mt-0.5 text-base font-bold text-foreground"}>
            {period}
          </p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span>{dateLabel}</span>
            <span aria-hidden="true">·</span>
            <TimeRange start={shift.startLocalTime} end={shift.endLocalTime} />
          </p>
        </div>
        <CoverageBadge status={shift.coverageStatus} />
      </div>

      {isCurrent ? (
        <div className="relative mt-5">
          <ShiftProgress timing={current.timing} fetchedAt={current.fetchedAt} mode="current" />
        </div>
      ) : null}

      <div className={`relative ${isCurrent ? "mt-6" : "mt-4"} space-y-3 border-t border-border pt-4`}>
        <RoleGroup label='אחמ״ש' people={shift.supervisors} />
        <RoleGroup label="טכנאים" people={shift.technicians} />
        <RoleCoverageMessage role="supervisor" diagnostic={shift.roleCoverage.supervisor} />
        <RoleCoverageMessage role="technician" diagnostic={shift.roleCoverage.technician} />
      </div>

      {hasCoverageProblem ? (
        <a
          href={buildManagerHref({ personId: null, range: "today", month: null, problemsOnly: true })}
          className="relative mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          לטיפול בבעיית הכיסוי ב&quot;דורש טיפול&quot; →
        </a>
      ) : null}
    </Panel>
  );
}
