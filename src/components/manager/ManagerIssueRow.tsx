import { ISSUE_SEVERITY_BG_CLASS, ISSUE_SEVERITY_TEXT_CLASS, IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import type { ManagerIssueRowView } from "./types";

interface ManagerIssueRowProps {
  view: ManagerIssueRowView;
}

/**
 * One issue as a flat readable row, same restrained idiom as `/conflicts`'s
 * `IssueRow` -- reuses the exact same shared `IssueSeverityBadge` mapping
 * so a finding never reads as a different severity in two places. Leads
 * with the affected person's name (unlike `/conflicts`, this spans
 * everyone, not "your own" issues), followed by their OWN role/shift
 * (`targetTitle`, e.g. "אחמ״ש יום") on the same line -- "who" and "what
 * their assignment is". The finding itself (`reasonLabel` -- already the
 * specific missing role when the domain data proves it, e.g. "חסר טכנאי
 * למשמרת", never the generic "חסר כיסוי" once a role is known) renders
 * separately below in its own severity-tinted callout, so a reader never
 * has to guess which line is the person's own role and which is what's
 * missing (Design Pass follow-up, admin hierarchy clarity).
 */
export function ManagerIssueRow({ view }: ManagerIssueRowProps) {
  return (
    <li className="flex items-start gap-3 py-3">
      <IssueSeverityBadge severity={view.severity} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {view.personName}
            {view.targetTitle ? (
              <span className="font-normal text-muted">
                {" · "}
                {view.targetEmoji ? <span aria-hidden="true">{view.targetEmoji} </span> : null}
                {view.targetTitle}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted">{view.dateLabel}</p>
        </div>

        <p
          className={`inline-flex w-fit items-center rounded-lg px-2 py-1 text-xs font-semibold ${ISSUE_SEVERITY_TEXT_CLASS[view.severity]} ${ISSUE_SEVERITY_BG_CLASS[view.severity]}`}
        >
          {view.reasonLabel}
        </p>

        {view.missingIntervalLabels && view.missingIntervalLabels.length > 0 ? (
          <p className="rounded-lg bg-overlay-soft px-3 py-2 text-xs text-muted">
            <span className="font-medium text-foreground">שעות חסרות:</span>{" "}
            <span dir="ltr" className="tabular-nums">
              {view.missingIntervalLabels.join(" · ")}
            </span>
          </p>
        ) : null}

        {view.explanation ? <p className="text-xs text-muted">{view.explanation}</p> : null}
        <p className="text-xs text-muted-2">{view.guidance}</p>
      </div>
    </li>
  );
}
