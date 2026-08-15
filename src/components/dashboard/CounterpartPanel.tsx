import { UserRound } from "lucide-react";
import type { PersonalCounterpart, PersonalShiftContext } from "@/lib/readModels/types";
import { periodLabel, roleLabel } from "@/lib/presentation/labels";
import { Badge } from "@/components/ui/Badge";
import { CoverageBadge } from "@/components/ui/CoverageBadge";

interface CounterpartPanelProps {
  context: PersonalShiftContext;
  compact?: boolean;
}

/**
 * "מי איתי?" -- contextual to one shift, never a standalone list of every
 * coworker's schedule. Renders only what the read model already scoped:
 * the shift ROSTER (everyone else actually assigned to this shift, any
 * role -- a same-role colleague, e.g. a second supervisor, shows up here
 * too) plus the separate, independent structural coverage status (see
 * `PersonalShiftContext` -- roster membership is never itself a coverage
 * signal). No colleague email/manager/capability data exists on
 * `PersonalCounterpart` to begin with.
 */
export function CounterpartPanel({ context, compact = false }: CounterpartPanelProps) {
  const hasCounterparts = context.primaryCounterparts.length > 0 || context.shadowCounterparts.length > 0;

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">מי איתי?</h3>
        <CoverageBadge status={context.coverageStatus} />
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
    <li className="flex items-center gap-3 rounded-xl bg-overlay-faint px-3 py-2.5 ring-1 ring-border">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-overlay-soft text-muted">
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
