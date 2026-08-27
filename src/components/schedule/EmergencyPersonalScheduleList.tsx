import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import { eventColorBgClassName } from "@/lib/presentation/eventColor";
import {
  buildEmergencyScheduleAgendaView,
  type EmergencyAgendaDayGroup,
  type EmergencyScheduleRangeKey,
} from "@/lib/presentation/emergencyAgenda";
import { formatHebrewWeekdayAndDate, relativeDayLabel } from "@/lib/presentation/hebrewDate";
import { periodLabel } from "@/lib/presentation/labels";
import type { EmergencyShiftPeriod } from "@/lib/domain/emergencyShift";
import type { LocalNow } from "@/lib/domain/localNow";
import type { EmergencyPersonalShiftEntry, EmergencyScheduleRosterEntry } from "@/lib/readModels/emergencyScheduleTypes";

interface EmergencyPersonalScheduleListProps {
  shifts: EmergencyPersonalShiftEntry[];
  emptyStateName: string | null;
  /** The selected "היום | מחר | 7 ימים | 30 יום" window -- affects ONLY the current/upcoming grid below; `past`/history is always the full, unfiltered history regardless of this value. */
  range: EmergencyScheduleRangeKey;
  /** The read model's own `localNow` -- both "today" for the upcoming/past split and the anchor `resolveEmergencyScheduleRangeDates` resolves `range` against. */
  localNow: LocalNow;
}

/** Same responsive card-grid classes `ManagerCoverageSection`'s own per-date coverage grid uses for a fixed date range (today/7d/30d) -- one column on a narrow phone (comfortable, never a forced 7-column squeeze), growing to up to four as the viewport widens. Duplicated rather than imported for the same reason `EmergencyScheduleRangeSelector`'s `TAB_BASE` is -- a small literal string, not worth a cross-feature dependency on a Manager-only file. */
const DAY_CARD_GRID_CLASS = "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

/** At most this many "who else" names show inline per period column before collapsing into a "+N" overflow -- same restrained-scanning idea as `CalendarGrid`'s own indicator overflow, applied to a roster instead of event indicators. */
const MAX_VISIBLE_ROSTER = 4;

function formatOwnDesks(desks: readonly string[]): string {
  return `דסק${desks.length > 1 ? "ים" : ""}: ${desks.join(", ")}`;
}

/** "מי איתי" for this exact date+period -- who else the emergency roster recorded on this shift, straight from `EmergencyPersonalShiftEntry.roster` (never re-derived). */
function formatRosterSummary(roster: readonly EmergencyScheduleRosterEntry[]): string {
  const visible = roster.slice(0, MAX_VISIBLE_ROSTER);
  const overflow = roster.length - visible.length;
  const names = visible.map((entry) => `${entry.personName} (${entry.desk})`).join(", ");
  return overflow > 0 ? `${names} · ‎+${overflow}` : names;
}

/**
 * One date's ☀️יום/🌙לילה column, mirroring `ManagerCoverageSection`'s own
 * `PeriodColumn` shape (emoji+label header, content beneath, a calm "no
 * data" line when this person has nothing that period) -- reuses the SAME
 * period emoji/label/color mapping the regular "הלוח שלי" calendar uses
 * for a shift Event (`assignmentEmoji`/`periodLabel`/`eventColorBgClassName`,
 * constructed from `category: "shift"` + the emergency period; day/night is
 * the only emergency shift concept, so `dutyFamily`/`absenceKind` are
 * always `null`) -- never a second, emergency-specific color/emoji mapping.
 *
 * `shift` is `null` exactly when this person has no desk assignment for
 * this date+period -- `ownDesks` already carries EVERY desk they hold for
 * that exact date+period (grouped upstream by `buildEmergencyScheduleReadModel`,
 * never re-derived here), so a multi-desk assignment stays one column, one
 * line -- never split across several.
 */
function PeriodColumn({ period, shift }: { period: EmergencyShiftPeriod; shift: EmergencyPersonalShiftEntry | null }) {
  const shiftColorInput = { category: "shift" as const, period, dutyFamily: null, absenceKind: null };
  const emoji = assignmentEmoji(shiftColorInput);
  const label = periodLabel(period) ?? "משמרת";
  const colorClassName = eventColorBgClassName(shiftColorInput);

  return (
    <div
      data-testid={`emergency-period-column-${period}`}
      className={`min-w-0 flex-1 rounded-lg p-2 ${shift ? (colorClassName ?? "bg-overlay-faint") : ""}`}
    >
      <p className="flex items-center gap-1 text-[11px] font-medium text-muted-2">
        <span aria-hidden="true">{emoji}</span>
        {label}
      </p>
      {shift ? (
        <div className="mt-1.5 space-y-1">
          <p className="text-xs font-medium text-foreground">{formatOwnDesks(shift.ownDesks)}</p>
          {shift.roster.length > 0 ? <p className="truncate text-[11px] text-muted">גם: {formatRosterSummary(shift.roster)}</p> : null}
        </div>
      ) : (
        <p className="mt-1.5 text-[11px] text-muted-2">אין משמרת</p>
      )}
    </div>
  );
}

/**
 * One date's card -- day+night side by side in ONE Panel, the same "no
 * giant card per assignment" shape `ManagerCoverageSection`'s `DayCard`
 * already established for the regular schedule's own fixed-range
 * presentation. Shared by both the always-visible current-range grid and
 * the collapsed history disclosure below, so a past date reads exactly
 * like an upcoming one -- only its position (behind the disclosure) marks
 * it as history.
 */
