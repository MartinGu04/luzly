import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import type { ConflictIssueView } from "@/components/conflicts/types";
import { ManagerAttentionSection } from "@/components/manager/ManagerAttentionSection";
import { ManagerCoverageSection } from "@/components/manager/ManagerCoverageSection";
import { ManagerDutiesAbsencesSection } from "@/components/manager/ManagerDutiesAbsencesSection";
import { ManagerForbiddenState } from "@/components/manager/ManagerForbiddenState";
import { ManagerHeader } from "@/components/manager/ManagerHeader";
import { ManagerPersonSelector } from "@/components/manager/ManagerPersonSelector";
import { ManagerPotentialSection } from "@/components/manager/ManagerPotentialSection";
import { ManagerProblemsToggle } from "@/components/manager/ManagerProblemsToggle";
import { ManagerRangeSelector } from "@/components/manager/ManagerRangeSelector";
import { ManagerRosterSection } from "@/components/manager/ManagerRosterSection";
import {
  ManagerSelectedPersonView,
  type ManagerSelectedPersonAssignmentView,
} from "@/components/manager/ManagerSelectedPersonView";
import { ManagerSourceOfTruthNote } from "@/components/manager/ManagerSourceOfTruthNote";
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
} from "@/lib/presentation/issue";
import {
  absenceKindLabel,
  issueReasonLabel,
  managerIssueReasonLabel,
  periodLabel,
  roleLabel,
} from "@/lib/presentation/labels";
import type { ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { managerSummaryLabel } from "@/lib/presentation/managerSummary";
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

function buildManagerIssueRowView(issue: ManagerIssue, todayDate: string, index: number): ManagerIssueRowView {
  return {
    key: `${issue.personId}-${issue.reason}-${issue.date}-${index}`,
    personName: issue.personName,
    severity: issue.severity,
    reasonLabel: managerIssueReasonLabel(issue.reason),
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

/** Same projection `/conflicts` uses for `PersonalIssue` -- duplicated here (page-local) rather than shared across routes, matching this codebase's existing per-page builder convention. */
function buildSelectedPersonIssueView(issue: PersonalIssue, todayDate: string, index: number): ConflictIssueView {
  return {
    key: `${issue.reason}-${issue.date}-${index}`,
    severity: issue.severity,
    reasonLabel: issueReasonLabel(issue.reason),
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
    columnLabel: row.columnLabel,
    sourceRawValue: row.sourceRawValue,
    resolvedPersonName: row.resolvedPersonName,
    status: row.status,
    namedPersonBlockingAbsence: row.namedPersonBlockingAbsence,
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
  };
}

function buildManagerDutyRowView(duty: ManagerDutyEntry, todayDate: string): ManagerDutyRowView {
  return {
    key: `${duty.personId}-${duty.date}-${duty.dutyFamily}-${duty.slot ?? "x"}`,
    personName: duty.personName,
    dateLabel: issueDateLabel(duty.date, todayDate),
    emoji: dutyBlockEmoji(duty),
    title: dutyBlockTitle(duty),
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

  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ManagerPersonSelector
          people={model.roster.map((person) => ({ id: person.id, name: person.name }))}
          selectedId={model.selectedPersonId}
        />
        <ManagerRangeSelector current={hrefParams} currentMonth={model.range.month} />
      </div>
      <ManagerProblemsToggle current={hrefParams} />
    </div>
  );

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
        {controls}
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

  const issueViews = model.issues.map((issue, index) => buildManagerIssueRowView(issue, todayDate, index));
  const criticalIssueViews = issueViews.filter((view) => view.severity === "critical");
  const reviewIssueViews = issueViews.filter((view) => view.severity === "review");

  const potentialRowViews = model.potentialRequirements.map((row, index) =>
    buildManagerPotentialRowView(row, todayDate, index),
  );
  const potentialProblemViews = potentialRowViews.filter(
    (row) => row.status === "missing" || row.status === "partial",
  );

  return (
    <div className="flex flex-col gap-6">
      <ManagerHeader />
      {controls}
      {summary ? <ManagerSummaryStrip summary={summary} /> : null}

      <ManagerAttentionSection
        criticalIssues={criticalIssueViews}
        reviewIssues={reviewIssueViews}
        potentialProblems={potentialProblemViews}
      />

      {!model.problemsOnly ? (
        <>
          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">כיסוי משמרות</h2>
            <ManagerCoverageSection
              groups={model.coverageOverview.map((group) => buildManagerShiftGroupView(group, todayDate))}
            />
          </section>

          <section>
            <h2 className="mb-2 text-sm font-semibold text-foreground">פוטנציאל מול סידור</h2>
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
