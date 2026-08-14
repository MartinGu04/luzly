import { AlertCircle, ListChecks } from "lucide-react";

interface ConflictsSummaryProps {
  /** Already-formatted, e.g. "2 דחופים · 1 לבדיקה" -- built by `issueSummaryLabel`. Only ever rendered when this exists (2+ distinct severities present) -- see the page: a single-severity page already says the count via its own group heading, so this never duplicates that. */
  summary: string;
  /** Whether any issue in `summary` is critical -- purely a styling signal (icon/color), never new count text beyond what `summary` already says. */
  hasCritical: boolean;
}

/**
 * A restrained inline strip -- never another KPI dashboard, never a fake
 * health score. Only its icon/color react to `hasCritical`; the text
 * itself is exactly `issueSummaryLabel`'s own already-tested output.
 */
export function ConflictsSummary({ summary, hasCritical }: ConflictsSummaryProps) {
  const Icon = hasCritical ? AlertCircle : ListChecks;

  return (
    <p
      className={`flex items-center gap-1.5 text-sm font-medium ${hasCritical ? "text-critical" : "text-muted"}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" strokeWidth={1.75} />
      {summary}
    </p>
  );
}
