import Link from "next/link";
import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import type { IssueRowView } from "@/components/issues/types";
import { ManagerAdoptionSection } from "@/components/manager/ManagerAdoptionSection";
import { ManagerAdoptionSummary } from "@/components/manager/ManagerAdoptionSummary";
import { ManagerAttentionSection } from "@/components/manager/ManagerAttentionSection";
import { ManagerBroadcastArea } from "@/components/manager/ManagerBroadcastArea";
import { ManagerCategoryNav } from "@/components/manager/ManagerCategoryNav";
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
import { ManagerShiftSnapshotSection } from "@/components/manager/ManagerShiftSnapshotSection";
import { ManagerSourceOfTruthNote } from "@/components/manager/ManagerSourceOfTruthNote";
import { ManagerSummaryStrip } from "@/components/manager/ManagerSummaryStrip";
import type {
  ManagerAbsenceRowView,
  ManagerAttentionItem,
  ManagerDutyRowView,
  ManagerPotentialRowView,
  ManagerShiftDayView,
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
import { buildIssueRecommendationView } from "@/lib/presentation/issueRecommendation";
import {
  absenceKindLabel,
  managerIssueReasonLabel,
  periodLabel,
  roleLabel,
} from "@/lib/presentation/labels";
import { parseManagerCategoryParam, type ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { buildManagerAdoptionSectionView } from "@/lib/presentation/managerAdoption";
import { managerIssueCoverageReasonLabel } from "@/lib/presentation/managerIssueCoverage";
import { managerSummaryLabel } from "@/lib/presentation/managerSummary";
import { roleCoverageMessage } from "@/lib/presentation/roleCoverage";
import { scheduleEveryoneHref } from "@/lib/presentation/scheduleUrl";
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
    category?: SearchParamValue;
  }>;
}

// ---------------------------------------------------------------------------
// View builders (page-local, same convention as /duties and the rest of this app)
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
): IssueRowView {
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
    // PR #37 -- manager-only everyone-wide recommendation. `PersonalIssue`
    // (the selected-person drill-down's own source, see
    // `buildSelectedPersonIssueView` below) carries no such field at all,
    // so this can never leak into that view.
    recommendation: buildIssueRecommendationView(issue.recommendation, issue.reason, issue.missingIntervals),
  };
}

/** Same projection the dashboard's `IssuesPanel` uses for `PersonalIssue` -- duplicated here (page-local) rather than shared across routes, matching this codebase's existing per-page builder convention. `reasonLabel` uses the SAME role-aware `personalIssueReasonLabel` the dashboard already uses, so this drill-down never falls back to the generic "חסר כיסוי" wording. */
function buildSelectedPersonIssueView(issue: PersonalIssue, todayDate: string, index: number): IssueRowView {
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

/**
 * Pairs the flat per-date+period `coverageOverview` into one row per DATE
 * (redesign) -- the Shifts category's compact day-card grid, mirroring the
 * SAME day/night pairing `lib/presentation/scheduleEveryone.ts` already
 * establishes for the manager-only Schedule "כולם" perspective. A
 * "morning"/"unspecified" shift period intentionally never surfaces here
 * either, same reasoning as that module. Sorted chronologically -- a `Map`
 * only preserves insertion order, which here is `coverageOverview`'s own
 * date+period sort, not guaranteed date-major.
 */
function buildManagerShiftDayViews(entries: ManagerShiftOverviewEntry[], todayDate: string): ManagerShiftDayView[] {
  const byDate = new Map<string, { day: ManagerShiftOverviewEntry | null; night: ManagerShiftOverviewEntry | null }>();
  for (const entry of entries) {
    if (entry.period !== "day" && entry.period !== "night") continue;
    const bucket = byDate.get(entry.date) ?? { day: null, night: null };
    if (entry.period === "day") bucket.day = entry;
    else bucket.night = entry;
    byDate.set(entry.date, bucket);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, { day, night }]) => ({
      key: date,
      date,
      dateLabel: issueDateLabel(date, todayDate),
      day: day ? buildManagerShiftGroupView(day, todayDate) : null,
      night: night ? buildManagerShiftGroupView(night, todayDate) : null,
    }));
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

function toHrefParams(model: ManagerOverviewReadModel, category: ManagerHrefParams["category"]): ManagerHrefParams {
  return {
    personId: model.selectedPersonId,
    range: model.range.key,
    month: model.range.month ? formatMonthParam(model.range.month) : null,
    category,
  };
}

/**
 * "אזור מנהל" -- the manager's full operational picture (redesign): a
 * command-center Overview by default, plus four focused categories
 * (Shifts / Personnel / Duties & Absences / Logins & Notifications), or
 * one selected person's drill-down. "התחברויות והתראות" is the one
 * management-visibility category among these -- it never touches
 * Google Sheets beyond the roster already loaded; it reconciles that
 * roster against Supabase auth + push-subscription state (see
 * `ManagerAdoptionView`, `model.adoption`). Entirely driven by
 * `ManagerOverviewReadModel` (see
 * `getRequestManagerOverview`/`loadManagerOverviewReadModel`) -- this page
 * never fetches Google itself, never re-runs `detectOperationalIssues()`,
 * and never receives more than safe roster ids/names on the client (see
 * `ManagerPersonSelector`). The category switch is a pure presentation
 * concern: every section below reads from the SAME already-loaded model,
 * just organized differently -- switching category never triggers a
 * second fetch or a different server call.
 */
