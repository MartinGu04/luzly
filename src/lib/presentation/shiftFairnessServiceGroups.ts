import { type PersonnelServiceCategory } from "@/lib/domain/personnelType";
import { personnelTypeGroupLabel } from "@/lib/presentation/roster";
import type { ShiftFairnessCardView } from "@/lib/presentation/fairnessCards";

/**
 * PR #4 follow-up -- Shift Fairness ONLY (never Duty Fairness, never the
 * calculation engine): a purely PRESENTATION subdivision of each role
 * section's cards by service type. The Fairness comparison itself stays
 * role-based (supervisor vs. supervisor, technician vs. technician,
 * `fairnessGroups.ts`, unchanged) -- service type never becomes a
 * comparison group, only an internal visual grouping within a role
 * section that's already been decided.
 */
export interface ShiftFairnessServiceSubgroupView {
  key: PersonnelServiceCategory;
  label: string;
  cards: readonly ShiftFairnessCardView[];
}

/**
 * סדיר first, then קבע, then מילואים, "לא מסווג" last -- the order this
 * feature asks for, DELIBERATELY different from `roster.ts`'s own
 * `TOP_GROUP_ORDER` (קבע/סדיר/מילואים/לא מסווג), which serves a different
 * screen with its own established order; this one is scoped to Shift
 * Fairness's own subgrouping only. "unclassified" is a real, already-
 * existing `PersonnelServiceCategory` (`classifyPersonnelType`'s own
 * fallback for a missing/unrecognized `personnelType`) -- included here
 * only as a safety net for data the classifier genuinely cannot place,
 * never a guessed category, and (like every subgroup) simply omitted
 * whenever it has no members.
 */
const SERVICE_SUBGROUP_ORDER: readonly PersonnelServiceCategory[] = ["regular", "permanent", "reserve", "unclassified"];

/**
 * Buckets `cards` (already-built Shift Fairness card views, one role
 * section's worth, already visibility-filtered by the caller) by each
 * card's own `serviceCategory` -- carried straight off the read model's
 * row (`ShiftFairnessPersonRowView.serviceCategory`, resolved once in
 * `buildShiftFairnessReadModel`), never re-derived or looked up from a
 * separate roster here. Preserves each card's existing relative order
 * within its subgroup -- never re-sorts. A subgroup with zero cards is
 * omitted entirely, never rendered as an empty heading.
 */
export function groupShiftFairnessCardsByServiceType(
  cards: readonly ShiftFairnessCardView[],
): ShiftFairnessServiceSubgroupView[] {
  const bySubgroup = new Map<PersonnelServiceCategory, ShiftFairnessCardView[]>();
  for (const card of cards) {
    const bucket = bySubgroup.get(card.serviceCategory);
    if (bucket) bucket.push(card);
    else bySubgroup.set(card.serviceCategory, [card]);
  }

  const result: ShiftFairnessServiceSubgroupView[] = [];
  for (const key of SERVICE_SUBGROUP_ORDER) {
    const subCards = bySubgroup.get(key);
    if (!subCards || subCards.length === 0) continue;
    result.push({ key, label: personnelTypeGroupLabel(key), cards: subCards });
  }
  return result;
}
