import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import type { ConflictIssueView } from "@/components/conflicts/types";
import { ManagerAttentionSection } from "@/components/manager/ManagerAttentionSection";
import { ManagerCommandBar } from "@/components/manager/ManagerCommandBar";
import { ManagerCoverageSection } from "@/components/manager/ManagerCoverageSection";
import { ManagerDutiesAbsencesSection } from "@/components/manager/ManagerDutiesAbsencesSection";
import { ManagerForbiddenState } from "@/components/manager/ManagerForbiddenState";
import { ManagerHeader } from "@/components/manager/ManagerHeader";
import { ManagerPotentialSection } from "@/components/manager/ManagerPotentialSection";
import { ManagerRosterSection } from "@/components/manager/ManagerRosterSection";
import {
  ManagerSelectedPersonView,
  type ManagerSelectedPersonAssignmentView,
} from "@/components/manager/ManagerSelectedPersonView";
import { ManagerSourceOfTruthNote } from "@/components/manager/ManagerSourceOfTruthNote";
import { ManagerSubNav } from "@/components/manager/ManagerSubNav";
import { ManagerSummaryStrip } from "@/components/manager/ManagerSummaryStrip";
import type {
  ManagerAbsenceRowView,
  ManagerDutyRowView,
  ManagerIssueRowView,
  ManagerPotentialRowView,
  ManagerShiftGroupView,
} from "@/components/manager/types";
import { formatMonthParam } from "@/lib/domain/calendarMonth";
import { assignmentEmoji } from "@/lib/presentation/emoji";
import { dutyBlockEmoji, dutyBlockTitle } from "@/lib/presentation/duty";
import {
  issueDateLabel,
  issueExplanation,
  issueGuidanceLabel,
  issueTargetEmoji,
  issueTargetTitle,
  personalIssueReasonLabel,
} from "@/lib/presentation/issue";
import {
  absenceKindLabel,
  managerIssueReasonLabel,
  periodLabel,
  roleLabel,
} from "@/lib/presentation/labels";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { managerIssueCoverageReasonLabel } from "@/lib/presentation/managerIssueCoverage";
import { managerSummaryLabel } from "@/lib/presentation/managerSummary";
import { roleCoverageMessage } from "@/lib/presentation/roleCoverage";
import { formatMissingIntervals } from "@/lib/presentation/scheduleTime";
import { getRequestManagerOverview } from "@/lib/readModels/getRequestManagerOverview";
import { parseManagerOverviewSearchParams } from "@/lib/readModels/managerOverviewParams";
import type {
  ManagerAbsenceEntry,
  ManagerDutyEntry,
  ManagerIssue,
  ManagerOverviewReadModel,
  ManagerPotentialRequirementView,
  ManagerShiftOverviewEntry,
} from "@/lib/readModels/managerTypes";
import type { PersonalAssignmentView, PersonalIssue } from "@/lib/readModels/types";

type SearchParamValue = string | string[] | undefined;

interface ManagerPageProps {
  searchParams: Promise<{
    person?: SearchParamValue;
    range?: SearchParamValue;
    month?: SearchParamValue;
    problems?: SearchParamValue;
  }>;
}

// ---------------------------------------------------------------------------
// View builders (page-local, same convention as /duties, /with-me, /conflicts)
// ---------------------------------------------------------------------------

const COVERAGE_ISSUE_REASONS = new Set<ManagerIssue["reason"]>(["shift_coverage_missing", "shift_coverage_partial"]);

/**
 * Looks up the SAME `roleCoverage` diagnostic `ManagerCoverageSection`
 * already renders for this shift (matched by date+period, the only keys
 * `ManagerShiftOverviewEntry` groups by) and uses it to say explicitly
 * which role is missing/partial for a coverage-reason issue -- instead of
 * the generic "חסר כיסוי למשמרת" the two sections used to disagree on. Any
 * other issue reason, or a coverage-reason issue whose shift isn't found
 * in `coverageOverview`, falls back to the existing generic label
 * unchanged.
 */
