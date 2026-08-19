import type { Event } from "@/lib/domain/event";
import type { LocalNow } from "@/lib/domain/localNow";
import type { ShiftSchedule } from "@/lib/domain/shiftSchedule";
import type { Person } from "@/lib/domain/types";
import { toPersonalProfile } from "./buildPersonalScheduleReadModel";
import { buildManagerAbsenceEntries, buildManagerDutyEntries } from "./managerEventProjections";
import type {
  PermanentManagerHomeAbsence,
  PermanentManagerHomeDuty,
  PermanentManagerHomeReadModel,
} from "./permanentManagerHomeTypes";
import { resolveShiftSnapshotTriad } from "./shiftSnapshot";

export interface BuildPermanentManagerHomeReadModelInput {
  /** The authenticated permanent-manager Person this read model is being built for. */
  person: Person;
  /** Full parsed personnel list -- needed only to resolve duty/absence person names. */
  people: readonly Person[];
  /** Full server-side parsed Event set (every person). */
  events: readonly Event[];
  shiftSchedule: ShiftSchedule;
  fetchedAt: string;
  now: LocalNow;
}

function toDutyView(duty: { personId: string; personName: string; dutyFamily: NonNullable<Event["dutyFamily"]>; slot: number | null }): PermanentManagerHomeDuty {
  return { personId: duty.personId, personName: duty.personName, dutyFamily: duty.dutyFamily, slot: duty.slot };
}

function toAbsenceView(absence: { personId: string; personName: string; absenceKind: NonNullable<Event["absenceKind"]> }): PermanentManagerHomeAbsence {
  return { personId: absence.personId, personName: absence.personName, absenceKind: absence.absenceKind };
}

/**
 * Pure, deterministic construction of `PermanentManagerHomeReadModel` from
 * already-parsed domain data -- no network, no auth, no Date/UTC. Mirrors
 * `buildPersonalScheduleReadModel`'s conventions (explicit `now`, never
 * mutates input, every array deterministically ordered by the domain
 * functions it reuses).
 *
 * The previous/current/next shift resolution itself is
 * `resolveShiftSnapshotTriad` (`shiftSnapshot.ts`), shared with the Manager
 * Area's own shift-working-manager snapshot section -- this function only
 * adds what's specific to the permanent-manager Home: the viewer's own
 * safe profile and today's department-wide duties/absences.
 */
export function buildPermanentManagerHomeReadModel(
  input: BuildPermanentManagerHomeReadModelInput,
): PermanentManagerHomeReadModel {
  const { person, people, events, shiftSchedule, fetchedAt, now } = input;

  const { previousShift, currentShift, nextShift } = resolveShiftSnapshotTriad(events, shiftSchedule, now);

  const peopleById = new Map(people.map((p) => [p.id, p]));
  const todayDates = new Set([now.date]);
  const todayDuties = buildManagerDutyEntries(events, peopleById, todayDates).map(toDutyView);
  const todayAbsences = buildManagerAbsenceEntries(events, peopleById, todayDates).map(toAbsenceView);

  return {
    person: toPersonalProfile(person),
    fetchedAt,
    localNow: now,
    previousShift,
    currentShift,
    nextShift,
    todayDuties,
    todayAbsences,
  };
}
