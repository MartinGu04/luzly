import { Panel } from "@/components/ui/Panel";
import { CoverageBadge } from "@/components/ui/CoverageBadge";
import { TeammateRow } from "./TeammateRow";
import type { ShiftContextView } from "./types";

interface ShiftContextCardProps {
  view: ShiftContextView;
  /** The dominant/focused card gets the stronger hero surface; a secondary card stays calmer. */
  emphasized: boolean;
}

const SHOWS_MISSING_CALLOUT: ReadonlySet<ShiftContextView["coverageStatus"]> = new Set(["partial", "missing"]);

/**
 * One shift's team context: title/date, coverage status, an optional
 * missing-coverage callout, then the primary and shadow teammate sections
 * kept visually distinct -- a shadow/handover teammate is never presented
 * as resolving a coverage gap.
 */
export function ShiftContextCard({ view, emphasized }: ShiftContextCardProps) {
  const hasCounterparts = view.primaryCounterparts.length > 0 || view.shadowCounterparts.length > 0;
  const showsMissingCallout = SHOWS_MISSING_CALLOUT.has(view.coverageStatus) && view.missingIntervalLabels.length > 0;

  return (
    <Panel variant={emphasized ? "hero" : "panel"}>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0">
          <h3 className={`flex items-center gap-1.5 font-bold text-foreground ${emphasized ? "text-lg sm:text-xl" : "text-base"}`}>
            {view.emoji ? <span aria-hidden="true">{view.emoji}</span> : null}
            {view.title}
          </h3>
          <p className="mt-1 text-sm text-muted">
            {view.dateLabel}
            {view.hebrewCalendarLabel ? ` · ${view.hebrewCalendarLabel}` : ""}
          </p>
        </div>
        <CoverageBadge status={view.coverageStatus} />
      </div>

      {showsMissingCallout ? (
        <p className="mt-3 rounded-lg bg-overlay-soft px-3 py-2 text-xs text-muted">
          <span className="font-medium text-foreground">חסר כיסוי:</span>{" "}
          <span dir="ltr" className="tabular-nums">
            {view.missingIntervalLabels.join(" · ")}
          </span>
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {view.primaryCounterparts.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-muted-2">הצוות איתך</h4>
            <ul className="mt-2 space-y-2">
              {view.primaryCounterparts.map((counterpart, index) => (
                <TeammateRow key={`primary-${counterpart.personId}-${index}`} counterpart={counterpart} />
              ))}
            </ul>
          </div>
        ) : null}

        {view.shadowCounterparts.length > 0 ? (
          <div>
            <h4 className="text-xs font-semibold text-muted-2">חפיפה / צל</h4>
            <ul className="mt-2 space-y-2">
              {view.shadowCounterparts.map((counterpart, index) => (
                <TeammateRow key={`shadow-${counterpart.personId}-${index}`} counterpart={counterpart} shadow />
              ))}
            </ul>
          </div>
        ) : null}

        {!hasCounterparts && view.emptyCounterpartMessage ? (
          <p className="text-sm text-muted">{view.emptyCounterpartMessage}</p>
        ) : null}
      </div>
    </Panel>
  );
}
