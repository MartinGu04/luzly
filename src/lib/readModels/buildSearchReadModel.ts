import { classifyAssignmentTemporalState } from "@/lib/domain/assignmentTemporalState";
import { addCalendarDays, formatCalendarDate, subtractCalendarDays } from "@/lib/domain/dateRange";
import { parseCalendarDate } from "@/lib/domain/dutyBlocks";
import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import type { SearchReadModel, SearchRosterPerson, SearchShiftEvent } from "./searchTypes";

/** How far back a shift event can still matter -- just enough to catch an overnight shift that started yesterday and is still current. */
const SEARCH_WINDOW_DAYS_BACK = 2;
/** How far forward search looks for "next shift"/"next shared shift" -- generous enough to almost always find a real answer, bounded enough to keep the payload small (see `SearchReadModel`'s own docstring). */
const SEARCH_WINDOW_DAYS_FORWARD = 120;

export interface BuildSearchReadModelInput {
  /** Full server-side parsed personnel list -- every authenticated person is searchable, per the product decision that basic roster/shift-status info is team-wide directory information, not manager-only. */
  people: readonly Person[];
  /** Full server-side parsed Event set (every person) -- never returned as-is; only the safe (date, period, role, certainty, shadow, temporalState) fields survive into `SearchShiftEvent`. */
  events: readonly Event[];
  shiftSchedule: ShiftSchedule;
  meId: string;
  fetchedAt: string;
  now: LocalNow;
}

/**
 * Pure, deterministic construction of the global-search safe projection.
 * No Date/UTC, no network -- every temporal decision reuses the same
 * domain primitives (`classifyAssignmentTemporalState`) the rest of the
 * app's "current/next" computations already use, so search can never
 * disagree with the dashboard about what's current.
 */
export function buildSearchReadModel(input: BuildSearchReadModelInput): SearchReadModel {
  const { people, events, shiftSchedule, meId, fetchedAt, now } = input;

  const today = parseCalendarDate(now.date);
  const windowStart = today ? formatCalendarDate(subtractCalendarDays(today, SEARCH_WINDOW_DAYS_BACK)) : now.date;
  const windowEnd = today ? formatCalendarDate(addCalendarDays(today, SEARCH_WINDOW_DAYS_FORWARD)) : now.date;

  const roster: SearchRosterPerson[] = people.map(toSearchRosterPerson).sort(compareRosterPeople);

  const shiftEvents: SearchShiftEvent[] = events
    .filter(
      (event) =>
        event.category === "shift" &&
        (event.period === "day" || event.period === "night") &&
        event.date >= windowStart &&
        event.date <= windowEnd,
    )
    .map((event) => toSearchShiftEvent(event, shiftSchedule, now))
    .sort(compareShiftEvents);

  return { fetchedAt, localNow: now, meId, roster, shiftEvents };
}

function toSearchRosterPerson(person: Person): SearchRosterPerson {
  return {
    id: person.id,
    name: person.name,
    personnelType: person.personnelType,
    isSupervisor: person.isSupervisor,
    isTechnician: person.isTechnician,
  };
}

function toSearchShiftEvent(event: Event, schedule: ShiftSchedule, now: LocalNow): SearchShiftEvent {
  return {
    personId: event.personId,
    date: event.date,
    // Narrowed by the filter above -- only "day"/"night" events reach here.
    period: event.period as "day" | "night",
    role: event.role,
    certainty: event.certainty,
    shadow: event.shadow,
    temporalState: classifyAssignmentTemporalState(event, schedule, now),
  };
}

function compareRosterPeople(a: SearchRosterPerson, b: SearchRosterPerson): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function compareShiftEvents(a: SearchShiftEvent, b: SearchShiftEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.period !== b.period) return a.period < b.period ? -1 : 1;
  return a.personId < b.personId ? -1 : a.personId > b.personId ? 1 : 0;
}
