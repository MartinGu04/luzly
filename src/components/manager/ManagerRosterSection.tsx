import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { Panel } from "@/components/ui/Panel";
import type { ManagerPersonSummary } from "@/lib/readModels/managerTypes";
import { buildManagerHref, type ManagerHrefParams } from "@/lib/presentation/managerUrl";
import { groupRosterHierarchy, type RosterTopGroup } from "@/lib/presentation/roster";

interface ManagerRosterSectionProps {
  roster: ManagerPersonSummary[];
  current: ManagerHrefParams;
}

/** Real capabilities, independent of which presentation group/subgroup the person landed in -- never a second source of truth, just `person.isSupervisor`/`isTechnician` echoed back. */
function CapabilityBadges({ person }: { person: ManagerPersonSummary }) {
  const badges: string[] = [];
  if (person.isSupervisor) badges.push('אחמ"ש');
  if (person.isTechnician) badges.push("טכנאי");
  if (badges.length === 0) return null;

  return (
    <span className="flex shrink-0 gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className="inline-flex items-center rounded-full bg-overlay-soft px-2 py-0.5 text-[11px] font-medium text-muted"
        >
          {badge}
        </span>
      ))}
    </span>
  );
}

function PersonRow({ person, current }: { person: ManagerPersonSummary; current: ManagerHrefParams }) {
  return (
    <li>
      <Link
        href={buildManagerHref({ ...current, personId: person.id })}
        className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors duration-200 hover:bg-overlay-soft"
      >
        <Avatar name={person.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{person.name}</span>
        <CapabilityBadges person={person} />
      </Link>
    </li>
  );
}

function groupCount(group: RosterTopGroup): number {
  return group.subgroups.length > 0
    ? group.subgroups.reduce((sum, subgroup) => sum + subgroup.people.length, 0)
    : group.people.length;
}

/**
 * "צוות" -- the manager roster's real hierarchy (Design Pass PR #21 §22):
 * top-level groups קבע/סדיר/מילואים/לא מסווג (rendered only when
 * non-empty, each with a count), and ONLY סדיר subdivides further into
 * אחמ״שים/טכנאים/אחרים. Every person appears EXACTLY ONCE. Uses the
 * existing `personnelType`/`isSupervisor`/`isTechnician` fields only -- no
 * new Google fetch, no re-derived flags. Each row drills down via
 * `buildManagerHref`, preserving the current range/problems URL state.
 */
export function ManagerRosterSection({ roster, current }: ManagerRosterSectionProps) {
  const groups = groupRosterHierarchy(roster);

  if (groups.length === 0) {
    return (
      <Panel variant="compact" className="text-sm text-muted">
        אין אנשי צוות להצגה.
      </Panel>
    );
  }

  return (
    <Panel variant="panel">
      <h3 className="text-[15px] font-bold text-foreground">צוות</h3>
      <div className="mt-3 flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.group}>
            <h4 className="text-[15px] font-semibold text-muted-2">
              {group.label} <span className="font-normal text-muted-2">· {groupCount(group)}</span>
            </h4>

            {group.subgroups.length > 0 ? (
              <div className="mt-2 flex flex-col gap-3">
                {group.subgroups.map((subgroup) => (
                  <div key={subgroup.group}>
                    <p className="text-[13px] font-semibold text-muted-2">
                      {subgroup.label} · {subgroup.people.length}
                    </p>
                    <ul className="mt-1">
                      {subgroup.people.map((person) => (
                        <PersonRow key={person.id} person={person} current={current} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ) : (
              <ul className="mt-2">
                {group.people.map((person) => (
                  <PersonRow key={person.id} person={person} current={current} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}
