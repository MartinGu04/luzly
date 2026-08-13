import { ConflictsEmptyState } from "@/components/conflicts/ConflictsEmptyState";
import { ConflictsHeader } from "@/components/conflicts/ConflictsHeader";
import { ConflictsSummary } from "@/components/conflicts/ConflictsSummary";
import { IssueSeverityGroup } from "@/components/conflicts/IssueSeverityGroup";
import type { ConflictIssueView } from "@/components/conflicts/types";
import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { DataFreshnessStatus } from "@/components/ui/DataFreshnessStatus";
import type { IssueSeverity } from "@/lib/domain/operationalIssues";
import {
  issueDateLabel,
  issueExplanation,
  issueGuidanceLabel,
  issueSummaryLabel,
  issueTargetEmoji,
  issueTargetTitle,
} from "@/lib/presentation/issue";
import { issueReasonLabel } from "@/lib/presentation/labels";
import { formatMissingIntervals } from "@/lib/presentation/scheduleTime";
import { getRequestPersonalSchedule } from "@/lib/readModels/getRequestPersonalSchedule";
import type { PersonalIssue } from "@/lib/readModels/types";

const SEVERITY_GROUP_ORDER: IssueSeverity[] = ["critical", "review", "info"];

function buildConflictIssueView(issue: PersonalIssue, todayDate: string, index: number): ConflictIssueView {
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

/**
 * "התנגשויות ובדיקות" -- the authenticated person's own existing safe
 * issue list, grouped by severity. NOT a manager-wide dashboard, NOT
 * historical analytics, NOT schedule editing -- entirely driven by the
 * already-filtered `PersonalScheduleReadModel.issues`. By the time this
 * renders, the protected `(app)` layout has already gated everything but
 * "ok"/"configuration_error", same convention as the dashboard, `/schedule`,
 * `/duties`, and `/with-me`. Calling `getRequestPersonalSchedule()` again
 * reuses the SAME request-scoped result the layout already computed -- no
 * second Google request, no re-running `detectOperationalIssues()`, no new
 * read-model field.
 */
export default async function ConflictsPage() {
  const result = await getRequestPersonalSchedule();
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;
  const todayDate = model.localNow.date;

  const views = model.issues.map((issue, index) => buildConflictIssueView(issue, todayDate, index));
  const summary = issueSummaryLabel(model.issues);

  return (
    <div className="flex flex-col gap-6">
      <ConflictsHeader />
      <DataFreshnessStatus fetchedAt={model.fetchedAt} />

      {views.length === 0 ? (
        <ConflictsEmptyState />
      ) : (
        <>
          {summary ? <ConflictsSummary summary={summary} /> : null}
          {SEVERITY_GROUP_ORDER.map((severity) => (
            <IssueSeverityGroup
              key={severity}
              severity={severity}
              views={views.filter((view) => view.severity === severity)}
            />
          ))}
        </>
      )}
    </div>
  );
}
