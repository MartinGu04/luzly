import type { ManagerFairnessReadModel } from "@/lib/readModels/managerFairnessTypes";

function trimmedNumber(value: number): string {
  return value.toFixed(2).replace(/\.?0+$/, "");
}

type ManagerFairnessSummaryInput = Pick<ManagerFairnessReadModel, "rows" | "totals">;

/**
 * "סה"כ ניקוד נוכחי 42.5 · סה"כ סופי שבוע 18 · 3 אנשי צוות עם פטורים" -- a
 * restrained summary line (PR #15 §26), only ever meaningful non-empty
 * facts. Never a KPI dashboard, never a fairness verdict.
 *
 * Uses the sheet's own SOURCE-REPORTED total ("סך הכל:") only -- that is
 * the workbook's own context, and the only number honestly labeled as a
 * "total" here. It deliberately never falls back to the independently
 * computed sum of displayed rows (see `sumDisplayedFairnessRows`): that
 * sum is a different fact, not a substitute total, and presenting it
 * under the same "סה"כ" label would misrepresent it as the sheet's own
 * total (hardening pass).
 */
export function managerFairnessSummaryLabel(model: ManagerFairnessSummaryInput): string | null {
  const totalCurrentScore = model.totals?.reportedCurrentTotal ?? null;
  const totalWeekends = model.totals?.reportedWeekendTotal ?? null;
  const exemptCount = model.rows.filter((row) => row.exemptions.length > 0).length;

  const parts: string[] = [];
  if (totalCurrentScore !== null) parts.push(`סה"כ ניקוד נוכחי ${trimmedNumber(totalCurrentScore)}`);
  if (totalWeekends !== null) parts.push(`סה"כ סופי שבוע ${trimmedNumber(totalWeekends)}`);
  if (exemptCount > 0) {
    parts.push(exemptCount === 1 ? "איש/ת צוות אחת עם פטור" : `${exemptCount} אנשי צוות עם פטורים`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