function DayCard({ group, todayDate }: { group: EmergencyAgendaDayGroup; todayDate: string }) {
  const relDay = relativeDayLabel(group.date, todayDate);
  const dayShift = group.shifts.find((shift) => shift.period === "day") ?? null;
  const nightShift = group.shifts.find((shift) => shift.period === "night") ?? null;

  return (
    <Panel variant="panel" className="flex flex-col gap-2.5" data-testid="emergency-day-card">
      <div className="flex flex-wrap items-center gap-2">
        <p className={`text-sm font-semibold ${relDay === "today" ? "text-primary" : "text-foreground"}`}>
          {formatHebrewWeekdayAndDate(group.date)}
        </p>
        {relDay === "today" ? <Badge tone="primary">היום</Badge> : relDay === "tomorrow" ? <Badge>מחר</Badge> : null}
      </div>
      <div className="flex gap-3 border-t border-border pt-2.5">
        <PeriodColumn period="day" shift={dayShift} />
        <PeriodColumn period="night" shift={nightShift} />
      </div>
    </Panel>
  );
}

/**
 * "self"/"person" Emergency Mode schedule presentation (spec section 10)
 * -- a real calendar/schedule presentation modeled directly after the
 * regular schedule's own equivalent for a fixed date range
 * (`ManagerCoverageSection`'s responsive per-date card grid, day+night as
 * two columns inside ONE card), rather than a month-grid rebuild
 * (`CalendarGrid`) or a plain agenda list. `CalendarGrid`'s own primitives
 * (`chunkIntoWeeks`, Sunday-aligned week rows, the 42-cell month shape)
 * are structurally tied to a FULL Gregorian month -- they cannot represent
 * a rolling "today + N days" window that starts on an arbitrary weekday,
 * so this reuses the calendar system's other established pattern for
 * exactly that shape instead: `ManagerCoverageSection` already solves
 * "today/7d/30d range, day+night per date, responsive card grid" for the
 * regular schedule. The SAME responsive grid classes
 * (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4`) are reused
 * verbatim below -- one column on a narrow phone (comfortable, never a
 * forced desktop-width squeeze), growing on wider viewports, exactly
 * mirroring that section's own mobile/desktop behavior.
 *
 * The "היום | מחר | 7 ימים | 30 יום" range selector
 * (`EmergencyScheduleRangeSelector`, rendered by the caller above this
 * component) narrows `current` via `buildEmergencyScheduleAgendaView`;
 * `past` (history) is a SEPARATE, always-collapsed concern the range
 * never touches (spec: "the range selector applies only to
 * current/upcoming schedule") -- collapsed behind a native `<details>`
 * disclosure, the SAME pattern `ManagerAdoptionSection`'s own "quiet"
 * groups already use, no client JS needed. The emergency workbook's own
 * `shifts` array is unscoped by month and can legitimately reach back to
 * whenever its history starts, so the default view must never open on
 * old data (e.g. a February row) just because it exists.
 *
 * For a single selected date ("today"/"מחר") with nothing recorded, a
 * lone card still renders with a calm "אין משמרת" state in both period
 * columns (mirroring `SelectedDayPanel`'s own "היום פנוי אצלך" empty-day
 * treatment: the DATE remains the anchor, never a blank page) -- but a
 * multi-day range (7d/30d) with zero matches falls back to a plain empty
 * note instead of a wall of empty filler cards, since "my agenda" (unlike
 * `ManagerCoverageSection`'s team-wide coverage picture, where an empty
 * date is itself informative) should stay dense with real content, never
 * padded with days this person has no part in.
 *
 * No parsing/domain change anywhere here -- `ownDesks` (multiple desks
 * for the same person/date/period already arrive pre-grouped into ONE
 * entry) and `roster` ("מי איתי" -- who else shares that date+period) are
 * both exactly what `buildEmergencyScheduleReadModel` already computed;
 * this component only decides how to lay them out.
 */
export function EmergencyPersonalScheduleList({ shifts, emptyStateName, range, localNow }: EmergencyPersonalScheduleListProps) {
  if (shifts.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        {emptyStateName ? `אין ל${emptyStateName} משמרות חירום ידועות.` : "אין משמרות חירום ידועות."}
      </Panel>
    );
  }

  const view = buildEmergencyScheduleAgendaView(shifts, range, localNow);

  const isSingleDayRange = range === "today" || range === "tomorrow";
  const currentGroups: EmergencyAgendaDayGroup[] =
    view.current.length > 0 || !isSingleDayRange ? view.current : [{ date: view.rangeDates[0], shifts: [] }];

  return (
    <div className="flex flex-col gap-4" data-testid="emergency-personal-schedule-list">
      {currentGroups.length > 0 ? (
        <div className={DAY_CARD_GRID_CLASS} data-testid="emergency-agenda-current">
          {currentGroups.map((group) => (
            <DayCard key={group.date} group={group} todayDate={localNow.date} />
          ))}
        </div>
      ) : (
        <Panel variant="compact" className="text-sm text-muted">
          {emptyStateName ? `אין ל${emptyStateName} משמרות חירום בטווח שנבחר.` : "אין משמרות חירום בטווח שנבחר."}
        </Panel>
      )}

      {view.past.length > 0 ? (
        <details data-testid="emergency-agenda-history">
          <summary className="cursor-pointer text-sm font-semibold text-muted-2">
            היסטוריה <span className="font-normal">· {view.past.length}</span>
          </summary>
          <div className={`mt-3 ${DAY_CARD_GRID_CLASS}`}>
            {view.past.map((group) => (
              <DayCard key={group.date} group={group} todayDate={localNow.date} />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
