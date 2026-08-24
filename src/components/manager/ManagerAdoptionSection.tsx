import { Avatar } from "@/components/ui/Avatar";
import { Panel } from "@/components/ui/Panel";
import type { AdoptionGroupView, AdoptionPersonRowView, ManagerAdoptionSectionView } from "@/lib/presentation/managerAdoption";

interface ManagerAdoptionSectionProps {
  view: ManagerAdoptionSectionView;
}

function PersonRow({ person }: { person: AdoptionPersonRowView }) {
  return (
    <li className="flex items-center gap-2.5 py-1.5">
      <Avatar name={person.personName} size="sm" avatarUrl={person.avatarUrl} />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">{person.personName}</span>
      {person.issueLabel ? (
        <span className="shrink-0 rounded-full bg-overlay-soft px-2 py-0.5 text-[11px] font-medium text-muted">
          {person.issueLabel}
        </span>
      ) : null}
    </li>
  );
}

/** Always-visible group -- both "needs a nudge" groups render this way, never behind a click: this is exactly what a manager opened the category to see. */
function NudgeGroup({ group }: { group: AdoptionGroupView }) {
  if (group.people.length === 0) return null;
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground">
        {group.label} <span className="font-normal text-muted-2">· {group.people.length}</span>
      </h4>
      <ul className="mt-1 divide-y divide-border">
        {group.people.map((person) => (
          <PersonRow key={person.personId} person={person} />
        ))}
      </ul>
    </div>
  );
}

/** Collapsed by default, regardless of size -- these people need nothing from the manager, so they stay quiet rather than competing visually with the two nudge groups above. */
function QuietGroup({ group }: { group: AdoptionGroupView }) {
  if (group.people.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-muted-2">
        {group.label} <span className="font-normal">· {group.people.length}</span>
      </summary>
      <ul className="mt-1.5 divide-y divide-border">
        {group.people.map((person) => (
          <PersonRow key={person.personId} person={person} />
        ))}
      </ul>
    </details>
  );
}

/**
 * The "התחברויות" category's per-person view -- reconciles the כ"א
 * roster against Supabase auth + push-subscription state (see
 * `ManagerAdoptionView`), grouped into exactly the buckets a manager acts
 * on differently:
 * - טרם נכנסו למערכת / נכנסו אך לא הפעילו התראות -- the two "needs a
 *   nudge" groups, always expanded (never noisy in the sense of being
 *   HIDDEN -- these are the reason the manager opened this category).
 * - מוכנים לקבל התראות -- collapsed by default: nothing to do here, so it
 *   never competes for attention with the two groups above.
 * - בעיית נתונים בכ״א -- kept structurally separate, framed as a roster
 *   problem to fix in כ"א, never as a person who "hasn't logged in".
 */
export function ManagerAdoptionSection({ view }: ManagerAdoptionSectionProps) {
  if (view.kind === "hidden" || view.kind === "unavailable") return null;

  const allEmpty =
    view.notLoggedInGroup.people.length === 0 &&
    view.notificationsOffGroup.people.length === 0 &&
    view.readyGroup.people.length === 0 &&
    view.dataIssueGroup.people.length === 0;

  if (allEmpty) {
    return (
      <Panel variant="compact" className="text-sm text-muted" data-testid="manager-adoption-section">
        אין אנשי צוות להצגה.
      </Panel>
    );
  }

  return (
    <Panel variant="panel" data-testid="manager-adoption-section">
      <div className="flex flex-col gap-4">
        <NudgeGroup group={view.notLoggedInGroup} />
        <NudgeGroup group={view.notificationsOffGroup} />
        <QuietGroup group={view.readyGroup} />
        <QuietGroup group={view.dataIssueGroup} />
      </div>
    </Panel>
  );
}
