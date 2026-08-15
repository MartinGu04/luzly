import { CircleAlert, CircleCheck, CircleHelp } from "lucide-react";
import type { CoverageStatus } from "@/lib/domain/shiftCoverage";
import { coverageStatusLabel } from "@/lib/presentation/labels";

interface CoverageBadgeProps {
  status: CoverageStatus;
  className?: string;
}

const COVERAGE_ICON = {
  full: CircleCheck,
  partial: CircleAlert,
  missing: CircleAlert,
  not_evaluable: CircleHelp,
} as const;

const COVERAGE_TEXT_CLASS: Record<CoverageStatus, string> = {
  full: "text-success",
  partial: "text-warning",
  missing: "text-critical",
  not_evaluable: "text-muted",
};

/**
 * The one shared coverage-status presentation -- icon + friendly Hebrew
 * label + semantic color, driven only by the domain's own `CoverageStatus`
 * (never a raw enum string on screen). Used anywhere a shift's coverage
 * needs a first-class, at-a-glance treatment (the dashboard's
 * `CounterpartPanel`), so the tone/icon mapping lives in exactly one place.
 */
export function CoverageBadge({ status, className = "" }: CoverageBadgeProps) {
  const Icon = COVERAGE_ICON[status];

  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${COVERAGE_TEXT_CLASS[status]} ${className}`}>
      <Icon className={`h-3.5 w-3.5 ${status === "missing" ? "animate-issue-pulse" : ""}`} aria-hidden="true" strokeWidth={2} />
      {coverageStatusLabel(status)}
    </span>
  );
}
