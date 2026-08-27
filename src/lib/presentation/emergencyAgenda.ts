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
