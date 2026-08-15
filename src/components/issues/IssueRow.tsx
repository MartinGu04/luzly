import { ISSUE_SEVERITY_BG_CLASS, ISSUE_SEVERITY_TEXT_CLASS, IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import type { IssueRowView } from "./types";

interface IssueRowProps {
  view: IssueRowView;
}

function RecommendationDisclosure({ text }: { text: string }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer font-medium text-muted-2">פעולה מומלצת</summary>
      <p className="mt-1 text-muted">{text}</p>
    </details>
  );
}

/**
 * One issue as a flat readable row -- never its own colored card. Only the
 * small severity icon carries color/pulse; the row itself stays neutral so
 * a critical finding never turns the whole page red.
 *
 * Two layouts, chosen purely by whether `view.personName` is set (never a
 * separate prop): with a name (the manager's everyone-wide view) it leads
 * with "who, then their own role/shift", and the finding renders separately
 * below as its own severity-tinted callout, so a reader never has to guess
 * which line is the person's own role and which is what's missing. Without
 * a name (a person's own issues) the finding itself leads as plain text --
 * there's no one else to name first. Both layouts are pixel-identical to
 * the two components this one replaces (`/conflicts`'s `IssueRow` and the
 * manager's `ManagerIssueRow`).
 */
export function IssueRow({ view }: IssueRowProps) {
  if (view.personName) {
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
          {view.recommendation ? <RecommendationDisclosure text={view.recommendation} /> : null}
        </div>
      </li>
    );
  }

  return (
    <li className="flex items-start gap-3 py-3">
      <IssueSeverityBadge severity={view.severity} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium text-foreground">{view.reasonLabel}</p>
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
        {view.recommendation ? <RecommendationDisclosure text={view.recommendation} /> : null}
      </div>
    </li>
  );
}
