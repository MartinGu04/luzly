import { addCalendarDays, formatCalendarDate } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { LocalNow } from "@/lib/domain/localNow";
import type { EmergencyPersonalShiftEntry } from "@/lib/readModels/emergencyScheduleTypes";

/** One date's worth of emergency shift entries -- almost always exactly one (a person is rarely on both day AND night the same date), but never assumed to be. */
export interface EmergencyAgendaDayGroup {
  date: string;
  shifts: EmergencyPersonalShiftEntry[];
}

/**
 * `/schedule`'s Emergency Mode "self"/"person" agenda, split by "today"
 * (spec: "default focus should be current/upcoming schedule, not old
 * historical months" -- the emergency workbook's own `EmergencyPersonalShiftEntry[]`
 * is unscoped by month/period and can legitimately span back to whenever
 * the workbook's own history starts, e.g. a February the emergency period
 * itself never touched). `upcoming` (today or later) is what the default
 * view leads with; `past` (strictly before today) stays fully reachable,
 * never discarded, just never the FIRST thing shown.
 */
export interface EmergencyPersonalAgenda {
  upcoming: EmergencyAgendaDayGroup[];
  past: EmergencyAgendaDayGroup[];
}

const PERIOD_ORDER: Record<"day" | "night", number> = { day: 0, night: 1 };

/** Date ascending, day before night within a date -- the same chronological order `groupEmergencyAssignmentsIntoShifts` already produces upstream; re-sorting here is a defensive presentation-layer convenience, not a re-implementation of that domain grouping, which stays entirely untouched (this module never re-derives `ownDesks`/`roster`). */
function compareShiftEntries(a: EmergencyPersonalShiftEntry, b: EmergencyPersonalShiftEntry): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period];
}

/**
 * Groups an already-flat list of per-(date,period) shift entries into one
 * agenda entry per DATE, then splits those date-groups into `upcoming`
 * (`date >= todayDate`) and `past` (`date < todayDate`) -- both halves stay
 * chronologically ascending, so `upcoming[0]` is always the soonest
 * relevant shift and `past` reads oldest-to-most-recent. Pure/deterministic,
 * no clock access -- `todayDate` is always caller-supplied (the read
 * model's own `localNow.date`), never derived here.
 *
 * `EmergencyPersonalShiftEntry.ownDesks: []` (the viewed person has zero
 * desk assignments on that date+period -- `buildEmergencyScheduleReadModel`
 * builds one entry per RECORDED date+period in the whole emergency
 * workbook, not only the ones the viewed person is actually on) is
 * filtered out here, a presentation-only decision: "הלוח שלי" shows this
 * person's OWN shifts, never a date+period they had no part in merely
 * because someone else was staffed that shift. The underlying read model
 * is never touched or re-shaped -- this only decides what a personal
 * agenda displays.
 */
export function buildEmergencyPersonalAgenda(
  shifts: readonly EmergencyPersonalShiftEntry[],
  todayDate: string,
): EmergencyPersonalAgenda {
  const ownShifts = shifts.filter((shift) => shift.ownDesks.length > 0);
  const sorted = [...ownShifts].sort(compareShiftEntries);

  const groupsByDate = new Map<string, EmergencyPersonalShiftEntry[]>();
  for (const shift of sorted) {
    const bucket = groupsByDate.get(shift.date);
    if (bucket) bucket.push(shift);
    else groupsByDate.set(shift.date, [shift]);
  }

  const upcoming: EmergencyAgendaDayGroup[] = [];
  const past: EmergencyAgendaDayGroup[] = [];
  for (const [date, dateShifts] of groupsByDate) {
    const group: EmergencyAgendaDayGroup = { date, shifts: dateShifts };
    (date < todayDate ? past : upcoming).push(group);
  }

  return { upcoming, past };
}

// ---------------------------------------------------------------------------
// Date-range selector -- "היום | מחר | 7 ימים | 30 יום" (mirrors the visual
// language and strict-allowlist-with-default parsing convention of
// `ManagerRangeSelector`/`ManagerRangeKey`/`parseManagerRangeParam`,
// lib/domain/dateRange.ts -- but kept entirely LOCAL to Emergency Mode
// rather than extending that shared file, which fairness/notifications
// code also imports and this task must never touch). Applies ONLY to the
// current/upcoming agenda -- `past`/history is a completely separate
// concern (see `buildEmergencyPersonalAgenda` above) and is never
// filtered by this range.
// ---------------------------------------------------------------------------

export type EmergencyScheduleRangeKey = "today" | "tomorrow" | "7d" | "30d";