function managerIssueReasonLabelFor(
  issue: ManagerIssue,
  coverageByDatePeriod: ReadonlyMap<string, ManagerShiftOverviewEntry>,
): string {
  const fallback = managerIssueReasonLabel(issue.reason);
  if (!COVERAGE_ISSUE_REASONS.has(issue.reason) || !issue.targetEvent) return fallback;

  const group = coverageByDatePeriod.get(`${issue.date}|${issue.targetEvent.period}`);
  if (!group) return fallback;

  return managerIssueCoverageReasonLabel(group.roleCoverage, fallback);
}

function buildManagerIssueRowView(
  issue: ManagerIssue,
  todayDate: string,
  index: number,
  coverageByDatePeriod: ReadonlyMap<string, ManagerShiftOverviewEntry>,
): ManagerIssueRowView {
  return {
    key: `${issue.personId}-${issue.reason}-${issue.date}-${index}`,
    personName: issue.personName,
    severity: issue.severity,
    reasonLabel: managerIssueReasonLabelFor(issue, coverageByDatePeriod),
    dateLabel: issueDateLabel(issue.date, todayDate),
    targetEmoji: issue.targetEvent ? issueTargetEmoji(issue.targetEvent) : null,
    targetTitle: issue.targetEvent ? issueTargetTitle(issue.targetEvent) : null,
    missingIntervalLabels:
      issue.missingIntervals && issue.missingIntervals.length > 0
        ? formatMissingIntervals(issue.missingIntervals)
        : null,
    explanation: issueExplanation(issue),
    guidance: issueGuidanceLabel(issue.reason),
  };
}

/** Same projection `/conflicts` uses for `PersonalIssue` -- duplicated here (page-local) rather than shared across routes, matching this codebase's existing per-page builder convention. `reasonLabel` uses the SAME role-aware `personalIssueReasonLabel` /conflicts and the dashboard already use, so this drill-down never falls back to the generic "חסר כיסוי" wording those two routes already fixed. */
function buildSelectedPersonIssueView(issue: PersonalIssue, todayDate: string, index: number): ConflictIssueView {
  return {
    key: `${issue.reason}-${issue.date}-${index}`,
    severity: issue.severity,
    reasonLabel: personalIssueReasonLabel(issue),
    dateLabel: issueDateLabel(issue.date, todayDate),
    targetEmoji: issue.targetEvent ? issueTargetEmoji(issue.targetEvent) : null,
    targetTitle: issue.targetEvent ? issueTargetTitle(issue.targetEvent) : null,
    missingIntervalLabels:
      issue.missingIntervals && issue.missingIntervals.length > 0
        ? formatMissingIntervals(issue.missingIntervals)
        : null,
    explanation: issueExplanation(issue),
    guidance: issueGuidanceLabel(issue.reason),
  };
}

function buildManagerPotentialRowView(
  row: ManagerPotentialRequirementView,
  todayDate: string,
  index: number,
): ManagerPotentialRowView {
  return {
    key: `${row.date}-${row.columnLabel}-${index}`,
    dateLabel: issueDateLabel(row.date, todayDate),
    // The verified Potential column header IS the requirement identity (e.g. "אוקסיד 3", "מטבח מלא 2") --
    // reconstructing it via dutyBlockTitle({dutyFamily,slot}) would lose the Potential-side numbering for
    // multiplicity families, since their internal Event.slot is intentionally null.
    requirementTitle: row.columnLabel,
    sourceAllocationLabel: row.sourceAllocationLabel,
    actualAssigneeNames: row.actualAssignees.map((assignee) => assignee.personName),
    status: row.status,
    sourceConflictNote:
      row.sourceConflict === "blocking_absence" && row.resolvedSourcePersonName
        ? `מקור ההקצאה (${row.resolvedSourcePersonName}) נמצא/ת בהיעדרות חוסמת באותו יום בסידור הפנימי.`
        : null,
  };
}

