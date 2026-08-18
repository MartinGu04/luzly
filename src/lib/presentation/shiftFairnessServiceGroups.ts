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
 * section's worth) by each card's own service category, looked up from
 * `serviceCategoryByPersonId` (built by the caller via `classifyPersonnelType`
 * over the roster -- this function never re-derives or guesses a category
 * itself). Preserves each card's existing relative order within its
 * subgroup -- never re-sorts. A subgroup with zero cards is omitted
 * entirely, never rendered as an empty heading. A card whose id has no
 * entry in the map (should not happen in practice -- every row comes from
 * the same roster the map is built from) safely falls to "unclassified"
 * rather than being silently dropped.
 */
export function groupShiftFairnessCardsByServiceType(
  cards: readonly ShiftFairnessCardView[],
  serviceCategoryByPersonId: ReadonlyMap<string, PersonnelServiceCategory>,
): ShiftFairnessServiceSubgroupView[] {
  const bySubgroup = new Map<PersonnelServiceCategory, ShiftFairnessCardView[]>();
  for (const card of cards) {
    const category = serviceCategoryByPersonId.get(card.personId) ?? "unclassified";
    const bucket = bySubgroup.get(category);
    if (bucket) bucket.push(card);
    else bySubgroup.set(category, [card]);
  }

  const result: ShiftFairnessServiceSubgroupView[] = [];
  for (const key of SERVICE_SUBGROUP_ORDER) {
    const subCards = bySubgroup.get(key);
    if (!subCards || subCards.length === 0) continue;
    result.push({ key, label: personnelTypeGroupLabel(key), cards: subCards });
  }
  return result;
}
