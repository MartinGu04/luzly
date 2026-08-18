import type { ShiftFairnessServiceSubgroupView } from "@/lib/presentation/shiftFairnessServiceGroups";
import { ShiftFairnessCard } from "./ShiftFairnessCard";

interface ShiftFairnessRoleSectionProps {
  /** "אחמ״שים" / "טכנאים" -- the role comparison group, unchanged from `fairnessGroups.ts`. */
  label: string;
  count: number;
  /** Already service-type-grouped (`groupShiftFairnessCardsByServiceType`) -- empty subgroups already excluded, never re-grouped here. */
  subgroups: readonly ShiftFairnessServiceSubgroupView[];
}

/**
 * Shift Fairness ONLY (PR #4 follow-up) -- role group first (the prominent
 * heading, same weight `FairnessGroupSection` already used for both
 * modes), service-type subdivision second (small secondary headings). No
 * accordion, no collapse -- everything stays visible and scannable, which
 * is why this is a SEPARATE component from `FairnessGroupSection` (still
 * used unchanged for Duty Fairness, and here for the outer per-role
 * heading count is shown once, not per card) rather than a shared one
 * forced to serve two different shapes.
 *
 * Each subgroup keeps its own 2-col desktop / 1-col mobile card grid --
 * cards from different service types are never mixed into the same grid
 * row, so "who's סדיר vs. קבע vs. מילואים" stays visually unambiguous
 * without needing a heavier boxed/nested-card treatment.
 */
export function ShiftFairnessRoleSection({ label, count, subgroups }: ShiftFairnessRoleSectionProps) {
  return (
    <section>
      <h2 className="mb-3 text-[15px] font-semibold text-foreground">
        {label} <span className="font-normal text-muted-2">· {count}</span>
      </h2>
      <div className="flex flex-col gap-4">
        {subgroups.map((subgroup) => (
          <div key={subgroup.key}>
            <h3 className="mb-2 text-xs font-semibold text-muted-2">
              {subgroup.label} <span className="font-normal">· {subgroup.cards.length}</span>
            </h3>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {subgroup.cards.map((card) => (
                <ShiftFairnessCard key={card.key} view={card} />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
