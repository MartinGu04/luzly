import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import type { EmergencyParseDiagnostic } from "@/lib/parsers/emergencySchedule";
import type { EmergencyShiftPeriod } from "@/lib/domain/emergencyShift";
import type { LocalNow } from "@/lib/domain/localNow";
import type { SchedulePerspective, ScheduleRosterOption } from "./scheduleTypes";

/** One OTHER person on the same date+period as the viewed person -- self/the viewed person is never included here (matches `EmergencyPersonalRosterEntry`'s own convention). */
export interface EmergencyScheduleRosterEntry {
  personId: string | null;
  personName: string;
  desk: string;
}

/** One date+period for the "self"/"person" perspective. */
export interface EmergencyPersonalShiftEntry {
  date: string;
  period: EmergencyShiftPeriod;
  /** The viewed person's own desk(s) -- more than one when they appear in multiple desk cells. */
  ownDesks: string[];
  roster: EmergencyScheduleRosterEntry[];
}

/** One canonical desk's staffing for one date+period -- `personName: null` means genuinely unstaffed (spec section 10: blank desks may display as unstaffed, never a fabricated "coverage gap"). */
export interface EmergencyDeskSlot {
  desk: string;
  personId: string | null;
  personName: string | null;
}

/** One date+period for the "all" perspective -- ALL ten canonical desks, in canonical order, populated or not. */
export interface EmergencyEveryoneShiftEntry {
  date: string;
  period: EmergencyShiftPeriod;
  desks: EmergencyDeskSlot[];
}

/**
 * `/schedule`'s Emergency Mode read model -- the dedicated desk-staffing
 * presentation (spec section 10), never a regular Event/role-coverage
 * projection. Mirrors `ScheduleReadModel`'s manager/roster/perspective
 * shape so the existing manager selector UI can be reused unchanged.
 */
export interface EmergencyScheduleReadModel {
  fetchedAt: string;
  localNow: LocalNow;
  period: EmergencyModePeriod;
  diagnostics: EmergencyParseDiagnostic[];

  manager: { id: string; name: string } | null;
  roster: ScheduleRosterOption[];
  perspective: SchedulePerspective;
  selectedPersonId: string | null;
  selectedPersonName: string | null;

  /** Set for perspective "self"/"person" -- every shift the viewed person is assigned to, unscoped by month (the page filters, same convention as `PersonalScheduleReadModel.calendarEvents`). */
  personalShifts: EmergencyPersonalShiftEntry[] | null;
  /** Set only for perspective "all" -- every date+period with any recorded data, unscoped by month. */
  everyoneShifts: EmergencyEveryoneShiftEntry[] | null;
}
