import { Header } from "@/components/dashboard/Header";
import { EmergencyEveryoneScheduleList } from "@/components/schedule/EmergencyEveryoneScheduleList";
import { Panel } from "@/components/ui/Panel";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import type { LocalNow } from "@/lib/domain/localNow";
import type { EmergencyEveryoneShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";

interface PermanentManagerEmergencyHomeProps {
  personName: string;
  localNow: LocalNow;
  fetchedAt: string;
  everyoneShifts: EmergencyEveryoneShiftEntry[];
  diagnosticsCount: number;
}

/**
 * The permanent-manager Home surface while Emergency Mode is active
 * (spec section 13/14) -- replaces the department-wide REGULAR shift
 * snapshot (`PermanentManagerHome`'s previous/current/next
 * `ShiftSnapshotCard` row + `TodayOperationalContext` duties/absences)
 * with the SAME desk-based staffing view Manager Area's own Emergency
 * Mode branch already shows (`EmergencyEveryoneScheduleList`), reusing
 * that exact component rather than a second desk-staffing presentation.
 * "דוח 1 למחר"/setup-card content is deliberately omitted here -- both
 * are regular-schedule-derived and must never render as current
 * operational truth while Emergency Mode is active (spec section 4/29).
 */
export function PermanentManagerEmergencyHome({
  personName,
  localNow,
  fetchedAt,
  everyoneShifts,
  diagnosticsCount,
}: PermanentManagerEmergencyHomeProps) {
  return (
    <div className="flex flex-col gap-4" data-testid="permanent-manager-emergency-home">
      <Header personName={personName} localNow={localNow} />
      <DataFreshnessStatus fetchedAt={fetchedAt} className="w-fit" />

      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground sm:text-xl">איוש הדסקים -- מצב חירום</h2>
        <EmergencyEveryoneScheduleList shifts={everyoneShifts} />
      </div>

      {diagnosticsCount > 0 ? (
        <Panel variant="compact" className="text-xs text-muted">
          קיימות {diagnosticsCount} בעיות בנתוני סידור החירום -- כדאי לבדוק את גיליון החירום.
        </Panel>
      ) : null}
    </div>
  );
}