export default async function ManagerPage({ searchParams }: ManagerPageProps) {
  const rawParams = await searchParams;
  const params = parseManagerOverviewSearchParams(rawParams);
  const category = parseManagerCategoryParam(
    Array.isArray(rawParams.category) ? rawParams.category[0] : rawParams.category,
  );

  const result = await getRequestManagerOverview(params.personId, params.range, params.month);

  if (result.status === "forbidden") {
    return <ManagerForbiddenState />;
  }
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;
  const todayDate = model.localNow.date;
  const hrefParams = toHrefParams(model, category);
  const categoryNavCurrent = { range: hrefParams.range, month: hrefParams.month };
  // `ManagerPersonSummary` already carries personnelType/isSupervisor/
  // isTechnician -- passed straight through to `ManagerPersonSelector` so
  // it can group people the same way `ManagerRosterSection` does, instead
  // of stripping those fields to a bare `{id, name}` projection first.
  const people = model.roster;

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
        <ManagerCommandBar
          people={people}
          selectedPersonId={model.selectedPersonId}
          current={hrefParams}
          currentMonth={model.range.month}
          fetchedAt={model.fetchedAt}
        />
        <ManagerSelectedPersonView
          personId={model.selectedPersonId}
          person={{
            name: selected.person.name,
            isManager: selected.person.isManager,
            isTechnician: selected.person.isTechnician,
            isSupervisor: selected.person.isSupervisor,
          }}
          avatarUrl={model.selectedPersonId === model.manager.id ? model.manager.avatarUrl : null}
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
  const adoptionView = buildManagerAdoptionSectionView(model.adoption);

  const coverageByDatePeriod = new Map(
    model.coverageOverview.map((group) => [`${group.date}|${group.period}`, group]),
  );
  const issueViews = model.issues.map((issue, index) =>
    buildManagerIssueRowView(issue, todayDate, index, coverageByDatePeriod),
  );

  const potentialRowViews = model.potentialRequirements.map((row, index) =>
    buildManagerPotentialRowView(row, todayDate, index),
  );
  // A Potential problem's own `status` decides which "דורש טיפול" severity
  // bucket it joins: "missing" is as urgent as a critical operational issue,
  // "partial" (or an otherwise-covered requirement with a source conflict
  // worth a look) belongs alongside review-level issues. Never a third,
  // separately-labeled section -- the manager never needs to know this row
  // came from Potential reconciliation rather than `detectOperationalIssues`.
  const criticalItems: ManagerAttentionItem[] = [
    ...issueViews.filter((view) => view.severity === "critical").map((view) => ({ kind: "issue" as const, view })),
    ...potentialRowViews
      .filter((row) => row.status === "missing")
      .map((view) => ({ kind: "potential" as const, view })),
  ];
  const reviewItems: ManagerAttentionItem[] = [
    ...issueViews.filter((view) => view.severity === "review").map((view) => ({ kind: "issue" as const, view })),
    ...potentialRowViews
      .filter((row) => row.status !== "missing" && (row.status === "partial" || row.sourceConflictNote !== null))
      .map((view) => ({ kind: "potential" as const, view })),
  ];

  const shiftDayViews = buildManagerShiftDayViews(model.coverageOverview, todayDate);

  return (
    <div className="flex flex-col gap-6">
      <ManagerHeader />
      <ManagerCategoryNav active={category} current={categoryNavCurrent} />
      <ManagerCommandBar
        people={people}
        selectedPersonId={model.selectedPersonId}
        current={hrefParams}
        currentMonth={model.range.month}
        fetchedAt={model.fetchedAt}
        showFilters={category !== "logins"}
      />

      {category === "overview" ? (
        <>
          {summary ? <ManagerSummaryStrip summary={summary} /> : null}
          {model.managerShiftSnapshot ? (
            <ManagerShiftSnapshotSection
              snapshot={model.managerShiftSnapshot}
              todayDate={todayDate}
              fetchedAt={model.fetchedAt}
            />
          ) : null}
          <ManagerAttentionSection criticalItems={criticalItems} reviewItems={reviewItems} current={hrefParams} />
        </>
      ) : null}

      {category === "shifts" ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground sm:text-xl">כיסוי משמרות</h2>
            <Link
              href={scheduleEveryoneHref()}
              className="shrink-0 text-sm font-medium text-primary hover:underline"
            >
              ללוח הצוות המלא ←
            </Link>
          </div>
          <ManagerCoverageSection days={shiftDayViews} />
          <ManagerPotentialSection rows={potentialRowViews} />
        </div>
      ) : null}

      {category === "personnel" ? (
        <ManagerRosterSection
          roster={model.roster}
          current={hrefParams}
          managerId={model.manager.id}
          managerAvatarUrl={model.manager.avatarUrl}
        />
      ) : null}

      {category === "duties" ? (
        <ManagerDutiesAbsencesSection
          duties={model.duties.map((duty) => buildManagerDutyRowView(duty, todayDate))}
          absences={model.absences.map((absence) => buildManagerAbsenceRowView(absence, todayDate))}
        />
      ) : null}

      {category === "logins" ? (
        <div className="flex flex-col gap-4">
          <ManagerBroadcastArea
            roster={model.roster}
            adoptionPeople={model.adoption.status === "available" ? model.adoption.view.people : []}
          />
          <ManagerAdoptionSummary view={adoptionView} />
          <ManagerAdoptionSection view={adoptionView} />
        </div>
      ) : null}

      <ManagerSourceOfTruthNote />
    </div>
  );
}
