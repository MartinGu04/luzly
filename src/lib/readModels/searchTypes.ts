import type { AssignmentTemporalState } from "@/lib/domain/assignmentTemporalState";
import type { EventCertainty, EventRole } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";

/**
 * The safe, team-directory roster projection global search matches person
 * queries against -- every authenticated person, byte-for-byte the same
 * shape as `ManagerPersonSummary`/`ScheduleRosterOption` (id/name/
 * personnelType/role capability flags only). Never email, never
 * sourceSheet/sourceCell, never a raw `Person`.
 */
export interface SearchRosterPerson {
  id: string;
  name: string;
  personnelType: string | null;
  isSupervisor: boolean;
  isTechnician: boolean;
}

/**
 * One person's shift on one date+period, safe for global search. Only
 * `category === "shift"` events with a canonical `"day"`/`"night"` period
 * are ever projected here -- duties/absences/morning/unspecified shifts
 * have no place in date+period shift-search matching. `temporalState` is
 * resolved server-side once (`classifyAssignmentTemporalState`, the SAME
 * function every other "current/next" computation in this app uses) so the
 * client never needs `ShiftSchedule`/minute-level timing to know whether a
 * shift is current, upcoming, or past -- no second temporal-classification
 * implementation, no Date/UTC on the client.
 */
export interface SearchShiftEvent {
  personId: string;
  date: string;
  period: "day" | "night";
  role: EventRole;
  certainty: EventCertainty;
  shadow: boolean;
  temporalState: AssignmentTemporalState;
}

/**
 * The complete safe projection the global command-palette search matches
 * against, entirely client-side, with zero further network calls. Bounded
 * to a rolling window around `localNow` (see `buildSearchReadModel`) --
 * small enough to ship whole, large enough for "next shared shift" to find
 * a real answer in the common case.
 */
export interface SearchReadModel {
  fetchedAt: string;
  localNow: LocalNow;
  /** The authenticated person's own id -- "with me"/"shared shift" queries always resolve relative to this, never a name the user typed for themselves. */
  meId: string;
  roster: SearchRosterPerson[];
  shiftEvents: SearchShiftEvent[];
}
