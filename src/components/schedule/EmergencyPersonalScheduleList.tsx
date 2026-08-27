import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import { eventColorBgClassName } from "@/lib/presentation/eventColor";
import { buildEmergencyPersonalAgenda, type EmergencyAgendaDayGroup } from "@/lib/presentation/emergencyAgenda";
import { formatHebrewWeekdayAndDate, relativeDayLabel } from "@/lib/presentation/hebrewDate";
import { periodLabel } from "@/lib/presentation/labels";
import type { EmergencyPersonalShiftEntry, EmergencyScheduleRosterEntry } from "@/lib/readModels/emergencyScheduleTypes";

interface EmergencyPersonalScheduleListProps {
  shifts: EmergencyPersonalShiftEntry[];
  emptyStateName: string | null;
  /** The read model's own `localNow.date` -- "today" for splitting the agenda into upcoming (default focus) vs. past (reachable, never dominant). */
  todayDate: string;
}

/** At most this many "who else" names show inline per shift row before collapsing into a "+N" overflow -- same restrained-scanning idea as `CalendarGrid`'s own indicator overflow, applied to a roster instead of event indicators. */
const MAX_VISIBLE_ROSTER = 4;

function formatOwnDesks(desks: readonly string[]): string {
  return `דסק${desks.length > 1 ? "ים" : ""}: ${desks.join(", ")}`;
}

function formatRosterSummary(roster: readonly EmergencyScheduleRosterEntry[]): string {
  const visible = roster.slice(0, MAX_VISIBLE_ROSTER);
  const overflow = roster.length - visible.length;
  const names = visible.map((entry) => `${entry.personName} (${entry.desk})`).join(", ");
  return overflow > 0 ? `${names} · ‎+${overflow}` : names;
}

/**
 * One compact date+period row -- reuses the SAME period emoji/label/color
 * mapping "הלוח שלי"'s own regular calendar uses for a shift Event
 * (`assignmentEmoji`/`periodLabel`/`eventColorBgClassName`), constructed
 * from just `category: "shift"` + the emergency period (day/night is the
 * only emergency shift concept, so `dutyFamily`/`absenceKind` are always
 * `null`) -- never a second, emergency-specific color/emoji mapping.
 * `ownDesks` already carries every desk this person holds for this exact
 * date+period (grouped upstream by `buildEmergencyScheduleReadModel`,
 * never re-derived here), so a multi-desk assignment stays one row, one
 * line -- never split across rows.
 */
function ShiftRow({ shift }: { shift: EmergencyPersonalShiftEntry }) {
  const shiftColorInput = { category: "shift" as const, period: shift.period, dutyFamily: null, absenceKind: null };
  const emoji = assignmentEmoji(shiftColorInput);
  const label = periodLabel(shift.period) ?? "משמרת";
  const colorClassName = eventColorBgClassName(shiftColorInput);

  return (
    <li
      data-testid="emergency-shift-row"
      className={`rounded-lg p-2.5 ring-1 ring-border ${colorClassName ?? "bg-overlay-faint"}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-muted" data-testid="emergency-shift-period">
          {emoji ? <span aria-hidden="true">{emoji}</span> : null}
          משמרת {label}
        </span>
        <span className="text-sm font-medium text-foreground">{formatOwnDesks(shift.ownDesks)}</span>
      </div>
      {shift.roster.length > 0 ? (
        <p className="mt-1 truncate text-xs text-muted-2">גם: {formatRosterSummary(shift.roster)}</p>
      ) : null}
    </li>
  );
}

/** One date heading plus its compact shift rows -- the agenda's own repeating unit, shared between the always-visible upcoming section and the collapsed history disclosure below. */
function DayGroupSection({ group, todayDate }: { group: EmergencyAgendaDayGroup; todayDate: string }) {
  const relDay = relativeDayLabel(group.date, todayDate);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-sm font-semibold ${relDay === "today" ? "text-primary" : "text-foreground"}`}>
          {formatHebrewWeekdayAndDate(group.date)}
        </p>
        {relDay === "today" ? <Badge tone="primary">היום</Badge> : relDay === "tomorrow" ? <Badge>מחר</Badge> : null}
      </div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {group.shifts.map((shift) => (
          <ShiftRow key={shift.period} shift={shift} />
        ))}
      </ul>
    </div>
  );
}

/**
 * "self"/"person" Emergency Mode schedule presentation (spec section
 * 10) -- a chronological calendar AGENDA (date heading, compact day/
 * night rows beneath it), matching the visual language of the regular
 * "הלוח שלי" personal calendar (`SelectedDayPanel`'s date-heading-then-
 * rows shape, the shared period emoji/color mapping, the "today"/"מחר"
 * badge convention from `Hero.tsx`) rather than one large stacked card
 * per assignment.
 *
 * Deliberately split into `upcoming` (today or later, always visible)
 * and `past` (collapsed behind a native `<details>` disclosure -- the
 * SAME collapsed-by-default pattern `ManagerAdoptionSection`'s own
 * "quiet" groups already use, no client JS needed) via
 * `buildEmergencyPersonalAgenda`: the emergency workbook's own
 * `shifts` array is unscoped by month and can legitimately reach back
 * to whenever its history starts, so the default view must never open
 * on old data (e.g. a February row) just because it exists -- history
 * stays fully reachable, just never the first thing shown.
 *
 * No parsing/domain change anywhere here -- `ownDesks` (multiple desks
 * for the same person/date/period already arrive pre-grouped into ONE
 * entry) and `roster` (who else shares that date+period) are both
 * exactly what `buildEmergencyScheduleReadModel` already computed;
 * this component only decides how to lay them out.
 */
export function EmergencyPersonalScheduleList({ shifts, emptyStateName, todayDate }: EmergencyPersonalScheduleListProps) {
  if (shifts.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        {emptyStateName ? `אין ל${emptyStateName} משמרות חירום ידועות.` : "אין משמרות חירום ידועות."}
      </Panel>
    );
  }

  const agenda = buildEmergencyPersonalAgenda(shifts, todayDate);

  return (
    <div className="flex flex-col gap-4" data-testid="emergency-personal-schedule-list">
      {agenda.upcoming.length > 0 ? (
        <div className="flex flex-col gap-3" data-testid="emergency-agenda-upcoming">
          {agenda.upcoming.map((group) => (
            <DayGroupSection key={group.date} group={group} todayDate={todayDate} />
          ))}
        </div>
      ) : (
        <Panel variant="compact" className="text-sm text-muted">
          {emptyStateName ? `אין ל${emptyStateName} משמרות חירום קרובות.` : "אין משמרות חירום קרובות."}
        </Panel>
      )}

      {agenda.past.length > 0 ? (
        <details data-testid="emergency-agenda-history">
          <summary className="cursor-pointer text-sm font-semibold text-muted-2">
            היסטוריה <span className="font-normal">· {agenda.past.length}</span>
          </summary>
          <div className="mt-3 flex flex-col gap-3">
            {agenda.past.map((group) => (
              <DayGroupSection key={group.date} group={group} todayDate={todayDate} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
