interface ConflictsSummaryProps {
  /** Already-formatted, e.g. "2 דחופים · 1 לבדיקה" -- built by `issueSummaryLabel`. */
  summary: string;
}

/** A restrained inline strip -- never another KPI dashboard. */
export function ConflictsSummary({ summary }: ConflictsSummaryProps) {
  return <p className="text-sm font-medium text-muted">{summary}</p>;
}
