import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import type {
  ManagerAbsenceEntry,
  ManagerDutyEntry,
  ManagerRoleCoverageView,
  ManagerShiftGroupPerson,
  ManagerShiftOverviewEntry,
} from "@/lib/readModels/managerTypes";
import { assignmentEmoji } from "./emoji";
import { dutyBlockEmoji, dutyBlockTitle } from "./duty";
import { absenceKindLabel, periodLabel } from "./labels";
import { roleCoverageMessage, type ManagerRoleCoverageRoleName } from "./roleCoverage";

/** One assigned/absent/on-duty person's name, in a Schedule "everyone" view -- never more than a name + tentative flag. */
export interface ScheduleStaffingPersonView {
  key: string;
  name: string;
  tentative: boolean;
}

/** One role's (technician/supervisor) staffing within a period -- names AND the same domain-derived coverage message every other screen shows, never inferred from an empty name list (PR #24 §17). */
export interface ScheduleRoleStaffingView {
  people: ScheduleStaffingPersonView[];
  status: CoverageStatus;
  message: string | null;
}

/** One date's day-or-night staffing picture. */
export interface SchedulePeriodStaffingView {
  period: "day" | "night";
  label: string;
  emoji: string | null;
  technicians: ScheduleRoleStaffingView;
  supervisors: ScheduleRoleStaffingView;
  /** Shadow/handover people, kept separate from primary staffing (PR #24 §16) -- never merged into `technicians`/`supervisors`. */
  shadowTechnicianNames: string[];
  shadowSupervisorNames: string[];
  coverageStatus: CoverageStatus;
}

export interface ScheduleDutyRowView {
  key: string;
  personName: string;
  title: string;
  emoji: string | null;
}

export interface ScheduleAbsenceRowView {
  key: string;
  personName: string;
  label: string;
  emoji: string | null;
}

/** One calendar date's full "everyone" picture -- day/night staffing (null when there's simply no shift data for that period, never a fabricated "missing" verdict), plus that date's duties/absences. */
export interface ScheduleEveryoneDayView {
  date: string;
  day: SchedulePeriodStaffingView | null;
  night: SchedulePeriodStaffingView | null;
  /**
   * People with a GENERIC (period-unspecified) role assignment for this
   * date -- e.g. a weekend cell that just says `אחמ"ש`, with no יום/לילה
   * split. Deliberately date-scoped, not nested inside `day`/`night`: such
   * an assignment covers BOTH periods internally (see
   * `buildShiftStaffingOverview`'s own `roleCoverage`), but is still ONE
   * assignment -- listing it here once, rather than inside both `day.
   * supervisors` and `night.supervisors`, is what keeps a consumer from
   * rendering it as if the person worked two independent shifts.
   */
  genericSupervisorNames: string[];
  genericTechnicianNames: string[];
  duties: ScheduleDutyRowView[];
  absences: ScheduleAbsenceRowView[];
}

function toStaffingPersonView(person: ManagerShiftGroupPerson): ScheduleStaffingPersonView {
  return { key: person.personId, name: person.personName, tentative: person.certainty === "tentative" };
}

function toRoleStaffingView(
  people: readonly ManagerShiftGroupPerson[],
  coverage: ManagerRoleCoverageView,
  role: ManagerRoleCoverageRoleName,
): ScheduleRoleStaffingView {
  return {
    people: people.map(toStaffingPersonView),
    status: coverage.status,
    message: roleCoverageMessage(role, coverage),
  };
}

/** `group.period` is trusted to already be "day"/"night" -- callers only pass groups filtered to those two periods (see `buildScheduleEveryoneDayViews`). */
function toPeriodStaffingView(group: ManagerShiftOverviewEntry): SchedulePeriodStaffingView {
  return {
    period: group.period as "day" | "night",
    label: periodLabel(group.period) ?? "",
    emoji: assignmentEmoji({ category: "shift", period: group.period, dutyFamily: null, absenceKind: null }),
    technicians: toRoleStaffingView(group.technicians, group.roleCoverage.technician, "technician"),
    supervisors: toRoleStaffingView(group.supervisors, group.roleCoverage.supervisor, "supervisor"),
    shadowTechnicianNames: group.shadowTechnicians.map((person) => person.personName),
    shadowSupervisorNames: group.shadowSupervisors.map((person) => person.personName),
    coverageStatus: group.coverageStatus,
  };
}

function toDutyRowView(duty: ManagerDutyEntry): ScheduleDutyRowView {
  return {
    key: `${duty.personId}-${duty.date}-${duty.dutyFamily}-${duty.slot ?? "x"}`,
    personName: duty.personName,
    title: dutyBlockTitle(duty),
    emoji: dutyBlockEmoji(duty),
  };
}

function toAbsenceRowView(absence: ManagerAbsenceEntry): ScheduleAbsenceRowView {
  return {
    key: `${absence.personId}-${absence.date}-${absence.absenceKind}`,
    personName: absence.personName,
    label: absenceKindLabel(absence.absenceKind),
    emoji: assignmentEmoji({
      category: "absence",
      period: "unspecified",
      dutyFamily: null,
      absenceKind: absence.absenceKind,
    }),
  };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(value);
  else map.set(key, [value]);
}

/**
 * Builds one `ScheduleEveryoneDayView` per date in `dates` -- the page-local
 * projection `ScheduleEveryoneCalendar`/its selected-day panel render.
 * `staffing` only ever contains "day"/"night" period groups relevant here
 * (`ManagerShiftOverviewEntry` also has "morning"/"unspecified", which this
 * intentionally never surfaces -- PR #24 §15 asks only for day/night).
 * A date with no shift Events for a period gets `day`/`night: null` rather
 * than a fabricated coverage verdict -- see `buildShiftStaffingOverview`.
 */
export function buildScheduleEveryoneDayViews(
  dates: readonly string[],
  staffing: readonly ManagerShiftOverviewEntry[],
  duties: readonly ManagerDutyEntry[],
  absences: readonly ManagerAbsenceEntry[],
): Record<string, ScheduleEveryoneDayView> {
  const staffingByDate = new Map<string, ManagerShiftOverviewEntry[]>();
  for (const entry of staffing) {
    if (entry.period === "day" || entry.period === "night" || entry.period === "unspecified") {
      pushTo(staffingByDate, entry.date, entry);
    }
  }

  const dutiesByDate = new Map<string, ManagerDutyEntry[]>();
  for (const duty of duties) pushTo(dutiesByDate, duty.date, duty);

  const absencesByDate = new Map<string, ManagerAbsenceEntry[]>();
  for (const absence of absences) pushTo(absencesByDate, absence.date, absence);

  const result: Record<string, ScheduleEveryoneDayView> = {};
  for (const date of dates) {
    const dateGroups = staffingByDate.get(date) ?? [];
    const dayGroup = dateGroups.find((group) => group.period === "day") ?? null;
    const nightGroup = dateGroups.find((group) => group.period === "night") ?? null;
    const genericGroup = dateGroups.find((group) => group.period === "unspecified") ?? null;

    result[date] = {
      date,
      day: dayGroup ? toPeriodStaffingView(dayGroup) : null,
      night: nightGroup ? toPeriodStaffingView(nightGroup) : null,
      genericSupervisorNames: genericGroup?.supervisors.map((person) => person.personName) ?? [],
      genericTechnicianNames: genericGroup?.technicians.map((person) => person.personName) ?? [],
      duties: (dutiesByDate.get(date) ?? []).map(toDutyRowView),
      absences: (absencesByDate.get(date) ?? []).map(toAbsenceRowView),
    };
  }
  return result;
}
