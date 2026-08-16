import type { SearchShiftEvent } from "@/lib/readModels/searchTypes";
import type { SearchShiftPeriod } from "./types";

export interface SharedShift {
  date: string;
  period: SearchShiftPeriod;
}

const ACTIVE_STATES = new Set(["current", "upcoming"]);

/**
 * The next (up to `limit`) shifts where `personAId` and `personBId` are
 * BOTH actually staffed on the same date+period -- pure date+period
 * equality over each person's own server-resolved `temporalState`, never
 * inferred from text. A day shift for one and a night shift for the other
 * on the same date is never "together" (different `period`, different map
 * key). Only `"current"`/`"upcoming"` events are ever considered -- a past
 * shift the two once shared together is not a future answer to "when are
 * we next together".
 */
export function findNextSharedShifts(
  shiftEvents: readonly SearchShiftEvent[],
  personAId: string,
  personBId: string,
  limit = 3,
): SharedShift[] {
  const bKeys = new Set(
    shiftEvents
      .filter((event) => event.personId === personBId && ACTIVE_STATES.has(event.temporalState))
      .map((event) => `${event.date}|${event.period}`),
  );

  const shared = new Map<string, SharedShift>();
  for (const event of shiftEvents) {
    if (event.personId !== personAId || !ACTIVE_STATES.has(event.temporalState)) continue;
    const key = `${event.date}|${event.period}`;
    if (bKeys.has(key) && !shared.has(key)) {
      shared.set(key, { date: event.date, period: event.period });
    }
  }

  return [...shared.values()].sort(compareSharedShifts).slice(0, limit);
}

function compareSharedShifts(a: SharedShift, b: SharedShift): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  return a.period < b.period ? -1 : a.period > b.period ? 1 : 0;
}
