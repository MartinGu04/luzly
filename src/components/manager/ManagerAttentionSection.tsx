import { ShieldCheck } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import { IssueRow } from "@/components/issues/IssueRow";
import { issueSeverityLabel } from "@/lib/presentation/labels";
import { ManagerPotentialRow } from "./ManagerPotentialRow";
import type { ManagerAttentionItem } from "./types";

interface ManagerAttentionSectionProps {
  criticalItems: ManagerAttentionItem[];
  reviewItems: ManagerAttentionItem[];
}

function AttentionItemRow({ item }: { item: ManagerAttentionItem }) {
  return item.kind === "issue" ? <IssueRow view={item.view} /> : <ManagerPotentialRow view={item.view} />;
}

function AttentionGroup({
  severity,
  items,
}: {
  severity: "critical" | "review";
  items: ManagerAttentionItem[];
}) {
  if (items.length === 0) return null;

  return (
    <section>
      <h3 className="flex items-center gap-2 text-lg font-bold text-foreground sm:text-xl">
        <IssueSeverityBadge severity={severity} className="h-4 w-4" />
        {issueSeverityLabel(severity)}
        <span className="text-sm font-normal text-muted-2">· {items.length}</span>
      </h3>
      <Panel variant="panel" className="mt-2">
        <ul className="divide-y divide-border">
          {items.map((item) => (
            <AttentionItemRow key={item.view.key} item={item} />
          ))}
        </ul>
      </Panel>
    </section>
  );
}

/**
 * "דورש טיפול" -- the one place that answers "יש בעיה? תראה לי את הבעיה":
 * every already-detected operational issue (blocking absences, coverage
 * gaps, invalid shift times, role mismatches) AND every Potential-vs-
 * internal staffing problem, across everyone, merged into two plain
 * severity groups -- never split by which internal engine found them. A
 * manager reading this never needs to know the difference between a
 * "conflict", a "coverage issue", or a "Potential mismatch" -- that
 * distinction stays purely internal (`ManagerAttentionItem.kind`), used
 * only to pick which row component renders a given entry. Detection logic
 * itself is entirely reused from `detectOperationalIssues` and
 * `reconcilePotentialAllocations` -- this component only presents,
 * never re-derives. Empty (a single calm success state) only when both
 * groups are empty.
 */
export function ManagerAttentionSection({ criticalItems, reviewItems }: ManagerAttentionSectionProps) {
  const isEmpty = criticalItems.length === 0 && reviewItems.length === 0;

  if (isEmpty) {
    return (
      <Panel variant="hero" className="flex items-center gap-3">
        <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" strokeWidth={1.75} />
        <p className="text-sm font-medium text-foreground">אין כרגע דברים שדורשים טיפול בטווח שנבחר</p>
      </Panel>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold text-foreground sm:text-2xl">דורש טיפול</h2>
      <AttentionGroup severity="critical" items={criticalItems} />
      <AttentionGroup severity="review" items={reviewItems} />
    </div>
  );
}
