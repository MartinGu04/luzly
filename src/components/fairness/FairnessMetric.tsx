interface FairnessMetricProps {
  /** Self-explanatory Hebrew label -- never an abbreviation that needs prior knowledge (PR #51 follow-up, e.g. "משמרות שבוצעו" not "בוצעו"). */
  label: string;
  value: string;
  /** Optional restrained status tint (from `fairnessStatusTintTextClass`) for a value tied to a status, e.g. a gap figure -- omitted for a plain neutral value. */
  toneClassName?: string;
  testId?: string;
}

/**
 * One label/value cell for a Fairness card's metric grid (PR #51 follow-up)
 * -- label small and muted above, value prominent below, the same visual
 * language the existing detail-overlay `Stat` already uses, scaled down to
 * fit inside a compact card grid alongside two or three siblings. Kept as
 * ONE shared component (not duplicated per card type) so Shift and Duty
 * cards read with the exact same label/value hierarchy.
 */
export function FairnessMetric({ label, value, toneClassName, testId }: FairnessMetricProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-testid={testId}>
      <span className="truncate text-[11px] text-muted-2">{label}</span>
      <span className={`truncate text-sm font-semibold ${toneClassName ?? "text-foreground"}`}>{value}</span>
    </div>
  );
}
