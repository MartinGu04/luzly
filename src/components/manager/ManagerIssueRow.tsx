import { IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import type { ManagerIssueRowView } from "./types";

interface ManagerIssueRowProps {
  view: ManagerIssueRowView;
}

/**
 * One issue as a flat readable row, same restrained idiom as `/conflicts`'s
 * `IssueRow` -- reuses the exact same shared `IssueSeverityBadge` mapping
 * so a finding never reads as a different severity in two places. Leads
 * with the affected person's name (unlike `/conflicts`, this spans
 * everyone, not "your own" issues).
 */
export function ManagerIssueRow({ view }: ManagerIssueRowProps) {
  return (
    <li className="flex items-start gap-3 py-3">
      <IssueSeverityBadge severity={view.severity} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">
          <span className="font-semibold">{view.personName}</span> · {view.reasonLabel}
        </p>
        <p className="text-xs text-muted">{view.dateLabel}</p>

        {view.targetTitle ? (
          <p className="text-xs text-muted">
            {view.targetEmoji ? <span aria-hidden="true">{view.targetEmoji} </span> : null}
            {view.targetTitle}
          </p>
        ) : null}

        {view.missingIntervalLabels && view.missingIntervalLabels.length > 0 ? (
          <p className="mt-2 rounded-lg bg-overlay-soft px-3 py-2 text-xs text-muted">
            <span className="font-medium text-foreground">חסר כיסוי:</span>{" "}
            <span dir="ltr" className="tabular-nums">
              {view.missingIntervalLabels.join(" · ")}
            </span>
          </p>
        ) : null}

        {view.explanation ? <p className="mt-1 text-xs text-muted">{view.explanation}</p> : null}
        <p className="mt-1 text-xs text-muted-2">{view.guidance}</p>
      </div>
    </li>
  );
}
