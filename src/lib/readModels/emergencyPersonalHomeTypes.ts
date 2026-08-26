import type { EmergencyModePeriod } from "@/lib/emergencyMode/types";
import type { EmergencyShiftPeriod } from "@/lib/domain/emergencyShift";
import type { EmergencyParseDiagnostic } from "@/lib/parsers/emergencySchedule";
import type { LocalNow } from "@/lib/domain/localNow";

/** One OTHER person on the same date+period -- self is never included here, see `buildEmergencyPersonalHome.ts`'s own docs (spec section 9: "show EVERY OTHER assignment"). */
export interface EmergencyPersonalRosterEntry {
  personId: string | null;
  personName: string;
  desk: string;
}

export interface EmergencyPersonalShiftView {
  date: string;
  period: EmergencyShiftPeriod;
  /** This person's own desk(s) for this shift -- more than one when they appear in multiple desk cells; never silently drops one. */
  ownDesks: string[];
  /** Minute-of-day on the canonical shift timeline, from the regular workbook's shift-time configuration -- null when that configuration is broken (never blocks the emergency view itself). */
  startMinute: number | null;
  endMinute: number | null;
  /** Every OTHER assignment for this exact date+period (self excluded) -- "מי איתי". */
  roster: EmergencyPersonalRosterEntry[];
}

export interface EmergencyPersonalHomeReadModel {
  period: EmergencyModePeriod;
  localNow: LocalNow;
  fetchedAt: string;
  /** This person's own current emergency shift, or null when they have no assignment for the currently active date+period (or the regular shift-time config is broken, in which case "current" can never be honestly determined -- see the builder's own docs). */
  current: EmergencyPersonalShiftView | null;
  /** This person's own next upcoming emergency shift, or null when none is scheduled yet. */
  next: EmergencyPersonalShiftView | null;
  diagnostics: EmergencyParseDiagnostic[];
}
