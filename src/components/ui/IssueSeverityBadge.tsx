import { AlertCircle, AlertTriangle, Info, type LucideIcon } from "lucide-react";
import type { IssueSeverity } from "@/lib/domain/operationalIssues";

interface IssueSeverityBadgeProps {
  severity: IssueSeverity;
  className?: string;
}

const SEVERITY_ICON: Record<IssueSeverity, LucideIcon> = {
  critical: AlertCircle,
  review: AlertTriangle,
  info: Info,
};

export const ISSUE_SEVERITY_TEXT_CLASS: Record<IssueSeverity, string> = {
  critical: "text-critical",
  review: "text-warning",
  info: "text-accent",
};

export const ISSUE_SEVERITY_RING_CLASS: Record<IssueSeverity, string> = {
  critical: "ring-critical/20",
  review: "ring-warning/20",
  info: "ring-accent/20",
};

export const ISSUE_SEVERITY_BG_CLASS: Record<IssueSeverity, string> = {
  critical: "bg-critical/[0.06]",
  review: "bg-warning/[0.06]",
  info: "bg-accent/[0.06]",
};

/**
 * The one shared issue-severity icon/color mapping -- critical/red with a
 * restrained pulse on the icon only, review/orange, info/neutral accent.
 * Icon-only by design (same idiom as `CoverageBadge` owning coverage's
 * icon/color mapping) so callers stay free to add their own label/layout
 * around it. Reused by the dashboard's `IssuesPanel` and `/conflicts` so
 * the same finding never reads as a different severity in two places.
 */
export function IssueSeverityBadge({ severity, className = "" }: IssueSeverityBadgeProps) {
  const Icon = SEVERITY_ICON[severity];

  return (
    <Icon
      className={`${ISSUE_SEVERITY_TEXT_CLASS[severity]} ${severity === "critical" ? "animate-issue-pulse" : ""} ${className}`}
      aria-hidden="true"
      strokeWidth={2}
    />
  );
}
