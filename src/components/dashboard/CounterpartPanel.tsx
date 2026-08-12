import { CircleAlert, CircleCheck, CircleHelp, UserRound } from "lucide-react";
import type { PersonalCounterpart, PersonalShiftContext } from "@/lib/readModels/types";
import { coverageStatusLabel, periodLabel, roleLabel } from "@/lib/presentation/labels";
import { Badge } from "@/components/ui/Badge";

interface CounterpartPanelProps {
  context: PersonalShiftContext;
  compact?: boolean;
}

const COVERAGE_TONE = {
  full: "success",
  partial: "warning",
  missing: "critical",
  not_evaluable: "neutral",
} as const;

const COVERAGE_ICON = {
  full: CircleCheck,
  partial: CircleAlert,
  missing: CircleAlert,
  not_evaluable: CircleHelp,
} as const;

/**
 * "מי איתי?" -- contextual to one shift, never a standalone list of every
 * coworker's schedule. Renders only what the read model already scoped:
 * primary/shadow counterparts for this specific shift, plus its structural
 * coverage status. No colleague email/manager/capability data exists on
 * `PersonalCounterpart` to begin with.
 */
export function CounterpartPanel({ context, compact = false }: CounterpartPanelProps) {
  const hasCounterparts = context.primaryCounterparts.length > 0 || context.shadowCounterparts.length > 0;
  const CoverageIcon = COVERAGE_ICON[context.coverageStatus];
  const tone = COVERAGE_TONE[context.coverageStatus];

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">מי איתי?</h3>
        <span
          className={`flex items-center gap-1.5 text-xs font-medium ${
            tone === "success"
              ? "text-success"
              : tone === "warning"
                ? "text-warning"
                : tone === "critical"
                  ? "text-critical"
                  : "text-muted"
          }`}
        >
          <CoverageIcon
            className={`h-3.5 w-3.5 ${tone === "critical" ? "animate-issue-pulse" : ""}`}
            aria-hidden="true"
            strokeWidth={2}
          />
          {coverageStatusLabel(context.coverageStatus)}
        </span>
      </div>

      {hasCounterparts ? (
        <ul className="space-y-2">
          {context.primaryCounterparts.map((counterpart, index) => (
            <CounterpartRow key={`primary-${index}`} counterpart={counterpart} />
          ))}
          {context.shadowCounterparts.map((counterpart, index) => (
            <CounterpartRow key={`shadow-${index}`} counterpart={counterpart} shadow />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">אין מידע על אנשים נוספים במשמרת זו.</p>
      )}
    </div>
  );
}

function CounterpartRow({ counterpart, shadow }: { counterpart: PersonalCounterpart; shadow?: boolean }) {
  const role = roleLabel(counterpart.role);
  const period = periodLabel(counterpart.period);

  return (
    <li className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.05]">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted">
        <UserRound className="h-4 w-4" aria-hidden="true" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{counterpart.personName}</p>
        <p className="truncate text-xs text-muted">
          {[role, period].filter(Boolean).join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {shadow ? <Badge tone="primary">חפיפה / צל</Badge> : null}
        {counterpart.certainty === "tentative" ? <Badge tone="warning">משוער</Badge> : null}
      </div>
    </li>
  );
}
