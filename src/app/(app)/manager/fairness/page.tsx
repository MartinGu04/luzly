import { ConfigurationErrorState } from "@/components/dashboard/ConfigurationErrorState";
import { ManagerForbiddenState } from "@/components/manager/ManagerForbiddenState";
import { ManagerSourceOfTruthNote } from "@/components/manager/ManagerSourceOfTruthNote";
import { ManagerSummaryStrip } from "@/components/manager/ManagerSummaryStrip";
import { ManagerFairnessChart } from "@/components/manager/fairness/ManagerFairnessChart";
import { ManagerFairnessHeader } from "@/components/manager/fairness/ManagerFairnessHeader";
import { ManagerFairnessPeriodSelector } from "@/components/manager/fairness/ManagerFairnessPeriodSelector";
import {
  ManagerFairnessPersonDetail,
  type ManagerFairnessPersonDetailView,
} from "@/components/manager/fairness/ManagerFairnessPersonDetail";
import { ManagerFairnessTable } from "@/components/manager/fairness/ManagerFairnessTable";
import { ManagerFairnessTargetsNote } from "@/components/manager/fairness/ManagerFairnessTargetsNote";
import type { ManagerFairnessRowCardView } from "@/components/manager/fairness/types";
import { Panel } from "@/components/ui/Panel";
import {
  exemptionBadgeLabel,
  formatFairnessDelta,
  formatFairnessGap,
  formatFairnessScore,
  formatFairnessWeekendCount,
  formatNormalizedLoad,
} from "@/lib/presentation/fairness";
import { managerFairnessSummaryLabel } from "@/lib/presentation/managerFairnessSummary";
import { buildManagerFairnessHref } from "@/lib/presentation/managerFairnessUrl";
import { getRequestManagerFairness } from "@/lib/readModels/getRequestManagerFairness";
import { parseManagerFairnessSearchParams } from "@/lib/readModels/managerFairnessParams";
import type { ManagerFairnessPersonRowView, ManagerFairnessReadModel } from "@/lib/readModels/managerFairnessTypes";

type SearchParamValue = string | string[] | undefined;

interface ManagerFairnessPageProps {
  searchParams: Promise<{
    period?: SearchParamValue;
    person?: SearchParamValue;
  }>;
}

function buildRowCardView(row: ManagerFairnessPersonRowView, period: ManagerFairnessReadModel["period"]): ManagerFairnessRowCardView {
  return {
    key: row.key,
    sourceName: row.sourceName,
    href: row.personId ? buildManagerFairnessHref({ period: period.key, personId: row.personId }) : null,
    allocationLabel: row.allocationLabel,
    previousLabel: formatFairnessScore(row.previousScore),
    currentLabel: formatFairnessScore(row.currentScore),
    deltaLabel: formatFairnessDelta(row.delta),
    isDeltaNew: row.delta === null,
    targetLabel: row.comparisonTarget !== null ? formatFairnessScore(row.comparisonTarget) : null,
    gapLabel: row.gapToTarget !== null ? formatFairnessGap(row.gapToTarget) : null,
    weekendLabel: formatFairnessWeekendCount(row.weekendCount),
    exemptionBadges: row.exemptions.map(exemptionBadgeLabel),
  };
}

function buildPersonDetailView(
  row: ManagerFairnessPersonRowView,
  period: ManagerFairnessReadModel["period"],
): ManagerFairnessPersonDetailView {
  return {
    sourceName: row.sourceName,
    allocationLabel: row.allocationLabel,
    previousLabel: formatFairnessScore(row.previousScore),
    currentLabel: formatFairnessScore(row.currentScore),
    deltaLabel: formatFairnessDelta(row.delta),
    targetLabel: row.comparisonTarget !== null ? formatFairnessScore(row.comparisonTarget) : null,
    gapLabel: row.gapToTarget !== null ? formatFairnessGap(row.gapToTarget) : null,
    normalizedLoadLabel: row.normalizedLoad !== null ? formatNormalizedLoad(row.normalizedLoad) : null,
    weekendLabel: formatFairnessWeekendCount(row.weekendCount),
    exemptionBadges: row.exemptions.map(exemptionBadgeLabel),
    backHref: buildManagerFairnessHref({ period: period.key, personId: null }),
  };
}

/**
 * "טבלת צדק" -- the manager-only Fairness experience (PR #15), built
 * entirely from `ManagerFairnessReadModel`. Never parses raw Google Sheet
 * cells itself, never re-derives the authoritative `currentScore`, and
 * never recommends who should be assigned next (that's PR #16).
 */
export default async function ManagerFairnessPage({ searchParams }: ManagerFairnessPageProps) {
  const rawParams = await searchParams;
  const params = parseManagerFairnessSearchParams(rawParams);

  const result = await getRequestManagerFairness(params.period, params.personId);

  if (result.status === "forbidden") {
    return <ManagerForbiddenState />;
  }
  if (result.status !== "ok") {
    return <ConfigurationErrorState />;
  }

  const { model } = result;

  if (model.selectedPersonId) {
    const selectedRow = model.rows.find((row) => row.personId === model.selectedPersonId);
    if (selectedRow) {
      return (
        <div className="flex flex-col gap-6">
          <ManagerFairnessHeader periodLabel={model.period.label} />
          <ManagerFairnessPersonDetail view={buildPersonDetailView(selectedRow, model.period)} />
          <ManagerSourceOfTruthNote />
        </div>
      );
    }
  }

  const summary = managerFairnessSummaryLabel(model);
  const rowViews = model.rows.map((row) => buildRowCardView(row, model.period));

  return (
    <div className="flex flex-col gap-6">
      <ManagerFairnessHeader periodLabel={model.period.label} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ManagerFairnessPeriodSelector current={model.period.key} />
        <ManagerFairnessTargetsNote
          supervisorTarget={model.targets.supervisorTarget}
          technicianTarget={model.targets.technicianTarget}
        />
      </div>

      {summary ? <ManagerSummaryStrip summary={summary} /> : null}

      <Panel variant="panel">
        <h2 className="text-sm font-semibold text-foreground">חלוקת הניקוד הנוכחי בצוות</h2>
        <p className="mt-1 text-xs text-muted">
          יעדי ההקצאה משתנים בין תפקידים; התרשים מציג את חלוקת הניקוד הגולמי בלבד.
        </p>
        <div className="mt-4">
          <ManagerFairnessChart slices={model.chartSlices} />
        </div>
      </Panel>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">טבלת צדק</h2>
        <ManagerFairnessTable rows={rowViews} />
      </section>

      <ManagerSourceOfTruthNote />
    </div>
  );
}