function buildManagerShiftGroupView(group: ManagerShiftOverviewEntry, todayDate: string): ManagerShiftGroupView {
  return {
    key: `${group.date}-${group.period}`,
    dateLabel: issueDateLabel(group.date, todayDate),
    periodLabel: periodLabel(group.period) ?? "משמרת",
    emoji: assignmentEmoji({ category: "shift", period: group.period, dutyFamily: null, absenceKind: null }),
    technicianNames: group.technicians.map((p) => p.personName),
    supervisorNames: group.supervisors.map((p) => p.personName),
    shadowTechnicianNames: group.shadowTechnicians.map((p) => p.personName),
    shadowSupervisorNames: group.shadowSupervisors.map((p) => p.personName),
    coverageStatus: group.coverageStatus,
    missingIntervalLabels: formatMissingIntervals(group.missingIntervals),
    technicianCoverage: {
      status: group.roleCoverage.technician.status,
      message: roleCoverageMessage("technician", group.roleCoverage.technician),
    },
    supervisorCoverage: {
      status: group.roleCoverage.supervisor.status,
      message: roleCoverageMessage("supervisor", group.roleCoverage.supervisor),
    },
  };
}

function buildManagerDutyRowView(duty: ManagerDutyEntry, todayDate: string): ManagerDutyRowView {
  return {
    key: `${duty.personId}-${duty.date}-${duty.dutyFamily}-${duty.slot ?? "x"}`,
    personName: duty.personName,
    dateLabel: issueDateLabel(duty.date, todayDate),
    emoji: dutyBlockEmoji(duty),
    title: dutyBlockTitle(duty),
    dutyFamily: duty.dutyFamily,
  };
}

function buildManagerAbsenceRowView(absence: ManagerAbsenceEntry, todayDate: string): ManagerAbsenceRowView {
  return {
    key: `${absence.personId}-${absence.date}-${absence.absenceKind}`,
    personName: absence.personName,
    dateLabel: issueDateLabel(absence.date, todayDate),
    emoji: assignmentEmoji({
      category: "absence",
      period: "unspecified",
      dutyFamily: null,
      absenceKind: absence.absenceKind,
    }),
    label: absenceKindLabel(absence.absenceKind),
    absenceKind: absence.absenceKind,
  };
}

function buildAssignmentView(
  assignment: PersonalAssignmentView,
  todayDate: string,
  keyPrefix: string,
  index: number,
): ManagerSelectedPersonAssignmentView {
  const parts = [roleLabel(assignment.role), periodLabel(assignment.period)].filter(
    (part): part is string => Boolean(part),
  );
  return {
    key: `${keyPrefix}-${assignment.date}-${index}`,
    emoji: assignmentEmoji({
      category: assignment.category,
      period: assignment.period,
      dutyFamily: assignment.dutyFamily,
      absenceKind: assignment.absenceKind,
    }),
    title: parts.length > 0 ? parts.join(" ") : assignment.title,
    dateLabel: issueDateLabel(assignment.date, todayDate),
  };
}

function toHrefParams(model: ManagerOverviewReadModel): ManagerHrefParams {
  return {
    personId: model.selectedPersonId,
    range: model.range.key,
    month: model.range.month ? formatMonthParam(model.range.month) : null,
    problemsOnly: model.problemsOnly,
  };
}

/**
 * "מבט מנהל" -- the manager's control center: everyone by default, or one
 * selected person's drill-down. Entirely driven by `ManagerOverviewReadModel`
 * (see `getRequestManagerOverview`/`loadManagerOverviewReadModel`) -- this
 * page never fetches Google itself, never re-runs `detectOperationalIssues()`,
 * and never receives more than safe roster ids/names on the client (see
 * `ManagerPersonSelector`).
 */
