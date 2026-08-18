import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Panel } from "@/components/ui/Panel";
import { IssueSeverityGroup } from "@/components/issues/IssueSeverityGroup";
import type { IssueRowView } from "@/components/issues/types";
import type { IssueSeverity } from "@/lib/domain/operationalIssues";
import { fairnessShiftsHref } from "@/lib/presentation/fairnessUrl";
import { schedulePersonHref } from "@/lib/presentation/scheduleUrl";
import type { ManagerAbsenceRowView, ManagerDutyRowView } from "./types";

export interface ManagerSelectedPersonHeaderInfo {
  name: string;
  isManager: boolean;
  isTechnician: boolean;
  isSupervisor: boolean;
}

export interface ManagerSelectedPersonAssignmentView {
  key: string;
  emoji: string | null;
  title: string;
  dateLabel: string;
}

interface ManagerSelectedPersonViewProps {
  personId: string;
  person: ManagerSelectedPersonHeaderInfo;
  /** The manager's own photo, shown ONLY when this drill-down IS the manager's own row -- see `ManagerRosterSection` for the same rule. `null` for every other person (no photo data available without a new lookup). */
  avatarUrl: string | null;
  currentAssignments: ManagerSelectedPersonAssignmentView[];
  nextAssignments: ManagerSelectedPersonAssignmentView[];
  issues: IssueRowView[];
  duties: ManagerDutyRowView[];
  absences: ManagerAbsenceRowView[];
}

const SEVERITY_GROUP_ORDER: IssueSeverity[] = ["critical", "review", "info"];

/**
 * The manager's focused drill-down for one person (PR #14 §28-30) --
 * reuses the shared `IssueSeverityGroup`/`IssueRowView` presentation
 * (`@/components/issues`) also used by the manager's everyone-wide "דורש
 * טיפול" section, since the selected person's issues come from the SAME
 * `buildPersonalScheduleReadModel()` output, not a reimplementation. This
 * is a manager INSPECTION scope only -- never impersonation; the manager's
 * own identity never changes.
 */
export function ManagerSelectedPersonView({
  personId,
  person,
  avatarUrl,
  currentAssignments,
  nextAssignments,
  issues,
  duties,
  absences,
}: ManagerSelectedPersonViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={person.name} size="md" avatarUrl={avatarUrl} />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold text-foreground">מבט על {person.name}</h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {person.isManager ? <RoleBadge label="מנהל/ת" /> : null}
              {person.isSupervisor ? <RoleBadge label='אחמ"ש' /> : null}
              {person.isTechnician ? <RoleBadge label="טכנאי" /> : null}
            </div>
          </div>
        </div>

        {/* A gateway into the two existing detailed views this drill-down
            deliberately never reproduces -- the person's real calendar
            (the manager-only `/schedule?person=` perspective) and their
            Fairness standing (`/fairness?person=`, already a real deep
            link). Neither fetches anything extra here; both are plain
            navigation into already-built routes. */}
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            href={schedulePersonHref({ personId })}
            className="inline-flex items-center gap-1 rounded-full bg-overlay-soft px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-overlay-strong"
          >
            לוח מלא ←
          </Link>
          <Link
            href={fairnessShiftsHref({ personId })}
            className="inline-flex items-center gap-1 rounded-full bg-overlay-soft px-3 py-1.5 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-overlay-strong"
          >
            מצב הוגנות ←
          </Link>
        </div>
      </div>

      {currentAssignments.length > 0 ? (
        <Panel variant="hero">
          <h3 className="text-sm font-semibold text-muted">עכשיו</h3>
          <div className="mt-2 space-y-1.5">
            {currentAssignments.map((view) => (
              <p key={view.key} className="text-sm text-foreground">
                {view.emoji ? <span aria-hidden="true">{view.emoji} </span> : null}
                {view.title} · <span className="text-muted">{view.dateLabel}</span>
              </p>
            ))}
          </div>
        </Panel>
      ) : null}

      {nextAssignments.length > 0 ? (
        <Panel variant="panel">
          <h3 className="text-sm font-semibold text-muted">הבא בתור</h3>
          <div className="mt-2 space-y-1.5">
            {nextAssignments.map((view) => (
              <p key={view.key} className="text-sm text-foreground">
                {view.emoji ? <span aria-hidden="true">{view.emoji} </span> : null}
                {view.title} · <span className="text-muted">{view.dateLabel}</span>
              </p>
            ))}
          </div>
        </Panel>
      ) : null}

      {currentAssignments.length === 0 && nextAssignments.length === 0 ? (
        <Panel variant="compact" className="text-sm text-muted">
          אין שיבוצים קרובים לאדם זה.
        </Panel>
      ) : null}

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">בעיות ובדיקות</h3>
        {issues.length === 0 ? (
          <Panel variant="compact" className="text-sm text-muted">
            לא נמצאו בעיות פתוחות.
          </Panel>
        ) : (
          <div className="flex flex-col gap-3">
            {SEVERITY_GROUP_ORDER.map((severity) => (
              <IssueSeverityGroup
                key={severity}
                severity={severity}
                views={issues.filter((view) => view.severity === severity)}
              />
            ))}
          </div>
        )}
      </div>

      {duties.length > 0 || absences.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {duties.length > 0 ? (
            <Panel variant="panel">
              <h3 className="text-sm font-semibold text-foreground">תורנויות בטווח</h3>
              <ul className="mt-2 divide-y divide-border">
                {duties.map((duty) => (
                  <li key={duty.key} className="flex items-center gap-2 py-2 text-sm">
                    {duty.emoji ? <span aria-hidden="true">{duty.emoji}</span> : null}
                    <span className="min-w-0 flex-1 truncate text-foreground">{duty.title}</span>
                    <span className="shrink-0 text-xs text-muted-2">{duty.dateLabel}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {absences.length > 0 ? (
            <Panel variant="panel">
              <h3 className="text-sm font-semibold text-foreground">היעדרויות בטווח</h3>
              <ul className="mt-2 divide-y divide-border">
                {absences.map((absence) => (
                  <li key={absence.key} className="flex items-center gap-2 py-2 text-sm">
                    {absence.emoji ? <span aria-hidden="true">{absence.emoji}</span> : null}
                    <span className="min-w-0 flex-1 truncate text-foreground">{absence.label}</span>
                    <span className="shrink-0 text-xs text-muted-2">{absence.dateLabel}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RoleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-muted">
      {label}
    </span>
  );
}
