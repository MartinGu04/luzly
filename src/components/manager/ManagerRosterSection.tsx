import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import type { ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";

interface ManagerRosterSectionProps {
  roster: ManagerPersonSummary[];
  current: ManagerHrefParams;
}

/** Quick person drill-down links -- the roster itself; the top `ManagerPersonSelector` covers the same action for a fast direct pick. */
export function ManagerRosterSection({ roster, current }: ManagerRosterSectionProps) {
  return (
    <Panel variant="panel">
      <h3 className="text-sm font-semibold text-foreground">צוות</h3>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {roster.map((person) => (
          <li key={person.id}>
            <Link
              href={buildManagerHref({ ...current, personId: person.id })}
              className="inline-flex items-center rounded-full bg-overlay-soft px-2.5 py-1 text-xs font-medium text-foreground transition-colors duration-200 hover:bg-overlay-strong"
            >
              {person.name}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
