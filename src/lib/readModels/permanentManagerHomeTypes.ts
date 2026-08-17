import type { AssignmentTiming } from "@/lib/domain/assignmentTiming";
import type { AbsenceKind, DutyFamily } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type { MinuteInterval } from "@/lib/domain/shiftSchedule";
import type { ManagerRoleCoverageView, ManagerShiftGroupPerson } from "./managerTypes";
import type { PersonalProfile } from "./types";

/**
 * One of the three department-wide shift snapshots ("תמונת מצב") for the
 * permanent-manager Home. Deliberately NOT anchored to any one person --
 * unlike `PersonalShiftContext`, this describes the shift itself, reusing
 * the exact same safe projections (`ManagerShiftGroupPerson`,
 * `ManagerRoleCoverageView`) `ManagerOverviewReadModel.coverageOverview`
 * already uses. Never carries a raw `Event`/`Person`.
 */
export interface PermanentManagerHomeShift {
  date: string;
  period: "day" | "night";
  startLocalTime: string;
  endLocalTime: string;
  supervisors: ManagerShiftGroupPerson[];
  technicians: ManagerShiftGroupPerson[];
  coverageStatus: CoverageStatus;
  missingIntervals: MinuteInterval[];
  roleCoverage: { technician: ManagerRoleCoverageView; supervisor: ManagerRoleCoverageView };
}

/**
 * The current shift additionally carries a resolved `AssignmentTiming` for
 * live progress (`ShiftProgress` reuse) -- always `"resolved"`, since it's
 * computed from the schedule's own canonical window (`computeIntervalTiming`),
 * never from an Event whose timing could be unresolved/invalid.
 */
export interface PermanentManagerHomeCurrentShift extends PermanentManagerHomeShift {
  timing: Extract<AssignmentTiming, { status: "resolved" }>;
}

/** One duty occurring today, across everyone -- safe projection, no raw Event/sourceSheet/sourceCell. */
export interface PermanentManagerHomeDuty {
  personId: string;
  personName: string;
  dutyFamily: DutyFamily;
  slot: number | null;
}

/** One recognized absence applying today, across everyone -- describes the recorded schedule, never physical presence. */
export interface PermanentManagerHomeAbsence {
  personId: string;
  personName: string;
  absenceKind: AbsenceKind;
}

/**
 * The permanent-manager Home's narrow, department-wide read model --
 * "תמונת מצב". Deliberately smaller than `ManagerOverviewReadModel`: no
 * roster, no Potential/Fairness, no notification readiness, no operational
 * issues list, no selected-person drilldown -- only what the spec's
 * PRIMARY OPERATIONAL SNAPSHOT and TODAY'S OPERATIONAL CONTEXT sections
 * need. A coverage problem links out to the EXISTING `/manager` "דורש
 * טיפול" flow rather than reproducing it here.
 */
export interface PermanentManagerHomeReadModel {
  person: PersonalProfile;
  fetchedAt: string;
  localNow: LocalNow;
  previousShift: PermanentManagerHomeShift;
  currentShift: PermanentManagerHomeCurrentShift;
  nextShift: PermanentManagerHomeShift;
  todayDuties: PermanentManagerHomeDuty[];
  todayAbsences: PermanentManagerHomeAbsence[];
}
