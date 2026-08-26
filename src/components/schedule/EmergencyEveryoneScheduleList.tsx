import { Panel } from "@/components/ui/Panel";
import { formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import type { EmergencyEveryoneShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";

interface EmergencyEveryoneScheduleListProps {
  shifts: EmergencyEveryoneShiftEntry[];
}

const PERIOD_LABEL: Record<"day" | "night", string> = { day: "יום", night: "לילה" };

/**
 * "all" perspective's team staffing presentation for Emergency Mode
 * (spec section 10/11) -- day/night -> desks -> assigned people, never
 * regular role coverage. Every one of the ten canonical desks always
 * renders; a blank one shows as unstaffed, never a fabricated
 * "coverage gap" verdict (no business rule in this app says every desk
 * is mandatory).
 */
export function EmergencyEveryoneScheduleList({ shifts }: EmergencyEveryoneScheduleListProps) {
  if (shifts.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        אין נתוני שיבוץ חירום לתקופה זו.
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="emergency-everyone-schedule-list">
      {shifts.map((shift) => (
        <Panel key={`${shift.date}|${shift.period}`} variant="compact">
          <p className="text-sm font-semibold text-foreground">
            {formatHebrewWeekdayAndDate(shift.date)} · משמרת {PERIOD_LABEL[shift.period]}
          </p>
          <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {shift.desks.map((slot) => (
              <li
                key={slot.desk}
                className="flex items-center justify-between gap-3 rounded-lg bg-overlay-faint px-3 py-1.5 text-xs ring-1 ring-border"
              >
                <span className="min-w-0 truncate font-medium text-foreground">{slot.desk}</span>
                <span className={`shrink-0 ${slot.personName ? "text-muted" : "text-warning"}`}>
                  {slot.personName ?? "לא מאויש"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ))}
    </div>
  );
}