const VALID_RANGE_KEYS: ReadonlySet<string> = new Set(["today", "tomorrow", "7d", "30d"]);

/** Product default -- a person opening their emergency schedule should land on a full upcoming week, never just today alone nor the noisier 30-day view. */
export const DEFAULT_EMERGENCY_SCHEDULE_RANGE: EmergencyScheduleRangeKey = "7d";

/** Strict allowlist parse of the `?range=` query param -- anything else (including missing/invalid) falls back to the 7-day default, same fail-safe convention as `parseManagerRangeParam`. */
export function parseEmergencyScheduleRangeParam(raw: string | null | undefined): EmergencyScheduleRangeKey {
  if (raw !== null && raw !== undefined && VALID_RANGE_KEYS.has(raw)) {
    return raw as EmergencyScheduleRangeKey;
  }
  return DEFAULT_EMERGENCY_SCHEDULE_RANGE;
}

const FIXED_RANGE_DAY_COUNTS: Record<EmergencyScheduleRangeKey, number> = {
  today: 1,
  tomorrow: 1,
  "7d": 7,
  "30d": 30,
};

/**
 * Resolves a `EmergencyScheduleRangeKey` against `localNow` into the
 * concrete list of civil dates it covers -- "today"/"tomorrow" are each a
 * single date, "7d"/"30d" are `localNow.date` plus the next 6/29 civil
 * dates (today itself always included, per spec: "7 ימים -> today + the
 * next 7 calendar days"). Pure day-math, no `Date`/UTC -- reuses the SAME
 * `addCalendarDays`/`formatCalendarDate` primitives `resolveManagerDateRange`
 * (`lib/domain/dateRange.ts`) already uses for its own "today"/"7d"/"30d"
 * options, imported read-only rather than duplicating that arithmetic, but
 * computed independently since that file's `ManagerRangeKey` has no
 * "tomorrow" option and this task must not extend a file
 * fairness/notifications code also depends on.
 */
export function resolveEmergencyScheduleRangeDates(key: EmergencyScheduleRangeKey, localNow: LocalNow): string[] {
  const today = parseCalendarDate(localNow.date);
  if (!today) return [localNow.date];

  if (key === "tomorrow") return [formatCalendarDate(addCalendarDays(today, 1))];

  const count = FIXED_RANGE_DAY_COUNTS[key];
  const dates: string[] = [];
  for (let i = 0; i < count; i++) dates.push(formatCalendarDate(addCalendarDays(today, i)));
  return dates;
}

/** Narrows already-grouped date-groups down to the ones whose date falls inside `dates` -- preserves the input's own chronological order, never re-sorts. */
function filterAgendaGroupsByDates(
  groups: readonly EmergencyAgendaDayGroup[],
  dates: readonly string[],
): EmergencyAgendaDayGroup[] {
  const dateSet = new Set(dates);
  return groups.filter((group) => dateSet.has(group.date));
}

/** The fully-resolved view `EmergencyPersonalScheduleList` renders: `current` is the selected range's own date-groups (chronological), `past` is the FULL history regardless of range (collapsed/secondary, per spec -- the range selector never touches it). */
export interface EmergencyScheduleAgendaView {
  range: EmergencyScheduleRangeKey;
  rangeDates: string[];
  current: EmergencyAgendaDayGroup[];
  past: EmergencyAgendaDayGroup[];
}

/**
 * The one function `EmergencyPersonalScheduleList` calls to go from raw
 * `EmergencyPersonalShiftEntry[]` + a selected range straight to what it
 * renders -- composes `buildEmergencyPersonalAgenda` (own-shifts-only,
 * today-vs-past split) with `resolveEmergencyScheduleRangeDates` +
 * `filterAgendaGroupsByDates` (narrowing `upcoming` to the selected
 * window). `past` is deliberately the UNFILTERED full history from
 * `buildEmergencyPersonalAgenda` -- the range selector's own semantics
 * ("today + upcoming N days") only ever describe a forward-looking
 * window, so applying it to history would be meaningless; history has
 * its own, separate "collapsed by default" treatment instead.
 */
export function buildEmergencyScheduleAgendaView(
  shifts: readonly EmergencyPersonalShiftEntry[],
  range: EmergencyScheduleRangeKey,
  localNow: LocalNow,
): EmergencyScheduleAgendaView {
  const agenda = buildEmergencyPersonalAgenda(shifts, localNow.date);
  const rangeDates = resolveEmergencyScheduleRangeDates(range, localNow);
  return { range, rangeDates, current: filterAgendaGroupsByDates(agenda.upcoming, rangeDates), past: agenda.past };
}
