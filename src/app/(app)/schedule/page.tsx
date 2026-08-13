import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { MonthNav } from "@/components/schedule/MonthNav";
import { ScheduleCalendar } from "@/components/schedule/ScheduleCalendar";
import { ScheduleHeader } from "@/components/schedule/ScheduleHeader";
import type { DayMeta } from "@/components/schedule/types";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import {
  buildMonthGrid,
  formatMonthParam,
  parseMonthParam,
  shiftCalendarMonth,
  type CalendarMonthKey,
} from "@/lib/domain/calendarMonth";
import { formatHebrewCalendarDate, formatHebrewMonthRange, getHolidayContext } from "@/lib/presentation/hebrewCalendar";
import { formatHebrewMonthYear, formatHebrewWeekdayAndDate } from "@/lib/presentation/hebrewDate";
import type { LocalNow } from "@/lib/domain/localNow";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import type { PersonalEventView } from "@/lib/readModels/types";

/** "YYYY-MM" of a "YYYY-MM-DD" LocalNow date -- the month a request's own local date falls in, used both as the default display month and as the "today" navigation target. */
function monthKeyOf(localNow: LocalNow): CalendarMonthKey {
  const [year, month] = localNow.date.split("-").map(Number);
  return { year, month };
}

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

interface SchedulePageProps {
  searchParams: Promise<{ month?: string | string[] }>;
}

/**
 * The authenticated person's own personal shift calendar. By the time this
 * renders, the protected `(app)` layout has already gated everything but
 * "ok"/"configuration_error" -- same convention as the dashboard page.
 * Calling `getRequestPersonalSchedule()` again reuses the SAME
 * request-scoped result the layout already computed; no second Google
 * request. Never sends `PersonalScheduleReadModel` itself to a Client
 * Component -- only this month's already-safe `shiftCalendarEvents` and
 * presentation-safe calendar metadata reach `ScheduleCalendar`.
 */
export default async function SchedulePage({ searchParams }: SchedulePageProps) {
  const result = await getRequestPersonalSchedule();
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;
  const currentMonthKey = monthKeyOf(model.localNow);

  const params = await searchParams;
  const rawMonth = Array.isArray(params.month) ? params.month[0] : params.month;
  const displayMonthKey = parseMonthParam(rawMonth) ?? currentMonthKey;

  const monthParam = formatMonthParam(displayMonthKey);
  const grid = buildMonthGrid(displayMonthKey.year, displayMonthKey.month);
  const inMonthDates = grid.filter((cell): cell is string => cell !== null);

  const days: Record<string, DayMeta> = {};
  for (const date of inMonthDates) {
    days[date] = buildDayMeta(date, model.localNow.date);
  }

  const monthEvents: PersonalEventView[] = model.shiftCalendarEvents.filter((event) =>
    event.date.startsWith(`${monthParam}-`),
  );

  /**
   * The Event *dates* of every currently-running personal shift -- not
   * necessarily `localNow.date` itself. An overnight shift still active
   * after midnight keeps its own (now-yesterday) Event date, so the "live"
   * calendar accent belongs on that date, never smeared onto today's cell.
   */
  const activeShiftDates = model.currentAssignments
    .filter((assignment) => assignment.category === "shift")
    .map((assignment) => assignment.date);

  const defaultSelectedDate = days[model.localNow.date] ? model.localNow.date : (inMonthDates[0] ?? null);

  const isOnCurrentMonth = displayMonthKey.year === currentMonthKey.year && displayMonthKey.month === currentMonthKey.month;
  const prevMonthKey = shiftCalendarMonth(displayMonthKey, -1);
  const nextMonthKey = shiftCalendarMonth(displayMonthKey, 1);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ScheduleHeader
          monthLabel={formatHebrewMonthYear(displayMonthKey.year, displayMonthKey.month)}
          monthRangeSubtitle={formatHebrewMonthRange(displayMonthKey.year, displayMonthKey.month)}
        />
        <MonthNav
          prevHref={`/schedule?month=${formatMonthParam(prevMonthKey)}`}
          nextHref={`/schedule?month=${formatMonthParam(nextMonthKey)}`}
          todayHref="/schedule"
          isOnCurrentMonth={isOnCurrentMonth}
        />
      </div>

      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      <ScheduleCalendar
        key={monthParam}
        grid={grid}
        days={days}
        monthEvents={monthEvents}
        defaultSelectedDate={defaultSelectedDate}
        activeShiftDates={activeShiftDates}
      />
    </div>
  );
}
