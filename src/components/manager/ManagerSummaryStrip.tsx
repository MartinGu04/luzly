interface ManagerSummaryStripProps {
  summary: string;
}

/** A restrained inline strip -- decision support, never a KPI dashboard. */
export function ManagerSummaryStrip({ summary }: ManagerSummaryStripProps) {
  return <p className="text-sm font-medium text-muted">{summary}</p>;
}
