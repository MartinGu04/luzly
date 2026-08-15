import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { MonthNav } from "@/components/schedule/MonthNav";
import { ScheduleCalendar } from "@/components/schedule/ScheduleCalendar";
import { ScheduleEveryoneCalendar } from "@/components/schedule/ScheduleEveryoneCalendar";
import { ScheduleHeader } from "@/components/schedule/ScheduleHeader";
import { ScheduleManagerSelector } from "@/components/schedule/ScheduleManagerSelector";
import type { DayMeta } from "@/components/schedule/types";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import { Panel } from "@/components/ui/Panel";
import {
  buildMonthGrid,
  calendarMonthOfLocalNow,
  formatMonthParam,
  parseMonthParam,
  shiftCalendarMonth,
  type CalendarMonthKey,
} from "@/lib/domain/calendarMonth";
import { formatHebrewCalendarDate, formatHebrewMonthRange, getHolidayContext } from "@/lib/presentation/hebrewCalendar";
import { formatHebrewMonthYear, formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import { buildScheduleEveryoneDayViews } from "@/lib/presentation/scheduleEveryone";
import { getRequestSchedule } from "@/lib/readModels/getRequestSchedule";
import type { SchedulePerspective } from "@/lib/readModels/scheduleTypes";
import type { PersonalEventView } from "@/lib/readModels/types";

function buildDayMeta(date: string, todayDate: string): DayMeta {
  const day = Number(date.slice(8, 10));
  const gregorianLabel = formatHebrewWeekdayAndDate(date);
  const hebrewCalendarLabel = formatHebrewCalendarDate(date);
  const dateLabel = [gregorianLabel, hebrewCalendarLabel].filter(Boolean).join(" · ");

  return {
    date,
    dayNumber: day,
    isToday: date === todayDate,
    isPast: date < todayDate,
    dateLabel,
    holiday: getHolidayContext(date),
  };
}

type SearchParamValue = string | string[] | undefined;

interface SchedulePageProps {
  searchParams: Promise<{ month?: SearchParamValue; person?: SearchParamValue }>;
}

function firstParam(value: SearchParamValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Builds a `/schedule` URL preserving both `month` and the manager
 * perspective (PR #24 §8/§29) -- self mode omits `person` entirely rather
 * than writing `person=self` (the URL contract's preferred self shape).
 * `monthKey: null` omits `month` too, resolving through the page's own
 * Jerusalem-local "today" fallback -- exactly what `todayHref` needs so
 * "today" never resets the selected perspective.
 */
function scheduleHref(
  monthKey: CalendarMonthKey | null,
  perspective: SchedulePerspective,
  selectedPersonId: string | null,
): string {
  const params = new URLSearchParams();
  if (monthKey) params.set("month", formatMonthParam(monthKey));
  if (perspective === "all") params.set("person", "all");
  else if (perspective === "person" && selectedPersonId) params.set("person", selectedPersonId);

  const query = params.toString();
  return query ? `/schedule?${query}` : "/schedule";
}

/**
 * The Schedule page -- "לוח משמרות" (PR #24). For a normal user this is
 * still exactly the personal shift calendar it always was: `model.manager`
 * is always null, `model.perspective` is always "self", and no manager UI
 * ever renders, no matter what `?person=` the URL carries (the server-side
 * floor lives in `getRequestSchedule` and its orchestration layer, never here).
 *
 * For an authorized manager, `getRequestSchedule` additionally resolves
 * which of the three perspectives (self / everyone / one person) to show,
 * already fail-closed-validated against the manager's own authorized
 * roster -- this page never re-validates `?person=` itself. "self" and
 * "person" both reuse the exact same `ScheduleCalendar` the normal
 * personal experience uses (never a separate "manager calendar"); "all"
 * renders the dedicated team-staffing `ScheduleEveryoneCalendar` instead,
 * since "who staffs day/night" is a different question than "what are
 * MY shifts" (PR #24 §14).
 */
export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const params = await searchParams;
  const rawMonth = firstParam(params.month) ?? null;
  const rawPerson = firstParam(params.person) ?? null;

  const result = await getRequestSchedule(rawMonth, rawPerson);
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;

  const currentMonthKey = calendarMonthOfLocalNow(model.localNow);
  const displayMonthKey = parseMonthParam(rawMonth) ?? currentMonthKey;
  const monthParam = formatMonthParam(displayMonthKey);

  const grid = buildMonthGrid(displayMonthKey.year, displayMonthKey.month);
  const inMonthDates = grid.filter((cell): cell is string => cell !== null);

  const days: Record<string, DayMeta> = {};
  for (const date of inMonthDates) {
    days[date] = buildDayMeta(date, model.localNow.date);
  }

  const isOnCurrentMonth = displayMonthKey.year === currentMonthKey.year && displayMonthKey.month === currentMonthKey.month;
  const prevMonthKey = shiftCalendarMonth(displayMonthKey, -1);
  const nextMonthKey = shiftCalendarMonth(displayMonthKey, 1);

  const prevHref = scheduleHref(prevMonthKey, model.perspective, model.selectedPersonId);
  const nextHref = scheduleHref(nextMonthKey, model.perspective, model.selectedPersonId);
  const todayHref = scheduleHref(null, model.perspective, model.selectedPersonId);

  const defaultSelectedDate = days[model.localNow.date] ? model.localNow.date : (inMonthDates[0] ?? null);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ScheduleHeader
          monthLabel={formatHebrewMonthYear(displayMonthKey.year, displayMonthKey.month)}
          monthRangeSubtitle={formatHebrewMonthRange(displayMonthKey.year, displayMonthKey.month)}
        />
        <MonthNav prevHref={prevHref} nextHref={nextHref} todayHref={todayHref} isOnCurrentMonth={isOnCurrentMonth} />
      </div>

      {model.manager ? (
        <ScheduleManagerSelector
          managerName={model.manager.name}
          people={model.roster}
          perspective={model.perspective}
          selectedPersonId={model.selectedPersonId}
        />
      ) : null}

      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      {model.perspective === "all" && model.everyone ? (
        <ScheduleEveryoneCalendar
          key={monthParam}
          grid={grid}
          days={days}
          dayViews={buildScheduleEveryoneDayViews(
            inMonthDates,
            model.everyone.staffing,
            model.everyone.duties,
            model.everyone.absences,
          )}
          defaultSelectedDate={defaultSelectedDate}
        />
      ) : model.personal ? (
        <PersonalPerspective
          monthParam={monthParam}
          grid={grid}
          days={days}
          defaultSelectedDate={defaultSelectedDate}
          monthEvents={model.personal.shiftCalendarEvents.filter((event) => event.date.startsWith(`${monthParam}-`))}
          activeShiftDates={model.personal.currentAssignments
            .filter((assignment) => assignment.category === "shift")
            .map((assignment) => assignment.date)}
          emptyStateName={model.perspective === "person" ? model.selectedPersonName : null}
        />
      ) : null}
    </div>
  );
}

interface PersonalPerspectiveProps {
  monthParam: string;
  grid: (string | null)[];
  days: Record<string, DayMeta>;
  defaultSelectedDate: string | null;
  monthEvents: PersonalEventView[];
  activeShiftDates: string[];
  /** Set only for perspective "person" -- the selected colleague's name, used for the empty-month message (PR #24 §12). Null for "self" (a manager viewing their own empty month is not a noteworthy state). */
  emptyStateName: string | null;
}

/**
 * "self"/"person" perspectives -- byte-for-byte the same
 * `ScheduleCalendar` the normal personal experience renders (PR #24 §13),
 * with one addition: a calm contextual note (never a full-screen empty
 * state -- the calendar itself stays useful for dates/holidays) when a
 * selected colleague has no shifts this month at all.
 */
function PersonalPerspective({
  monthParam,
  grid,
  days,
  defaultSelectedDate,
  monthEvents,
  activeShiftDates,
  emptyStateName,
}: PersonalPerspectiveProps) {
  const showEmptyNote = emptyStateName !== null && monthEvents.length === 0;

  return (
    <>
      {showEmptyNote ? (
        <Panel variant="compact" className="text-sm text-muted">
          אין ל{emptyStateName} משמרות בתקופה הזו
        </Panel>
      ) : null}
      <ScheduleCalendar
        key={monthParam}
        grid={grid}
        days={days}
        monthEvents={monthEvents}
        defaultSelectedDate={defaultSelectedDate}
        activeShiftDates={activeShiftDates}
      />
    </>
  );
}
