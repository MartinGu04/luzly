import { Panel } from "@/components/ui/Panel";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";

interface EmergencyPersonalScheduleListProps {
  shifts: EmergencyPersonalShiftEntry[];
  emptyStateName: string | null;
}

const PERIOD_LABEL: Record<"day" | "night", string> = { day: "יום", night: "לילה" };

/**
 * "self"/"person" Emergency Mode schedule presentation (spec section
 * 10) -- every emergency shift the viewed person is assigned to, each
 * with their own desk(s) and who else shares that date+period. No
 * regular role-coverage algorithm anywhere here.
 */
export function EmergencyPersonalScheduleList({ shifts, emptyStateName }: EmergencyPersonalScheduleListProps) {
  if (shifts.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        {emptyStateName ? `אין ל${emptyStateName} משמרות חירום ידועות.` : "אין משמרות חירום ידועות."}
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="emergency-personal-schedule-list">
      {shifts.map((shift) => (
        <Panel key={`${shift.date}|${shift.period}`} variant="compact">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{formatHebrewWeekdayAndDate(shift.date)}</p>
            <p className="text-sm text-muted">משמרת {PERIOD_LABEL[shift.period]}</p>
          </div>
          <p className="mt-1 text-sm font-medium text-primary">
            דסק{shift.ownDesks.length > 1 ? "ים" : ""}: {shift.ownDesks.join(", ")}
          </p>

          {shift.roster.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {shift.roster.map((entry, index) => (
                <li
                  key={`${entry.personId ?? "unresolved"}-${index}`}
                  className="flex items-center justify-between gap-3 text-xs text-muted"
                >
                  <span className="min-w-0 truncate">{entry.personName}</span>
                  <span className="shrink-0">{entry.desk}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>
      ))}
    </div>
  );
}
