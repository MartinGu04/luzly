import type { FairnessStatus } from "@/lib/domain/fairnessFoundation";

/**
 * The shared below/balanced/above vocabulary in Hebrew (PR #4) -- used
 * identically for Shift and Duty Fairness, since both now share the same
 * `FairnessStatus` type (`fairnessFoundation.ts`). A `null` status is
 * deliberately NOT a fourth verdict -- it means the comparison itself
 * could not honestly be produced, so its label says exactly that rather
 * than implying a real (if unusual) status.
 */
export function fairnessStatusLabel(status: FairnessStatus | null): string {
  if (status === "below") return "מתחת ליעד";
  if (status === "balanced") return "מאוזן";
  if (status === "above") return "מעל היעד";
  return "לא ניתן לחשב יעד מלא";
}
