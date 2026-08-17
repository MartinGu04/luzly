import Link from "next/link";
import type { ReactNode } from "react";
import { ISSUE_SEVERITY_BG_CLASS, ISSUE_SEVERITY_TEXT_CLASS, IssueSeverityBadge } from "@/components/ui/IssueSeverityBadge";
import type { IssueRecommendationTextPart, IssueRecommendationView } from "@/lib/presentation/issueRecommendation";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";
import type { IssueRowView } from "./types";

interface IssueRowProps {
  view: IssueRowView;
  /**
   * The manager's current range/month/problems URL state (PR #37's own
   * `ManagerRosterSection` pattern) -- only ever needed when `view.recommendation`
   * is set (the manager's everyone-wide "דורש טיפול" list), so every OTHER
   * caller (a person's own issues, the selected-person drill-down) simply
   * never passes it. Threading it through lets a candidate's name link to
   * `/manager?person=<personId>` while preserving whatever range/month the
   * manager is currently looking at, via the SAME `buildManagerHref` helper
   * `ManagerRosterSection` already uses -- never a second URL builder.
   */
  current?: ManagerHrefParams;
}

/**
 * A subtle, keyboard-accessible inline link for one recommended candidate --
 * clearly clickable (underline + primary color, same restrained treatment
 * as every other inline text link in this app) but never a button-like
 * treatment that would compete with the quiet "פעולה מומלצת" copy around it.
 * Falls back to plain (non-linked) text in the defensive case `current`
 * wasn't supplied -- this only happens if a caller renders a recommendation
 * without also passing `current`, which never happens from `ManagerAttentionSection`.
 */
function CandidateLink({ personId, personName, current }: { personId: string; personName: string; current?: ManagerHrefParams }) {
  if (!current) return <>{personName}</>;
  return (
    <Link
      href={buildManagerHref({ ...current, personId })}
      className="rounded-sm font-medium text-primary underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {personName}
    </Link>
  );
}

/** Renders a recommendation sentence's structured parts -- literal text as-is, each candidate as its own `CandidateLink`. Never reconstructs/parses a name; every candidate part already carries its own `personId`. */
function renderTextParts(parts: readonly IssueRecommendationTextPart[], current?: ManagerHrefParams): ReactNode {
  return parts.map((part, index) =>
    part.kind === "text" ? (
      part.value
    ) : (
      <CandidateLink key={`${part.personId}-${index}`} personId={part.personId} personName={part.personName} current={current} />
    ),
  );
}

/**
 * "פעולה מומלצת" -- collapsed by default, always secondary to the problem
 * above it. Purely presentational: every string here already arrived
 * fully-built from `buildIssueRecommendationView` (PR #37) -- this
 * component never decides eligibility/wording itself. The last-resort
 * fallback (only ever present when the missing role is a technician and
 * every regular technician was exhausted) is a SECOND, NESTED `<details>`
 * inside the first -- closed by default independently, so opening the
 * outer disclosure alone never reveals it. No alarming styling anywhere:
 * same quiet muted-text language as the rest of this row, except each
 * candidate's own name, which links to their manager drill-down.
 */
function RecommendationDisclosure({ view, current }: { view: IssueRecommendationView; current?: ManagerHrefParams }) {
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer font-medium text-muted-2">פעולה מומלצת</summary>
      <div className="mt-1 space-y-1 text-muted">
        <p>{renderTextParts(view.primaryText, current)}</p>
        {view.disclaimer ? <p className="text-muted-2">{view.disclaimer}</p> : null}
        {view.lastResort ? (
          <details className="mt-1">
            <summary className="cursor-pointer font-medium text-muted-2">{view.lastResort.triggerLabel}</summary>
            <div className="mt-1 space-y-1">
              <p>{renderTextParts(view.lastResort.text, current)}</p>
              <p className="text-muted-2">{view.lastResort.disclaimer}</p>
            </div>
          </details>
        ) : null}
      </div>
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
export function IssueRow({ view, current }: IssueRowProps) {
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
          {view.recommendation ? <RecommendationDisclosure view={view.recommendation} current={current} /> : null}
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
        {view.recommendation ? <RecommendationDisclosure view={view.recommendation} current={current} /> : null}
      </div>
    </li>
  );
}
