import { ShieldCheck } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import { issueSeverityLabel } from "@/lib/presentation/labels";
import { ManagerIssueRow } from "./ManagerIssueRow";
import { ManagerPotentialRow } from "./ManagerPotentialRow";
import type { ManagerIssueRowView, ManagerPotentialRowView } from "./types";

interface ManagerAttentionSectionProps {
  criticalIssues: ManagerIssueRowView[];
  reviewIssues: ManagerIssueRowView[];
  potentialProblems: ManagerPotentialRowView[];
}

/**
 * "מה דורש התייחסות?" -- the first thing the manager sees (PR #14 §20/§22):
 * critical operational issues, issues worth reviewing, and deterministic
 * Potential-vs-internal conflicts, across everyone. Empty (a single calm
 * success state) only when all three are empty.
 */
export function ManagerAttentionSection({
  criticalIssues,
  reviewIssues,
  potentialProblems,
}: ManagerAttentionSectionProps) {
  const isEmpty = criticalIssues.length === 0 && reviewIssues.length === 0 && potentialProblems.length === 0;

  if (isEmpty) {
    return (
      <Panel variant="hero" className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" strokeWidth={1.75} />
        <p className="text-sm font-medium text-foreground">אין כרגע דברים שדורשים התייחסות בטווח שנבחר</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {criticalIssues.length > 0 ? (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
            <IssueSeverityBadge severity="critical" className="h-4 w-4" />
            {issueSeverityLabel("critical")}
            <span className="text-sm font-normal text-muted-2">· {criticalIssues.length}</span>
          </h2>
          <Panel variant="panel" className="mt-2">
            <ul className="divide-y divide-border">
              {criticalIssues.map((view) => (
                <ManagerIssueRow key={view.key} view={view} />
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}

      {reviewIssues.length > 0 ? (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
            <IssueSeverityBadge severity="review" className="h-4 w-4" />
            {issueSeverityLabel("review")}
            <span className="text-sm font-normal text-muted-2">· {reviewIssues.length}</span>
          </h2>
          <Panel variant="panel" className="mt-2">
            <ul className="divide-y divide-border">
              {reviewIssues.map((view) => (
                <ManagerIssueRow key={view.key} view={view} />
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}

      {potentialProblems.length > 0 ? (
        <section>
          <h2 className="flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
            דרישות Potential שדורשות בדיקה
            <span className="text-sm font-normal text-muted-2">· {potentialProblems.length}</span>
          </h2>
          <Panel variant="panel" className="mt-2">
            <ul className="divide-y divide-border">
              {potentialProblems.map((view) => (
                <ManagerPotentialRow key={view.key} view={view} />
              ))}
            </ul>
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