export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const rawParams = await searchParams;
  const params = parseManagerOverviewSearchParams(rawParams);

  const result = await getRequestManagerOverview(params.personId, params.range, params.month, params.problemsOnly);

  if (result.status === "forbidden") {
    return <ManagerForbiddenState />;
  }
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;
  const todayDate = model.localNow.date;
  const hrefParams = toHrefParams(model);
  const people = model.roster.map((person) => ({ id: person.id, name: person.name }));

  if (model.selectedPersonId && model.selectedPerson) {
    const selected = model.selectedPerson;
    const personDuties = model.duties
      .filter((duty) => duty.personId === model.selectedPersonId)
      .map((duty) => buildManagerDutyRowView(duty, todayDate));
    const personAbsences = model.selectedPersonRangeAbsences.map((absence) =>
      buildManagerAbsenceRowView(absence, todayDate),
    );

    return (
      <div className="flex flex-col gap-6">
        <ManagerHeader />
        <ManagerSubNav active="overview" />
        <ManagerCommandBar
          people={people}
          selectedPersonId={model.selectedPersonId}
          current={hrefParams}
          currentMonth={model.range.month}
          fetchedAt={model.fetchedAt}
          showProblemsToggle={false}
        />
        <ManagerSelectedPersonView
          person={{
            name: selected.person.name,
            isManager: selected.person.isManager,
            isTechnician: selected.person.isTechnician,
            isSupervisor: selected.person.isSupervisor,
          }}
          currentAssignments={selected.currentAssignments.map((assignment, index) =>
            buildAssignmentView(assignment, todayDate, "current", index),
          )}
          nextAssignments={(selected.nextAssignmentGroup?.events ?? []).map((assignment, index) =>
            buildAssignmentView(assignment, todayDate, "next", index),
          )}
          issues={selected.issues.map((issue, index) => buildSelectedPersonIssueView(issue, todayDate, index))}
          duties={personDuties}
          absences={personAbsences}
        />
        <ManagerSourceOfTruthNote />
      </div>
    );
  }

  const summary = managerSummaryLabel(model);

  const coverageByDatePeriod = new Map(
    model.coverageOverview.map((group) => [`${group.date}|${group.period}`, group]),
  );
  const issueViews = model.issues.map((issue, index) =>
    buildManagerIssueRowView(issue, todayDate, index, coverageByDatePeriod),
  );
  const criticalIssueViews = issueViews.filter((view) => view.severity === "critical");
  const reviewIssueViews = issueViews.filter((view) => view.severity === "review");

  const potentialRowViews = model.potentialRequirements.map((row, index) =>
    buildManagerPotentialRowView(row, todayDate, index),
  );
  const potentialProblemViews = potentialRowViews.filter(
    (row) => row.status === "missing" || row.status === "partial" || row.sourceConflictNote !== null,
  );

  return (
    <div className="flex flex-col gap-6">
      <ManagerHeader />
      <ManagerSubNav active="overview" />
      <ManagerCommandBar
        people={people}
        selectedPersonId={model.selectedPersonId}
        current={hrefParams}
        currentMonth={model.range.month}
        fetchedAt={model.fetchedAt}
        showProblemsToggle
      />
      {summary ? <ManagerSummaryStrip summary={summary} /> : null}

      <ManagerAttentionSection
        criticalIssues={criticalIssueViews}
        reviewIssues={reviewIssueViews}
        potentialProblems={potentialProblemViews}
      />

      {!model.problemsOnly ? (
        <>
          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground sm:text-xl">כיסוי משמרות</h2>
            <ManagerCoverageSection
              groups={model.coverageOverview.map((group) => buildManagerShiftGroupView(group, todayDate))}
            />
          </section>

          <section>
            <h2 className="mb-2 text-lg font-bold text-foreground sm:text-xl">פוטנציאל מול סידור</h2>
            <ManagerPotentialSection rows={potentialRowViews} />
          </section>

          <ManagerDutiesAbsencesSection
            duties={model.duties.map((duty) => buildManagerDutyRowView(duty, todayDate))}
            absences={model.absences.map((absence) => buildManagerAbsenceRowView(absence, todayDate))}
          />

          <ManagerRosterSection roster={model.roster} current={hrefParams} />
        </>
      ) : null}

      <ManagerSourceOfTruthNote />
    </div>
  );
}
