import type { ReactNode } from "react";

interface FairnessGroupSectionProps {
  label: string;
  count: number;
  children: ReactNode;
}

/**
 * One Fairness comparison group's card grid (PR #4 §9/§10) -- the read
 * model's own group is rendered as-is, never re-grouped by new UI logic.
 * 2 cards per row on desktop/tablet (`sm:`), 1 compact card per row on
 * mobile -- never a spreadsheet/table layout at any width. A group with
 * zero rows is simply never rendered at all (the caller omits it), so
 * this component never has to handle -- or render -- an empty section.
 */
export function FairnessGroupSection({ label, count, children }: FairnessGroupSectionProps) {
  return (
    <section>
      <h2 className="mb-2 text-[15px] font-semibold text-foreground">
        {label} <span className="font-normal text-muted-2">· {count}</span>
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</ul>
    </section>
  );
}
