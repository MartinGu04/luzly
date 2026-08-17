import { Panel } from "@/components/ui/Panel";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import { dutyBlockEmoji, dutyBlockTitle } from "@/lib/presentation/duty";
import { absenceKindLabel } from "@/lib/presentation/labels";
import type { PermanentManagerHomeAbsence, PermanentManagerHomeDuty } from "@/lib/readModels/permanentManagerHomeTypes";

interface TodayOperationalContextProps {
  duties: PermanentManagerHomeDuty[];
  absences: PermanentManagerHomeAbsence[];
}

function DutyRow({ duty }: { duty: PermanentManagerHomeDuty }) {
  const emoji = dutyBlockEmoji(duty);
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      {emoji ? (
        <span aria-hidden="true" className="shrink-0">
          {emoji}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-foreground">{dutyBlockTitle(duty)}</span>
      <span className="shrink-0 text-xs text-muted">{duty.personName}</span>
    </li>
  );
}

function AbsenceRow({ absence }: { absence: PermanentManagerHomeAbsence }) {
  const emoji = assignmentEmoji({ category: "absence", period: "unspecified", dutyFamily: null, absenceKind: absence.absenceKind });
  return (
    <li className="flex items-center gap-2 py-2 text-sm">
      {emoji ? (
        <span aria-hidden="true" className="shrink-0">
          {emoji}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate text-foreground">{absence.personName}</span>
      <span className="shrink-0 text-xs text-muted">{absenceKindLabel(absence.absenceKind)}</span>
    </li>
  );
}

/**
 * "תורנויות היום" / "היעדרויות היום" -- a compact secondary section, TODAY
 * only. Deliberately smaller/quieter than the shift snapshot above it (see
 * `PermanentManagerHome`'s layout weighting) -- this answers "who's on duty
 * / not available today", never "who's here right now" (see this feature's
 * truthful-language rule: the schedule, not physical presence).
 */
export function TodayOperationalContext({ duties, absences }: TodayOperationalContextProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Panel variant="compact">
        <h3 className="text-sm font-bold text-foreground">תורנויות היום</h3>
        {duties.length === 0 ? (
          <p className="mt-2 text-sm text-muted">אין תורנויות היום.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {duties.map((duty, index) => (
              <DutyRow key={`${duty.personId}-${duty.dutyFamily}-${duty.slot ?? "x"}-${index}`} duty={duty} />
            ))}
          </ul>
        )}
      </Panel>

      <Panel variant="compact">
        <h3 className="text-sm font-bold text-foreground">היעדרויות היום</h3>
        {absences.length === 0 ? (
          <p className="mt-2 text-sm text-muted">אין היעדרויות היום.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {absences.map((absence, index) => (
              <AbsenceRow key={`${absence.personId}-${absence.absenceKind}-${index}`} absence={absence} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
